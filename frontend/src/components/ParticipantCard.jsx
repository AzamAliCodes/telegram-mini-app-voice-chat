import React from 'react';
import { MicOff } from 'lucide-react';
import clsx from 'clsx';

export default function ParticipantCard({ name, avatar, isMuted, isSpeaking }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/10 last:border-0">
      <div className="flex items-center gap-3">
        <div className={clsx(
          "relative w-14 h-14 rounded-full overflow-hidden border-2 border-transparent",
          isSpeaking && "animate-pulse border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.5)]"
        )}>
          {avatar ? (
            <img src={avatar} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-white/20 flex items-center justify-center text-white font-bold text-xl">
              {name?.[0]}
            </div>
          )}
        </div>
        <div>
          <h3 className="text-white font-semibold text-base">{name}</h3>
          <p className={clsx(
            "text-sm",
            isSpeaking ? "text-sky-400" : "text-sky-400/70"
          )}>
            {isSpeaking ? 'Speaking...' : (isMuted ? 'Muted' : 'Listening')}
          </p>
        </div>
      </div>
      {isMuted && <MicOff className="text-sky-400" size={20} />}
    </div>
  );
}
