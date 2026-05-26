import { useEffect, useRef, useState } from 'react';
import { useRoomStore } from '../store/roomStore';

const CONNECTION_TIMEOUT_MS = 10000;
const MAX_WS_FAILURES = 2;
const POLL_INTERVAL_MS = 2000; 

export function useSignaling(roomId, userId, user, onMessage) {
  const [ws, setWs] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const { addParticipant, removeParticipant, setParticipants, addMessage, isMuted } = useRoomStore();
  const wsRef = useRef(null);
  const transportRef = useRef('ws');
  const reconnectTimeout = useRef(null);
  const pingInterval = useRef(null);
  const connectTimeoutRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const wsFailCount = useRef(0);
  
  const backendEnv = import.meta.env.VITE_BACKEND_URL || 'https://asdvffegrhgfh-vcbot-backend.hf.space';
  const httpUrlRef = useRef(backendEnv.replace(/\/$/, ''));

  // ── Shared message handler ─────────────────────────────────────────
  function handleIncomingMessage(message) {
    const { updateParticipant } = useRoomStore.getState();
    if (message.type === 'pong' || message.type === 'auth_ok') return;

    switch (message.type) {
      case 'room_state':
        setParticipants(message.participants);
        break;
      case 'user_joined':
        addParticipant({ user_id: message.from_user_id, ...message.user_info });
        break;
      case 'user_left':
        removeParticipant(message.from_user_id);
        break;
      case 'speaking':
        updateParticipant(message.from_user_id, { is_speaking: message.is_speaking });
        break;
      case 'mute':
        updateParticipant(message.from_user_id, { is_muted: message.is_muted });
        break;
      case 'chat_message':
        addMessage({
          id: Date.now() + Math.random(),
          from_user_id: message.from_user_id,
          sender_name: message.sender_name,
          text: message.text
        });
        break;
    }
    if (onMessage) onMessage(message);
  }

  // ── Send helper ────────────────────────────────────────────────────
  function sendMessage(msg) {
    if (transportRef.current === 'ws') {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(msg));
      }
    } else {
      const url = `${httpUrlRef.current}/api/signal/${roomId}/${userId}`;
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      }).catch(err => console.error('[Signal] HTTP send failed:', err));
    }
  }

  useEffect(() => {
    if (!roomId || !userId) return;
    let isMounted = true;

    function connectWs() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      setConnectionStatus('WS Connecting...');
      transportRef.current = 'ws';

      const wsEnv = import.meta.env.VITE_WS_URL || backendEnv.replace(/^https?:\/\//, '');
      const wsUrl = `${wsEnv.startsWith('ws') ? '' : 'wss://'}${wsEnv.replace(/\/$/, '')}/api/ws/${roomId}/${userId}`;

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
        setConnectionStatus('Authenticating...');
        socket.send(JSON.stringify({ type: 'auth', init_data: window.Telegram?.WebApp?.initData || '' }));
      };

      socket.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'auth_ok') {
          wsFailCount.current = 0;
          setConnectionStatus('Connected (WS)');
          socket.send(JSON.stringify({
            type: 'join',
            user_info: {
              first_name: user?.first_name || 'Anonymous',
              photo_url: user?.photo_url || ''
            }
          }));
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
      setConnectionStatus('Connecting (test version)...');
      transportRef.current = 'poll';
      
      const baseUrl = httpUrlRef.current;
      // We add a cache buster ?v= to force mobile to bypass old caches
      const connectUrl = `${baseUrl}/api/poll/${roomId}/${userId}/connect?cb=${Date.now()}`;

      try {
        const res = await fetch(connectUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'join',
            user_info: { first_name: user?.first_name || 'Anonymous', photo_url: user?.photo_url || '' }
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.initial_state) setParticipants(data.initial_state);

        setConnectionStatus('Connected (HTTP)');
        
        // Polling loop
        pollIntervalRef.current = setInterval(async () => {
          try {
            const pollRes = await fetch(`${baseUrl}/api/poll/${roomId}/${userId}?cb=${Date.now()}`);
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              pollData.messages?.forEach(handleIncomingMessage);
            }
          } catch {}
        }, POLL_INTERVAL_MS);

        wsRef.current = { send: (d) => sendMessage(JSON.parse(d)), close: () => clearInterval(pollIntervalRef.current), _isSSE: true };
        setWs(wsRef.current);

      } catch (err) {
        setConnectionStatus(`HTTP Error: ${err.message}`);
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

  useEffect(() => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws._isSSE)) {
      ws.send(JSON.stringify({ type: 'mute', is_muted: isMuted }));
    }
  }, [isMuted, ws]);

  return { ws, connectionStatus };
}
