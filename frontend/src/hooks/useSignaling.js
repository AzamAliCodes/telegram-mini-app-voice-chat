import { useEffect, useRef, useState } from 'react';
import { useRoomStore } from '../store/roomStore';

export function useSignaling(roomId, userId, user, onMessage) {
  const [ws, setWs] = useState(null);
  const { addParticipant, removeParticipant, setParticipants, addMessage } = useRoomStore();
  const wsRef = useRef(null);

  useEffect(() => {
    if (!roomId || !userId) return;

    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'localhost:8000';
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
          const updatedParticipants = useRoomStore.getState().participants.map(p =>
            p.user_id === message.from_user_id ? { ...p, is_speaking: message.is_speaking } : p
          );
          setParticipants(updatedParticipants);
          break;
        case 'mute':
          const mutedParticipants = useRoomStore.getState().participants.map(p =>
            p.user_id === message.from_user_id ? { ...p, is_muted: message.is_muted } : p
          );
          setParticipants(mutedParticipants);
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

  return ws;
}
