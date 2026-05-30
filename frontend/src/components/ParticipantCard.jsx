import { MicOff, Mic } from 'lucide-react';
import clsx from 'clsx';

export default function ParticipantCard({ name, avatar, isMuted, isSpeaking }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0 transition-all duration-300">
      <div className="flex items-center gap-3">
        <div className={clsx(
          "relative w-14 h-14 rounded-full p-[2px] transition-all duration-500",
          isSpeaking ? "bg-gradient-to-tr from-sky-400 to-blue-500 shadow-[0_0_15px_rgba(56,189,248,0.4)]" : "bg-white/10"
        )}>
          <div className="w-full h-full rounded-full overflow-hidden bg-[#2a2d3e]">
            {avatar ? (
              <img src={avatar} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/80 font-bold text-xl uppercase">
                {name?.[0]}
              </div>
            )}
          </div>
          {isSpeaking && (
            <div className="absolute inset-0 rounded-full animate-ping bg-sky-400/30 -z-10" />
          )}
        </div>
        <div>
          <h3 className="text-white font-semibold text-base leading-tight">{name}</h3>
          <p className={clsx(
            "text-[12px] font-medium transition-colors duration-300",
            isSpeaking ? "text-sky-400" : (isMuted ? "text-white/30" : "text-sky-400/70")
          )}>
            {isSpeaking ? 'Speaking...' : (isMuted ? 'Muted' : 'Unmuted')}
          </p>
        </div>
      </div>
      <div className={clsx(
        "p-2 rounded-full transition-all duration-300",
        isMuted ? "bg-white/5" : "bg-sky-400/10"
      )}>
        {isMuted ? (
          <MicOff className="text-white/20" size={18} />
        ) : (
          <Mic className={clsx("transition-colors duration-300", isSpeaking ? "text-sky-400" : "text-sky-400/60")} size={18} />
        )}
      </div>
    </div>
  );
}


