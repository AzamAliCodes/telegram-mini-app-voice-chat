import { useEffect, useState, useMemo } from 'react';
import { useRoomStore } from '../store/roomStore';
import { useTelegram } from '../hooks/useTelegram';
import { useLiveKit } from '../hooks/useLiveKit';
import ParticipantList from './ParticipantList';
import ControlPanel from './ControlPanel';
import RoomJoin from './RoomJoin';
import ChatPanel from './ChatPanel';
import RoomEnded from './RoomEnded';
import RoomNotStarted from './RoomNotStarted';
import WelcomeView from './WelcomeView';
import Toast from './Toast';
import ChatBubbles from './ChatBubbles';
import SkeletonLoader from './SkeletonLoader';

export default function VoiceChat() {
  const { tg, user, enableClosingConfirmation } = useTelegram();
  const { participants, roomName, showChat, toggleChat, roomEnded, roomNotStarted } = useRoomStore();
  const [joined, setJoined] = useState(false);

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
    return id || null; // Return null if no room specified
  }, [tg]);

  useEffect(() => {
    enableClosingConfirmation();
  }, [enableClosingConfirmation]);

  const [fallbackId] = useState(() => `anon_${Math.floor(Math.random() * 1000000)}`);
  const userId = user?.id?.toString() || fallbackId;

  // We pass the stable roomId to useLiveKit so it can pre-fetch and handle state correctly.
  // The 'joined' flag inside the hook will control when the actual WebRTC connection happens.
  const { connectionStatus, resumeAudio, ws } = useLiveKit(roomId, userId, user, joined);

  // Global audio unlocker for the very first interaction
  useEffect(() => {
    const unlock = () => {
        resumeAudio();
    };
    window.addEventListener('click', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
        window.removeEventListener('click', unlock);
        window.removeEventListener('touchstart', unlock);
    };
  }, [resumeAudio]);

  // Proactively send leave event when app is closed/unloaded
  useEffect(() => {
    const handleUnload = () => {
        if (joined && roomId) {
            import('../utils/logger').then(({ sendLog }) => {
                sendLog(roomId, userId, user?.first_name || 'Anon', 'leave');
            });
        }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [joined, roomId, userId, user]);

  const onLeave = () => {
    if (joined && roomId) {
        import('../utils/logger').then(({ sendLog }) => {
            sendLog(roomId, userId, user?.first_name || 'Anon', 'leave');
            tg.close();
        });
    } else {
        tg.close();
    }
  };

  if (!roomId) {
    return <WelcomeView onClose={onLeave} />;
  }

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


  // Immediately hide skeleton if we are connected OR if we already see remote participants
  const hasRemoteParticipants = participants.length > 1;
  const isConnected = connectionStatus === 'Connected' || hasRemoteParticipants;

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-[#5B6BC0] via-[#4A3080] to-[#8B5A7A] p-4 font-sans text-white overflow-hidden">
      <div className="flex items-center justify-between mb-2 px-2">
        <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight">{roomName || 'Group Voice Chat'}</h1>
        </div>
        <div className="bg-white/10 px-3 py-1 rounded-full text-xs text-white/70">
          {participants.filter(p => String(p.user_id) !== String(userId)).length + 1} online
        </div>
      </div>

      <div className="flex-1 bg-white/15 backdrop-blur-xl border border-white/20 rounded-[24px] p-5 mb-6 overflow-y-auto relative">
        {!isConnected ? (
          <SkeletonLoader status={connectionStatus} />
        ) : showChat ? (
          <ChatPanel ws={ws} />
        ) : (
          <ParticipantList localUserId={userId} />
        )}
      </div>

      <ChatBubbles />
      <Toast />
      <ControlPanel onLeave={onLeave} onToggleChat={toggleChat} resumeAudio={resumeAudio} roomId={roomId} userId={userId} user={user} />
    </div>
  );
}

