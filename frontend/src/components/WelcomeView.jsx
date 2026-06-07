import { MessageSquare, Users, ShieldCheck } from 'lucide-react';

export default function WelcomeView({ onClose }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-[#5B6BC0] via-[#4A3080] to-[#8B5A7A] p-6 font-sans text-white text-center">
      <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-[32px] p-8 w-full max-w-sm shadow-2xl flex flex-col items-center">
        {/* Animated App Icon */}
        <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-6 relative">
            <div className="absolute inset-0 rounded-full animate-pulse bg-white/5" />
            <span className="text-4xl">🎙️</span>
        </div>

        <h1 className="text-2xl font-bold mb-2 tracking-tight">Welcome to VC Bot</h1>
        <p className="text-white/60 text-sm mb-8 leading-relaxed px-2">
            Your premium destination for secure and crystal-clear group voice chats directly on Telegram.
        </p>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 gap-4 w-full mb-8 text-left">
            <div className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/5">
                <Users size={18} className="text-emerald-400" />
                <span className="text-xs font-medium">Join public & private group calls</span>
            </div>
            <div className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/5">
                <MessageSquare size={18} className="text-sky-400" />
                <span className="text-xs font-medium">Real-time chat & live notifications</span>
            </div>
            <div className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/5">
                <ShieldCheck size={18} className="text-purple-400" />
                <span className="text-xs font-medium">Anti-DDoS protected connection</span>
            </div>
        </div>

        <div className="w-full space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">How to join?</p>
            <div className="bg-emerald-500/10 text-emerald-300 text-xs py-3 px-4 rounded-xl border border-emerald-500/20">
                To enter a room, please open this app from a <b>group chat link</b> or use the bot commands.
            </div>
            
            <button
                onClick={onClose}
                className="w-full py-3.5 px-6 rounded-2xl bg-white/15 hover:bg-white/20 text-white font-bold text-sm transition-all active:scale-[0.98] border border-white/10 mt-4"
            >
                Return to Bot
            </button>
        </div>
      </div>
    </div>
  );
}
