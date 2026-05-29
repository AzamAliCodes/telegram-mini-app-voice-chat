import React from 'react';
import { useRoomStore } from '../store/roomStore';

export default function ChatBubbles() {
  const { liveMessages, showChat } = useRoomStore();

  // Don't show overlay bubbles if the full chat panel is open
  if (showChat || liveMessages.length === 0) return null;

  return (
    <div className="fixed bottom-32 left-4 right-4 z-40 pointer-events-none flex flex-col items-start gap-2">
      {liveMessages.map((msg) => (
        <div 
          key={msg.id}
          className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl rounded-bl-none px-4 py-2 max-w-[80%] animate-slide-up shadow-lg"
        >
          <div className="text-[10px] font-bold text-white/50 mb-0.5 uppercase tracking-wider">
            {msg.sender_name}
          </div>
          <div className="text-white text-sm leading-relaxed break-words">
            {msg.text}
          </div>
        </div>
      ))}
    </div>
  );
}
