import React from 'react';
import ParticipantCard from './ParticipantCard';
import { useRoomStore } from '../store/roomStore';
import { useTelegram } from '../hooks/useTelegram';

export default function ParticipantList() {
  const { participants } = useRoomStore();
  const { user } = useTelegram();
  const isMuted = useRoomStore(state => state.isMuted);

  return (
    <div className="flex flex-col gap-1">
      {/* Local User First */}
      <ParticipantCard 
        name={user?.first_name || 'You'} 
        avatar={user?.photo_url} 
        isMuted={isMuted} 
        isSpeaking={false} 
      />
      
      {/* Divider */}
      {participants.length > 0 && <div className="h-px bg-white/5 my-2 mx-4" />}
{/* Remote Users */}
{participants
  .filter(p => String(p.user_id) !== String(user?.id))
  .map((p) => (
  <ParticipantCard 
    key={p.user_id} 
    name={p.first_name} 
    avatar={p.photo_url} 
    isMuted={p.is_muted} 
    isSpeaking={p.is_speaking} 
    onClick={() => openProfile(p.user_id)}
  />
))}

{participants.filter(p => String(p.user_id) !== String(user?.id)).length === 0 && (

        <div className="py-10 text-center flex flex-col items-center gap-2 opacity-30">
          <p className="text-sm font-medium">Waiting for others...</p>
          <p className="text-[10px]">Invite members to join this room</p>
        </div>
      )}
    </div>
  );
}
