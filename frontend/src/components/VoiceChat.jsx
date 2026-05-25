import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRoomStore } from '../store/roomStore';
import { useTelegram } from '../hooks/useTelegram';
import { useSignaling } from '../hooks/useSignaling';
import { useWebRTC } from '../hooks/useWebRTC';
import ParticipantList from './ParticipantList';
import ControlPanel from './ControlPanel';
import RoomJoin from './RoomJoin';
import ChatPanel from './ChatPanel';

export default function VoiceChat() {
  const { tg, user, enableClosingConfirmation } = useTelegram();
  const { participants, roomName, showChat, toggleChat } = useRoomStore();
  const [roomId, setRoomId] = useState(null);
  const [joined, setJoined] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    // Room ID = group chat ID, passed via startapp parameter
    // When opened via t.me/bot?startapp=<group_chat_id>, Telegram passes it
    // through WebApp.initDataUnsafe.start_param
    const startParam = tg?.initDataUnsafe?.start_param;
    
    // Fallback: also check URL query params and hash for compatibility
    const params = new URLSearchParams(window.location.search);
    const queryRoom = params.get('room');
    const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
    const hashRoom = hashParams.get('tgWebAppStartParam');
    
    const id = startParam || queryRoom || hashRoom;
    setRoomId(id);
    
    tg?.ready();
    tg?.expand();
    enableClosingConfirmation();
  }, [tg]);

  // User ID is the Telegram user ID (as string)
  const userId = user?.id?.toString();

  const { handleOffer, handleAnswer, handleIceCandidate, createPeerConnection } = useWebRTC(roomId, userId, wsRef);

  const onSignalingMessage = useCallback(async (message) => {
    const ws = wsRef.current;
    if (!ws) return;

    try {
      switch (message.type) {
        case 'offer':
          console.log("Received offer from", message.from_user_id);
          await handleOffer(message.from_user_id, message.offer);
          break;
        case 'answer':
          console.log("Received answer from", message.from_user_id);
          await handleAnswer(message.from_user_id, message.answer);
          break;
        case 'ice_candidate':
          await handleIceCandidate(message.from_user_id, message.candidate);
          break;
        case 'user_joined':
          console.log("User joined, creating offer for", message.from_user_id);
          // Wait for the new user to initialize their audio and websocket
          setTimeout(async () => {
            const pc = createPeerConnection(message.from_user_id);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({
              type: 'offer',
              target_user_id: message.from_user_id,
              offer: offer
            }));
          }, 1500);
          break;
      }
    } catch (e) {
      console.error("Signaling handler error:", e);
    }
  }, [handleOffer, handleAnswer, handleIceCandidate, createPeerConnection]);

  const ws = useSignaling(roomId, userId, user, onSignalingMessage);
  wsRef.current = ws;

  const onLeave = () => {
    tg.close();
  };

  if (!joined) {
    return <RoomJoin roomId={roomId} onJoin={() => setJoined(true)} />;
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-[#5B6BC0] via-[#4A3080] to-[#8B5A7A] p-4 font-sans text-white overflow-hidden">
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight">{roomName || 'Group Voice Chat'}</h1>
            <span className="text-[10px] text-white/50">Room: {roomId || 'None'}</span>
        </div>
        <div className="bg-white/10 px-3 py-1 rounded-full text-xs text-white/70">
          {participants.length + 1} online
        </div>
      </div>

      <div className="flex-1 bg-white/15 backdrop-blur-xl border border-white/20 rounded-[24px] p-5 mb-6 overflow-y-auto relative">
        {showChat ? <ChatPanel ws={ws} /> : <ParticipantList />}
      </div>

      <ControlPanel onLeave={onLeave} onToggleChat={toggleChat} />
    </div>
  );
}
