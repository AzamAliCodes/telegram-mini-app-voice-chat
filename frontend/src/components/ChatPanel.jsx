import React, { useState, useRef, useEffect } from 'react';
import { useRoomStore } from '../store/roomStore';
import { useTelegram } from '../hooks/useTelegram';
import { Send, X } from 'lucide-react';

export default function ChatPanel({ ws }) {
  const { messages, toggleChat } = useRoomStore();
  const { user } = useTelegram();
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || !ws) return;
    ws.send(JSON.stringify({
      type: 'chat_message',
      text: trimmed,
      sender_name: user?.first_name || 'Anonymous'
    }));
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-[#3A2570]/95 backdrop-blur-xl z-10 rounded-[24px]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <h2 className="text-white font-bold text-lg">Chat</h2>
        <button onClick={toggleChat} className="text-white/60 hover:text-white">
          <X size={22} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-white/30 text-sm text-center mt-10">No messages yet</p>
        )}
        {messages.map((msg) => {
          const isMine = msg.from_user_id === user?.id?.toString();
          return (
            <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
              {!isMine && (
                <span className="text-white/40 text-[10px] ml-1 mb-0.5">{msg.sender_name}</span>
              )}
              <div className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                isMine
                  ? 'bg-[#5B6BC0] text-white rounded-tr-md'
                  : 'bg-white/15 text-white/90 rounded-tl-md'
              }`}>
                {msg.text}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 p-3 border-t border-white/10">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 bg-white/10 rounded-full px-4 py-2.5 text-white text-sm placeholder-white/30 outline-none"
        />
        <button
          onClick={send}
          disabled={!text.trim()}
          className="w-10 h-10 rounded-full bg-[#5B6BC0] flex items-center justify-center disabled:opacity-40"
        >
          <Send size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
}
