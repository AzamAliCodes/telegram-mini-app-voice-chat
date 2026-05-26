import { useEffect, useRef, useState } from 'react';
import { useRoomStore } from '../store/roomStore';

const CONNECTION_TIMEOUT_MS = 8000;
const MAX_WS_FAILURES = 2;
const POLL_INTERVAL_MS = 1500; // Poll every 1.5 seconds

export function useSignaling(roomId, userId, user, onMessage) {
  const [ws, setWs] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const { addParticipant, removeParticipant, setParticipants, addMessage, isMuted } = useRoomStore();
  const wsRef = useRef(null);
  const transportRef = useRef('ws'); // 'ws' | 'poll'
  const reconnectTimeout = useRef(null);
  const pingInterval = useRef(null);
  const connectTimeoutRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const wsFailCount = useRef(0);
  const httpUrlRef = useRef(import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000');

  // ── Build URLs once ────────────────────────────────────────────────
  function getUrls() {
    const wsEnv = import.meta.env.VITE_WS_URL;
    const backendEnv = import.meta.env.VITE_BACKEND_URL;

    // Use explicit absolute URL (same-origin) in production to ensure Netlify proxy is hit.
    // This avoids bugs where Telegram WebViews fail to resolve relative paths ('/api/...') 
    // when loaded via custom protocols (tg://) or aggressive caching.
    let httpBase = import.meta.env.PROD ? window.location.origin : (backendEnv || 'http://localhost:8000');
    httpBase = httpBase ? httpBase.replace(/\/+$/, '') : '';
    httpUrlRef.current = httpBase;

    let wsUrl;
    if (wsEnv) {
      wsUrl = wsEnv.replace(/\/+$/, '');
      if (!wsUrl.startsWith('wss://') && !wsUrl.startsWith('ws://')) {
        wsUrl = `wss://${wsUrl}`;
      }
    } else {
      const isSecure = httpBase.startsWith('https') || httpBase.includes('hf.space') || window.location.protocol === 'https:';
      const host = httpBase ? httpBase.replace(/^https?:\/\//, '') : window.location.host;
      wsUrl = `${isSecure ? 'wss:' : 'ws:'}//${host}`;
    }

    const finalWsUrl = `${wsUrl}/ws/${roomId}/${userId}`;
    return { wsUrl: finalWsUrl, httpBase };
  }

  // ── Shared message handler ─────────────────────────────────────────
  function handleIncomingMessage(message) {
    const { updateParticipant } = useRoomStore.getState();

    if (message.type === 'pong' || message.type === 'auth_ok') return;

    if (message.type === 'auth_failed') {
      console.error('[Signal] Auth rejected:', message.reason);
      setConnectionStatus('Auth Failed');
      return;
    }

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
      case 'room_ended':
        console.log("[Signal] Room ended by admin");
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.showAlert("The voice chat has been ended by an admin.", () => {
            window.Telegram.WebApp.close();
          });
        }
        break;
    }

    if (onMessage) onMessage(message);
  }

  // ── Send helper (works for both WS and HTTP polling) ───────────────
  function sendMessage(msg) {
    if (transportRef.current === 'ws') {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(msg));
      }
    } else {
      // Use absolute URL for all signal requests to bypass proxy issues
      const baseUrl = httpUrlRef.current;
      const url = `${baseUrl}/api/signal/${roomId}/${userId}`;

      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      }).catch(err => console.error('[Signal] HTTP send failed:', err));
    }
  }

  // ── Fake WS-like object for poll mode ──────────────────────────────
  function makePollWsShim() {
    return {
      readyState: WebSocket.OPEN,
      send: (data) => {
        const msg = typeof data === 'string' ? JSON.parse(data) : data;
        sendMessage(msg);
      },
      close: () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        // Notify server using absolute URL
        const baseUrl = httpUrlRef.current;
        fetch(`${baseUrl}/api/poll/${roomId}/${userId}/disconnect`, {
          method: 'POST',
        }).catch(() => {});
      },
      _isSSE: true,
    };
  }

  useEffect(() => {
    if (!roomId || !userId) return;

    let isMounted = true;
    let retryDelay = 2000;

    function connectWs() {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
      setConnectionStatus('Connecting (WS)...');
      transportRef.current = 'ws';

      const { wsUrl } = getUrls();
      console.log(`[Signal] WS connecting: ${wsUrl}`);

      let socket;
      try {
        socket = new WebSocket(wsUrl);
      } catch (err) {
        console.error('[Signal] WS constructor threw:', err);
        handleWsFailure();
        return;
      }

      connectTimeoutRef.current = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          console.warn('[Signal] WS timeout — aborting');
          socket.close();
        }
      }, CONNECTION_TIMEOUT_MS);

      socket.onopen = () => {
        if (!isMounted) return;
        clearTimeout(connectTimeoutRef.current);
        console.log('[Signal] WS opened — sending auth');
        setConnectionStatus('Authenticating...');
        const rawInitData = window.Telegram?.WebApp?.initData || '';
        socket.send(JSON.stringify({ type: 'auth', init_data: rawInitData }));
      };

      socket.onerror = (error) => {
        console.error('[Signal] WS error:', error);
        clearTimeout(connectTimeoutRef.current);
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'auth_ok') {
            console.log('[Signal] WS auth OK');
            wsFailCount.current = 0;
            setConnectionStatus('Connected');
            retryDelay = 2000;
            socket.send(JSON.stringify({
              type: 'join',
              user_info: {
                first_name: user?.first_name || 'Anonymous',
                photo_url: user?.photo_url || ''
              }
            }));
            pingInterval.current = setInterval(() => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'ping' }));
              }
            }, 25000);
            return;
          }
          handleIncomingMessage(message);
        } catch (err) {
          console.error('[Signal] WS parse error:', err);
        }
      };

      socket.onclose = (event) => {
        console.log(`[Signal] WS closed (code=${event.code})`);
        wsRef.current = null;
        clearTimeout(connectTimeoutRef.current);
        if (pingInterval.current) clearInterval(pingInterval.current);
        if (isMounted) {
          setWs(null);
          handleWsFailure();
        }
      };

      wsRef.current = socket;
      if (isMounted) setWs(socket);
    }

    function handleWsFailure() {
      wsFailCount.current += 1;
      console.log(`[Signal] WS failure #${wsFailCount.current} / ${MAX_WS_FAILURES}`);

      if (wsFailCount.current >= MAX_WS_FAILURES) {
        console.log('[Signal] WS failed — switching to HTTP polling');
        setConnectionStatus('Switching to HTTP...');
        reconnectTimeout.current = setTimeout(connectPolling, 500);
      } else {
        setConnectionStatus(`Disconnected - Retrying in ${retryDelay/1000}s`);
        reconnectTimeout.current = setTimeout(connectWs, retryDelay);
        retryDelay = Math.min(retryDelay * 1.5, 10000);
      }
    }

    async function connectPolling() {
      setConnectionStatus('Connecting (HTTP test version 2)...');
      transportRef.current = 'poll';

      const backendEnv = import.meta.env.VITE_BACKEND_URL || 'https://asdvffegrhgfh-vcbot-backend.hf.space';
      // In v2.4, we try direct connection to HF for polling, bypassing potentially broken Netlify proxy
      const baseUrl = backendEnv.replace(/\/$/, '');
      const connectUrl = `${baseUrl}/api/poll/${roomId}/${userId}/connect`;

      console.log(`[Signal] v2.4 HTTP connecting directly to: ${connectUrl}`);

      try {
        const connectRes = await fetch(connectUrl, {
          method: 'POST',
          mode: 'cors', // Explicitly enable CORS
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'join',
            user_info: {
              first_name: user?.first_name || 'Anonymous',
              photo_url: user?.photo_url || ''
            }
          }),
        });

        if (!connectRes.ok) {
          throw new Error(`Direct Connect failed: ${connectRes.status}`);
        }

        const initialData = await connectRes.json();
        if (initialData.initial_state) {
            setParticipants(initialData.initial_state);
        }

        console.log('[Signal] HTTP poll registered via Direct URL');
        setConnectionStatus('Connected (Direct HTTP)');

        const shim = makePollWsShim();
        wsRef.current = shim;
        if (isMounted) setWs(shim);

        pollIntervalRef.current = setInterval(async () => {
          try {
            const res = await fetch(`${baseUrl}/api/poll/${roomId}/${userId}`, { mode: 'cors' });
            if (!res.ok) throw new Error(`Poll ${res.status}`);
            const data = await res.json();
            if (data.messages && data.messages.length > 0) {
              for (const msg of data.messages) {
                handleIncomingMessage(msg);
              }
            }
          } catch (err) {
            console.error('[Signal] Poll fetch error:', err);
            if (isMounted) setConnectionStatus(`Poll Err: ${err.message.substring(0, 10)}`);
          }
        }, POLL_INTERVAL_MS);

        pingInterval.current = setInterval(() => {
          sendMessage({ type: 'ping' });
        }, 25000);

      } catch (err) {
        console.error('[Signal] Direct HTTP poll failed:', err);
        if (isMounted) {
          setConnectionStatus(`Direct Err: ${err.message.substring(0, 12)}`);
          // Final fallback: try Netlify proxy if direct failed
          reconnectTimeout.current = setTimeout(async () => {
             console.log('[Signal] Retrying via Netlify Proxy...');
             // (Logic to retry via proxy could go here)
          }, retryDelay);
          retryDelay = Math.min(retryDelay * 1.5, 10000);
        }
      }
    }

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
      if (pingInterval.current) clearInterval(pingInterval.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (wsRef.current) {
        if (wsRef.current._isSSE) {
          wsRef.current.close();
        } else if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }
      }
    };
  }, [roomId, userId]);

  useEffect(() => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws._isSSE)) {
      ws.send(JSON.stringify({ type: 'mute', is_muted: isMuted }));
    }
  }, [isMuted, ws]);

  return { ws, connectionStatus };
}
