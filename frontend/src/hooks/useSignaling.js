import { useEffect, useRef, useState } from 'react';
import { useRoomStore } from '../store/roomStore';

const CONNECTION_TIMEOUT_MS = 10000;
const MAX_WS_FAILURES = 2;
const POLL_INTERVAL_MS = 2000; 

export function useSignaling(roomId, userId, user, onMessage, shouldJoin = false) {
  const [ws, setWs] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const { addParticipant, removeParticipant, setParticipants, addMessage, isMuted, isSpeakerOn } = useRoomStore();
  const wsRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  const transportRef = useRef('ws');
  const hasJoinedRef = useRef(false);
  const reconnectTimeout = useRef(null);
  const pingInterval = useRef(null);
  const connectTimeoutRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const wsFailCount = useRef(0);
  
  const backendEnv = import.meta.env.VITE_BACKEND_URL || 'https://asdvffegrhgfh-vcbot-backend.hf.space';
  const httpUrlRef = useRef(backendEnv.replace(/\/$/, ''));

  // Keep onMessageRef up to date to avoid stale closures in effects
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Handle the 'join' signal when the UI says we are ready to join
  useEffect(() => {
    if (shouldJoin && !hasJoinedRef.current && wsRef.current) {
        console.log("[Signal] Triggering delayed join...");
        sendMessage({
            type: 'join',
            user_info: {
              first_name: user?.first_name || 'Anonymous',
              photo_url: user?.photo_url || '',
              is_muted: isMuted
            }
        });
        hasJoinedRef.current = true;
    }
  }, [shouldJoin, ws]);

  // ── Shared message handler ─────────────────────────────────────────
  function handleIncomingMessage(message) {
    const { updateParticipant, setRoomEnded, setRoomNotStarted, setNotification, participants } = useRoomStore.getState();
    if (message.type === 'pong' || message.type === 'auth_ok') return;

    switch (message.type) {
      case 'room_ended':
        console.log("[Signal] Room has been ended by admin.");
        setRoomEnded(true);
        break;
      case 'room_not_started':
        console.log("[Signal] Room is not active yet.");
        setRoomNotStarted(true);
        break;
      case 'room_state':
        setParticipants(message.participants);
        break;
      case 'user_joined':
        addParticipant({ user_id: message.from_user_id, ...message.user_info });
        setNotification({ message: `${message.user_info.first_name || 'Someone'} joined`, type: 'success' });
        break;
      case 'user_left':
        const leavingUser = participants.find(p => String(p.user_id) === String(message.from_user_id));
        removeParticipant(message.from_user_id);
        if (leavingUser) {
            setNotification({ message: `${leavingUser.first_name} left`, type: 'info' });
        }
        break;
      case 'speaking':
        updateParticipant(message.from_user_id, { is_speaking: message.is_speaking });
        break;
      case 'mute':
        console.log(`[Signal] Participant ${message.from_user_id} mute: ${message.is_muted}`);
        updateParticipant(message.from_user_id, { is_muted: message.is_muted });
        break;
      case 'speaker':
        console.log(`[Signal] Participant ${message.from_user_id} speaker on: ${message.is_speaker_on}`);
        break;
      case 'chat_message':
        addMessage({
          id: Date.now() + Math.random(),
          from_user_id: message.from_user_id,
          sender_name: message.sender_name,
          text: message.text
        });
        // Trigger live pop-up bubble
        useRoomStore.getState().addLiveMessage({
            sender_name: message.sender_name,
            text: message.text
        });
        break;
    }
    if (onMessageRef.current) onMessageRef.current(message);
  }

  // ── Send helper ────────────────────────────────────────────────────
  function sendMessage(msg) {
    if (transportRef.current === 'ws') {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(msg));
      }
    } else {
      const url = `${httpUrlRef.current}/signal/${roomId}/${userId}`;
      const fallbackUrl = `${httpUrlRef.current}/api/signal/${roomId}/${userId}`;
      
      fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      }).catch(() => {
         fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(msg),
         });
      });
    }
  }

  useEffect(() => {
    if (!roomId || !userId) return;
    let isMounted = true;
    hasJoinedRef.current = false; // Reset on room change

    function connectWs() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      setConnectionStatus('Connecting...');
      transportRef.current = 'ws';

      const wsHost = backendEnv.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const wsUrl = `wss://${wsHost}/ws/${roomId}/${userId}`;

      console.log(`[Signal] WS Connecting: ${wsUrl}`);
      let socket;
      try {
        socket = new WebSocket(wsUrl);
      } catch (err) {
        handleWsFailure();
        return;
      }

      connectTimeoutRef.current = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) socket.close();
      }, CONNECTION_TIMEOUT_MS);

      socket.onopen = () => {
        if (!isMounted) return;
        clearTimeout(connectTimeoutRef.current);
        socket.send(JSON.stringify({ type: 'auth', init_data: window.Telegram?.WebApp?.initData || '' }));
      };

      socket.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'auth_ok') {
          wsFailCount.current = 0;
          setConnectionStatus('Connected');
          
          // Only join if UI already says we are joined
          if (shouldJoin) {
            socket.send(JSON.stringify({
                type: 'join',
                user_info: {
                  first_name: user?.first_name || 'Anonymous',
                  photo_url: user?.photo_url || '',
                  is_muted: isMuted
                }
            }));
            hasJoinedRef.current = true;
          }

          pingInterval.current = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
          }, 25000);
          return;
        }
        handleIncomingMessage(msg);
      };

      socket.onclose = () => {
        wsRef.current = null;
        if (isMounted) handleWsFailure();
      };

      wsRef.current = socket;
      setWs(socket);
    }

    function handleWsFailure() {
      wsFailCount.current += 1;
      if (wsFailCount.current >= MAX_WS_FAILURES) {
        connectPolling();
      } else {
        reconnectTimeout.current = setTimeout(connectWs, 3000);
      }
    }

    async function connectPolling() {
      setConnectionStatus('Connecting...');
      transportRef.current = 'poll';
      
      const baseUrl = httpUrlRef.current;
      const connectUrl = `${baseUrl}/poll/${roomId}/${userId}/connect?cb=${Date.now()}`;

      try {
        const res = await fetch(connectUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: shouldJoin ? 'join' : 'ping', // Minimal message if not joining
            user_info: { first_name: user?.first_name || 'Anonymous', photo_url: user?.photo_url || '', is_muted: isMuted }
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        if (data.status === 'error' && data.message === 'room_ended') {
            useRoomStore.getState().setRoomEnded(true);
            setConnectionStatus('Room Ended');
            return;
        }

        if (data.status === 'error' && data.message === 'room_not_started') {
            useRoomStore.getState().setRoomNotStarted(true);
            setConnectionStatus('Inactive');
            return;
        }

        if (shouldJoin && data.initial_state) {
            setParticipants(data.initial_state);
            hasJoinedRef.current = true;
        }

        setConnectionStatus('Connected');
        
        pollIntervalRef.current = setInterval(async () => {
          try {
            const pollRes = await fetch(`${baseUrl}/poll/${roomId}/${userId}?cb=${Date.now()}`);
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              pollData.messages?.forEach(handleIncomingMessage);
            }
          } catch {}
        }, POLL_INTERVAL_MS);

        const pollWsShim = { 
            send: (d) => sendMessage(JSON.parse(d)), 
            close: () => clearInterval(pollIntervalRef.current), 
            readyState: WebSocket.OPEN,
            _isSSE: true 
        };
        wsRef.current = pollWsShim;
        setWs(pollWsShim);

      } catch (err) {
        setConnectionStatus(`Error: ${err.message}`);
        reconnectTimeout.current = setTimeout(connectPolling, 5000);
      }
    }

    connectWs();

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimeout.current);
      clearTimeout(connectTimeoutRef.current);
      clearInterval(pingInterval.current);
      clearInterval(pollIntervalRef.current);
      if (wsRef.current?.close) wsRef.current.close();
    };
  }, [roomId, userId]);

  // Sync mute state to server (only if joined)
  useEffect(() => {
    if (shouldJoin && ws && (ws.readyState === WebSocket.OPEN || ws._isSSE)) {
      console.log(`[Signal] Sending mute state: ${isMuted}`);
      ws.send(JSON.stringify({ type: 'mute', is_muted: isMuted }));
    }
  }, [isMuted, ws, shouldJoin]);

  // Sync speaker state to server (only if joined)
  useEffect(() => {
    if (shouldJoin && ws && (ws.readyState === WebSocket.OPEN || ws._isSSE)) {
      console.log(`[Signal] Sending speaker state: ${isSpeakerOn}`);
      ws.send(JSON.stringify({ type: 'speaker', is_speaker_on: isSpeakerOn }));
    }
  }, [isSpeakerOn, ws, shouldJoin]);

  return { ws, connectionStatus };
}
