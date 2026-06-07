import { useEffect, useState, useRef, useCallback } from 'react';
import { Room, RoomEvent, Track, DisconnectReason } from 'livekit-client';
import { useRoomStore } from '../store/roomStore';
import { sendLog } from '../utils/logger';

export function useLiveKit(roomId, userId, user, joined) {
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const roomRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const prefetchToken = useRef(null);
  const { setParticipants, addParticipant, removeParticipant, setLocalSpeaking, isMuted, setMessages, addMessage, addLiveMessage } = useRoomStore();

  // PRE-FETCH TOKEN OPTIMIZATION
  useEffect(() => {
      if (roomId && userId && !joined && !prefetchToken.current) {
          const backendUrl = import.meta.env.VITE_BACKEND_URL;
          if (!backendUrl) return;
          const cleanUrl = backendUrl.replace(/\/$/, '');
          
          fetch(`${cleanUrl}/api/livekit/token`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  room_id: roomId, 
                  user_id: userId, 
                  user_name: user?.first_name || 'Anon',
                  metadata: JSON.stringify({ 
                      username: user?.username || '',
                      photo_url: user?.photo_url || ''
                  })
              })
          })
          .then(res => res.json())
          .then(data => {
              if (data.status === 'ok') {
                  prefetchToken.current = data.token;
                  console.log("[LiveKit] Token pre-fetched successfully.");
              }
          })
          .catch(() => console.warn("[LiveKit] Token pre-fetch failed."));
      }
  }, [roomId, userId, user, joined]);

  const connectToLiveKit = useCallback(async () => {
    // Anti-DDoS: Prevent infinite rapid reconnection loops
    if (reconnectAttempts.current > 10) {
        console.error("Too many reconnection attempts. Standing down.");
        setConnectionStatus('Connection Failed');
        return;
    }

    try {
      setConnectionStatus('Connecting to VC...');
      
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      if (!backendUrl) {
          console.error("VITE_BACKEND_URL is missing!");
          setConnectionStatus('Error: VITE_BACKEND_URL not set');
          return;
      }
      
      const cleanUrl = backendUrl.replace(/\/$/, '');

      // CHAT HISTORY OPTIMIZATION: Fetch history while connecting
      fetch(`${cleanUrl}/api/room/${roomId}/history`)
          .then(res => res.json())
          .then(data => {
              if (data.status === 'success') {
                  setMessages(data.messages);
              }
          })
          .catch(() => console.warn("Failed to fetch chat history"));
      
      let token = prefetchToken.current;
      
      // If token wasn't pre-fetched in time, fetch it now
      if (!token) {
          console.log(`[LiveKit] Fetching token from: ${cleanUrl}/api/livekit/token`);

          const response = await fetch(`${cleanUrl}/api/livekit/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                room_id: roomId, 
                user_id: userId, 
                user_name: user?.first_name || 'Anon',
                metadata: JSON.stringify({ 
                    username: user?.username || '',
                    photo_url: user?.photo_url || ''
                })
            })
          });

          if (response.status === 429) {
              setConnectionStatus('Too many tries from this IP. Please exit and try again in 1 min.');
              return;
          }

          if (!response.ok) {
              setConnectionStatus(`Error: Backend returned ${response.status}`);
              return;
          }

          const data = await response.json();
          
          if (data.status === 'error') {
              setConnectionStatus(`Error: ${data.message}`);
              if (data.message === 'room_ended') {
                  useRoomStore.getState().setRoomEnded(true);
              } else if (data.message === 'room_not_started') {
                  useRoomStore.getState().setRoomNotStarted(true);
              }
              return;
          }
          token = data.token;
      }

      const wsUrl = import.meta.env.VITE_LIVEKIT_URL;
      if (!wsUrl) {
          console.error("VITE_LIVEKIT_URL is missing!");
          setConnectionStatus('Error: VITE_LIVEKIT_URL not set in Netlify');
          return;
      }
      
      console.log(`[LiveKit] Connecting to: ${wsUrl}`);
      const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          publishDefaults: {
              audioBitrate: 64_000,
              red: true, 
          }
      });
      roomRef.current = room;

      room.on(RoomEvent.Connected, () => {
          setConnectionStatus('Connected');
          sendLog(roomId, userId, user?.first_name || 'Anon', 'join');
          
          room.startAudio().catch(console.error);
          if (room.state === 'connected') {
              room.localParticipant.setMicrophoneEnabled(!useRoomStore.getState().isMuted).catch(console.error);
          }
          updateParticipants();
      });

      room.on(RoomEvent.Disconnected, (reason) => {
          if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
              setConnectionStatus('Joined from another device');
          } else {
              setConnectionStatus('Disconnected');
          }
          sendLog(roomId, userId, user?.first_name || 'Anon', 'leave');
      });

      room.on(RoomEvent.Reconnecting, () => {
          setConnectionStatus('Reconnecting...');
      });

      const updateParticipants = () => {
          const participants = [];
          participants.push({
              user_id: userId,
              first_name: user?.first_name || 'You',
              photo_url: user?.photo_url || '',
              is_muted: useRoomStore.getState().isMuted,
              is_speaking: room.localParticipant.isSpeaking
          });

          room.remoteParticipants.forEach((p) => {
              let p_photo = '';
              try {
                  const meta = JSON.parse(p.metadata || '{}');
                  p_photo = meta.photo_url || '';
              } catch {}

              participants.push({
                  user_id: p.identity,
                  first_name: p.name,
                  photo_url: p_photo,
                  is_muted: !p.isMicrophoneEnabled,
                  is_speaking: p.isSpeaking
              });
          });
          setParticipants(participants);
      };

      const { setNotification } = useRoomStore.getState();

      room.on(RoomEvent.ParticipantConnected, (participant) => {
          // Force UI to drop skeleton loader immediately
          setConnectionStatus('Connected');

          let p_photo = '';
          try {
              const meta = JSON.parse(participant.metadata || '{}');
              p_photo = meta.photo_url || '';
          } catch (e) {
              // Ignore invalid JSON in participant metadata
          }
          
          // Instant UI update
          addParticipant({
              user_id: participant.identity,
              first_name: participant.name,
              photo_url: p_photo,
              is_muted: !participant.isMicrophoneEnabled,
              is_speaking: participant.isSpeaking
          });

          setNotification({ 
              message: `${participant.name || 'Someone'} joined`, 
              type: 'success',
              photo_url: p_photo
          });
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
          let p_photo = '';
          try {
              const meta = JSON.parse(participant.metadata || '{}');
              p_photo = meta.photo_url || '';
          } catch (e) {
              // Ignore invalid JSON in participant metadata
          }

          // Instant UI update (bypass LiveKit SDK delay)
          removeParticipant(participant.identity);
          
          setNotification({ 
              message: `${participant.name || 'Someone'} left`, 
              type: 'info',
              photo_url: p_photo
          });
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          updateParticipants();
          const isLocal = speakers.some(s => s.identity === userId);
          setLocalSpeaking(isLocal);
      });
      
      room.on(RoomEvent.TrackMuted, updateParticipants);
      room.on(RoomEvent.TrackUnmuted, updateParticipants);

      room.on(RoomEvent.DataReceived, (payload, participant) => {
          try {
              const msg = JSON.parse(new TextDecoder().decode(payload));
              if (msg.type === 'chat_message') {
                  let p_photo = '';
                  if (participant) {
                      try {
                          const meta = JSON.parse(participant.metadata || '{}');
                          p_photo = meta.photo_url || '';
                      } catch (e) {
                          console.warn("Failed to parse participant metadata in message", e);
                      }
                  }

                  const chatData = {
                      text: msg.text,
                      sender_name: participant?.name || 'Unknown',
                      from_user_id: participant?.identity,
                      photo_url: p_photo
                  };
                  addMessage(chatData);
                  addLiveMessage(chatData);
              }
          } catch (e) {
              console.warn("Failed to parse incoming data packet", e);
          }
      });

      room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) {
              const element = track.attach();
              document.body.appendChild(element);
              element.play().catch((e) => {
                  console.warn("Autoplay block prevented audio playback", e);
              });
          }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach(el => el.remove());
      });

      await room.connect(wsUrl, token);
      
      if (room.state === 'connected') {
          setConnectionStatus('Connected');
      }

    } catch (e) {
      console.error('LiveKit critical error:', e);
      setConnectionStatus(`Error: ${e.message || 'Connection failed'}`);
    }
  }, [roomId, userId, user, addLiveMessage, addMessage, setLocalSpeaking, setParticipants, addParticipant, removeParticipant, setMessages]);

  useEffect(() => {
      if (joined && roomId) {
          // Resolve cascading render lint error by deferring state update to next tick
          const task = setTimeout(() => connectToLiveKit(), 0);
          return () => clearTimeout(task);
      }
      return () => {
          if (roomRef.current) {
              roomRef.current.disconnect();
          }
      };
  }, [joined, roomId, connectToLiveKit]);

  useEffect(() => {
      if (roomRef.current && roomRef.current.state === 'connected') {
          roomRef.current.localParticipant.setMicrophoneEnabled(!isMuted).catch((e) => {
              console.error("Failed to toggle microphone state", e);
          });
      }
  }, [isMuted]);

  const resumeAudio = () => {
      roomRef.current?.startAudio().catch((e) => {
          console.error("Failed to resume audio on user interaction", e);
      });
  };

  const ws = {
      send: (dataStr) => {
          try {
              const data = JSON.parse(dataStr);
              if (data.type === 'chat_message') {
                  if (roomRef.current && roomRef.current.state === 'connected') {
                      const payload = new TextEncoder().encode(JSON.stringify(data));
                      roomRef.current.localParticipant.publishData(payload, 1);
                      
                      const chatData = {
                          id: Date.now() + Math.random(),
                          text: data.text,
                          sender_name: data.sender_name || user?.first_name || 'You',
                          from_user_id: userId,
                          photo_url: user?.photo_url || ''
                      };
                      
                      // Instant local update
                      addMessage(chatData);
                      addLiveMessage(chatData);

                      // Persist to backend Redis history
                      const backendUrl = import.meta.env.VITE_BACKEND_URL;
                      if (backendUrl) {
                          const cleanUrl = backendUrl.replace(/\/$/, '');
                          fetch(`${cleanUrl}/api/room/${roomId}/message`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(chatData)
                          }).catch((e) => {
                              console.warn("Failed to persist message to history", e);
                          });
                      }
                  }
              }
          } catch (error) {
              console.error('WS send error:', error);
          }
      }
  };

  return { connectionStatus, resumeAudio, ws };
}

