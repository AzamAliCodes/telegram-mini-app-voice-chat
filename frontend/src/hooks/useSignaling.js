import { useEffect, useRef, useState } from 'react';
import { useRoomStore } from '../store/roomStore';

export function useSignaling(roomId, userId, user, onMessage) {
  const [ws, setWs] = useState(null);
  const { addParticipant, removeParticipant, setParticipants, addMessage, isMuted } = useRoomStore();
  const wsRef = useRef(null);

  useEffect(() => {
    if (!roomId || !userId) return;

    let backendUrl = import.meta.env.VITE_BACKEND_URL || 'localhost:8000';
    
    // Remove protocol if present
    backendUrl = backendUrl.replace(/^https?:\/\//, '');
    backendUrl = backendUrl.replace(/^wss?:\/\//, '');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const initData = window.Telegram?.WebApp?.initData || '';
    const socket = new WebSocket(`${protocol}//${backendUrl}/ws/${roomId}/${userId}?init_data=${encodeURIComponent(initData)}`);

    socket.onopen = () => {
      console.log('WebSocket connected');
      socket.send(JSON.stringify({
        type: 'join',
        user_info: {
          first_name: user?.first_name || 'Anonymous',
          photo_url: user?.photo_url || ''
        }
      }));
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const { updateParticipant } = useRoomStore.getState();

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

      if (onMessage) {
        onMessage(message);
      }
    };


    socket.onclose = () => {
      console.log('WebSocket disconnected');
    };

    wsRef.current = socket;
    setWs(socket);

    return () => {
      socket.close();
    };
  }, [roomId, userId, user]);

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
