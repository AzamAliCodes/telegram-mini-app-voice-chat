import React from 'react';
import { useRoomStore } from '../store/roomStore';

export default function ChatBubbles() {
  const { liveMessages, showChat } = useRoomStore();

  // Don't show overlay bubbles if the full chat panel is open
  if (showChat || liveMessages.length === 0) return null;

  return (
    <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-40 pointer-events-none flex flex-col items-center gap-2 w-full px-6">
      {liveMessages.map((msg) => (
        <div 
          key={msg.id}
          className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-[20px] px-5 py-2.5 max-w-full animate-slide-up shadow-2xl flex flex-col items-center"
        >
          <div className="text-[10px] font-bold text-white/40 mb-0.5 uppercase tracking-[0.1em]">
            {msg.sender_name}
          </div>
          <div className="text-white text-[15px] font-medium leading-tight text-center">
            {msg.text}
          </div>
        </div>
      ))}
    </div>
  );
}
