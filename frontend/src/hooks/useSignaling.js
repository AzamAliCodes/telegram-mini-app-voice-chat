import { useEffect, useRef, useState } from 'react';
import { useRoomStore } from '../store/roomStore';

export function useSignaling(roomId, userId, user, onMessage) {
  const [ws, setWs] = useState(null);
  const { addParticipant, removeParticipant, setParticipants, addMessage, isMuted } = useRoomStore();
  const wsRef = useRef(null);

  useEffect(() => {
    if (!roomId || !userId) return;

    // Prevent double connections if userId/roomId haven't changed
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    let backendUrl = import.meta.env.VITE_BACKEND_URL || 'localhost:8000';
    backendUrl = backendUrl.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    // Telegram initData is already a URL-encoded string of parameters
    const initData = window.Telegram?.WebApp?.initData || '';
    const wsUrl = `${protocol}//${backendUrl}/ws/${roomId}/${userId}?init_data=${encodeURIComponent(initData)}`;
    
    console.log(`Connecting to WebSocket: room=${roomId}, user=${userId}`);
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log(`WebSocket Connected to room ${roomId}`);
      // Send join event immediately
      socket.send(JSON.stringify({
        type: 'join',
        user_info: {
          first_name: user?.first_name || 'Anonymous',
          photo_url: user?.photo_url || ''
        }
      }));
    };

    socket.onmessage = (event) => {
      try {
          const message = JSON.parse(event.data);
          const { updateParticipant } = useRoomStore.getState();

          switch (message.type) {
            case 'room_state':
              console.log("Received room state:", message.participants);
              setParticipants(message.participants);
              break;
            case 'user_joined':
              console.log("Remote user joined:", message.user_info.first_name);
              // Force add the new participant immediately
              addParticipant({ user_id: message.from_user_id, ...message.user_info });
              break;
            case 'user_left':
              console.log("Remote user left:", message.from_user_id);
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
      } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
      }
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
      wsRef.current = null;
      setWs(null);
    };

    wsRef.current = socket;
    setWs(socket);

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [roomId, userId]); // Only reconnect if room or user ID changes

  useEffect(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'mute',
        is_muted: isMuted
      }));
    }
  }, [isMuted, ws]);

  return ws;
}
