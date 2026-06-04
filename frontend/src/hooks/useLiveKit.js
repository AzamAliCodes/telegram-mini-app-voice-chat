import { useEffect, useState, useRef, useCallback } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { useRoomStore } from '../store/roomStore';

export function useLiveKit(roomId, userId, user, joined) {
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const roomRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const reconnectDelay = useRef(3000);
  const { setParticipants, setLocalSpeaking, isMuted, addMessage, addLiveMessage } = useRoomStore();

  const connectToLiveKit = useCallback(async () => {
    // Anti-DDoS: Prevent infinite rapid reconnection loops
    if (reconnectAttempts.current > 10) {
        console.error("Too many reconnection attempts. Standing down.");
        setConnectionStatus('Error (Too many attempts)');
        return;
    }

    try {
      setConnectionStatus('Generating Token...');
      
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      if (!backendUrl) {
          console.error("VITE_BACKEND_URL is missing!");
          setConnectionStatus('Error: VITE_BACKEND_URL not set in Netlify');
          return;
      }
      
      const cleanUrl = backendUrl.replace(/\/$/, '');
      console.log(`[LiveKit] Fetching token from: ${cleanUrl}/api/livekit/token`);

      // FIX: Ensure photo_url is actually sent in metadata
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
          setConnectionStatus('Throttled: Too many requests');
          return;
      }

      if (!response.ok) {
          const errText = await response.text().catch(() => 'Unknown error');
          console.error(`Backend Error (${response.status}):`, errText);
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

      const token = data.token;
      reconnectAttempts.current = 0;
      reconnectDelay.current = 3000; 

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
          
          // FIX: Improve audio publishing stability
          room.startAudio().catch(console.error);
          setTimeout(() => {
              if (room.state === 'connected') {
                  room.localParticipant.setMicrophoneEnabled(!useRoomStore.getState().isMuted).catch(console.error);
              }
          }, 1000);
          
          updateParticipants();
      });

      room.on(RoomEvent.Disconnected, () => {
          setConnectionStatus('Disconnected');
      });

      room.on(RoomEvent.Reconnecting, () => {
          setConnectionStatus('Reconnecting...');
      });

      // Participant events
      const updateParticipants = () => {
          const participants = [];
          
          // Add local
          participants.push({
              user_id: userId,
              first_name: user?.first_name || 'You',
              photo_url: user?.photo_url || '',
              is_muted: useRoomStore.getState().isMuted,
              is_speaking: room.localParticipant.isSpeaking
          });

          // Add remotes
          room.remoteParticipants.forEach((p) => {
              let p_photo = '';
              try {
                  const meta = JSON.parse(p.metadata || '{}');
                  p_photo = meta.photo_url || '';
              } catch {
                  // Fallback
              }

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

      room.on(RoomEvent.ParticipantConnected, updateParticipants);
      room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          updateParticipants();
          const isLocal = speakers.some(s => s.identity === userId);
          setLocalSpeaking(isLocal);
      });
      
      room.on(RoomEvent.TrackMuted, updateParticipants);
      room.on(RoomEvent.TrackUnmuted, updateParticipants);

      // Handle Data (Chat Messages)
      room.on(RoomEvent.DataReceived, (payload, participant) => {
          try {
              const msg = JSON.parse(new TextDecoder().decode(payload));
              if (msg.type === 'chat_message') {
                  const chatData = {
                      text: msg.text,
                      sender_name: participant?.name || 'Unknown',
                      from_user_id: participant?.identity,
                  };
                  addMessage(chatData);
                  addLiveMessage(chatData);
              }
          } catch {
              console.error('Failed to parse chat message');
          }
      });

      // Handle Remote Audio Tracks
      room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) {
              const element = track.attach();
              document.body.appendChild(element);
              // Ensure it plays
              element.play().catch(() => {
                  console.warn("Autoplay blocked, user interaction required to hear audio");
              });
          }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach(el => el.remove());
      });

      await room.connect(wsUrl, token);

    } catch (e) {
      console.error('LiveKit critical error:', e);
      setConnectionStatus(`Error: ${e.message || 'Connection failed'}`);
    }
  }, [roomId, userId, user, addLiveMessage, addMessage, setLocalSpeaking, setParticipants]);

  useEffect(() => {
      if (joined && roomId) {
          const timeout = setTimeout(() => connectToLiveKit(), 0);
          return () => clearTimeout(timeout);
      }
      return () => {
          if (roomRef.current) {
              roomRef.current.disconnect();
          }
      };
  }, [joined, roomId, connectToLiveKit]);

  useEffect(() => {
      if (roomRef.current && roomRef.current.state === 'connected') {
          roomRef.current.localParticipant.setMicrophoneEnabled(!isMuted).catch(console.error);
      }
  }, [isMuted]);

  const resumeAudio = () => {
      roomRef.current?.startAudio().catch(console.error);
  };

  const ws = {
      send: (dataStr) => {
          try {
              const data = JSON.parse(dataStr);
              if (data.type === 'chat_message') {
                  if (roomRef.current && roomRef.current.state === 'connected') {
                      const payload = new TextEncoder().encode(JSON.stringify(data));
                      roomRef.current.localParticipant.publishData(payload, 1);
                  }
              }
          } catch (error) {
              console.error('WS send error:', error);
          }
      }
  };

  return { connectionStatus, resumeAudio, ws };
}
