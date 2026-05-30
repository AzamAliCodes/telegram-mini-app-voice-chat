import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRoomStore } from '../store/roomStore';
import { useTelegram } from '../hooks/useTelegram';
import { useSignaling } from '../hooks/useSignaling';
import { useWebRTC } from '../hooks/useWebRTC';
import ParticipantList from './ParticipantList';
import ControlPanel from './ControlPanel';
import RoomJoin from './RoomJoin';
import ChatPanel from './ChatPanel';
import RoomEnded from './RoomEnded';
import RoomNotStarted from './RoomNotStarted';
import Toast from './Toast';
import ChatBubbles from './ChatBubbles';

export default function VoiceChat() {
  const { tg, user, isReady, enableClosingConfirmation } = useTelegram();
  const { participants, roomName, showChat, toggleChat, roomEnded, roomNotStarted } = useRoomStore();
  const [joined, setJoined] = useState(false);
  const wsRef = useRef(null);

  const roomId = useMemo(() => {
    let id = tg?.initDataUnsafe?.start_param;
    if (!id) {
        const rawUrl = window.location.href;
        if (rawUrl.includes('tgWebAppStartParam=')) {
            id = rawUrl.split('tgWebAppStartParam=')[1].split('&')[0].split('#')[0];
        } else if (rawUrl.includes('room=')) {
            id = rawUrl.split('room=')[1].split('&')[0].split('#')[0];
        }
    }
    return id || 'default_room';
  }, [tg]);

  useEffect(() => {
    enableClosingConfirmation();
  }, [enableClosingConfirmation]);

  const [fallbackId] = useState(() => `anon_${Math.floor(Math.random() * 1000000)}`);
  const userId = user?.id?.toString() || fallbackId;

  // Only pass roomId to hooks if 'joined' AND Telegram SDK is ready,
  // preventing WebSocket connections before the mobile native bridge is up.
  const activeRoomId = (joined && isReady) ? roomId : null;

  const { handleOffer, handleAnswer, handleIceCandidate, handleUserLeft, createPeerConnection, flushOutgoingIce, resumeAudio } = useWebRTC(activeRoomId, userId, wsRef);

  // Global audio unlocker for the very first interaction
  useEffect(() => {
    const unlock = () => {
        resumeAudio();
        // We keep it active to catch late-arriving tracks, 
        // but we can remove it if we want to be more efficient.
    };
    window.addEventListener('click', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
        window.removeEventListener('click', unlock);
        window.removeEventListener('touchstart', unlock);
    };
  }, [resumeAudio]);

  const onSignalingMessage = useCallback(async (message) => {
    try {
      switch (message.type) {
        case 'offer':
          console.log("[VoiceChat] Received offer from", message.from_user_id);
          await handleOffer(message.from_user_id, message.offer);
          break;
        case 'answer':
          console.log("[VoiceChat] Received answer from", message.from_user_id);
          await handleAnswer(message.from_user_id, message.answer);
          break;
        case 'ice_candidate':
          await handleIceCandidate(message.from_user_id, message.candidate);
          break;
        case 'user_left':
          handleUserLeft(message.from_user_id);
          break;
        case 'user_joined': {
          console.log("[VoiceChat] User joined, creating connection for", message.from_user_id);
          createPeerConnection(message.from_user_id);
          break;
        }
      }
    } catch (e) {
      console.error("Signaling handler error:", e);
    }
  }, [handleOffer, handleAnswer, handleIceCandidate, createPeerConnection, handleUserLeft]);

  // Connect to signaling immediately once Telegram is ready to check room state (ended/not started)
  const signalingRoomId = isReady ? roomId : null;
  const { ws, connectionStatus } = useSignaling(signalingRoomId, userId, user, onSignalingMessage, joined);
  
  useEffect(() => {
    wsRef.current = ws;
    if (connectionStatus === 'Connected') {
        flushOutgoingIce();
    }
  }, [ws, flushOutgoingIce, connectionStatus]);

  const onLeave = () => {
    tg.close();
  };

  if (roomEnded) {
    return <RoomEnded onClose={onLeave} />;
  }

  if (roomNotStarted) {
    return <RoomNotStarted onClose={onLeave} />;
  }

  if (!joined) {
    return <RoomJoin roomId={roomId} onJoin={() => {
        setJoined(true);
        resumeAudio();
    }} />;
  }


  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-[#5B6BC0] via-[#4A3080] to-[#8B5A7A] p-4 font-sans text-white overflow-hidden">
      <div className="flex items-center justify-between mb-2 px-2">
        <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight">{roomName || 'Group Voice Chat'}</h1>
            <span className="text-[10px] text-white/50">{connectionStatus}</span>
        </div>
        <div className="bg-white/10 px-3 py-1 rounded-full text-xs text-white/70">
          {participants.filter(p => String(p.user_id) !== String(userId)).length + 1} online
        </div>
      </div>

      <div className="flex-1 bg-white/15 backdrop-blur-xl border border-white/20 rounded-[24px] p-5 mb-6 overflow-y-auto relative">
        {showChat ? <ChatPanel ws={ws} /> : <ParticipantList localUserId={userId} />}
      </div>

      <ChatBubbles />
      <Toast />
      <ControlPanel onLeave={onLeave} onToggleChat={toggleChat} resumeAudio={resumeAudio} />
    </div>
  );
}

