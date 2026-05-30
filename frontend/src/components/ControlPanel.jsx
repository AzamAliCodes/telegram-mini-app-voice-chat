import { Volume2, VolumeX, Mic, MicOff, LogOut, MessageSquare } from 'lucide-react';
import { useRoomStore } from '../store/roomStore';
import clsx from 'clsx';

export default function ControlPanel({ onLeave, onToggleChat, resumeAudio }) {
  const { isMuted, isSpeakerOn, toggleMute, toggleSpeaker } = useRoomStore();

  const handleToggleMute = () => {
    resumeAudio();
    toggleMute();
  };

  const handleToggleSpeaker = () => {
    resumeAudio();
    toggleSpeaker();
  };

  const handleLeave = () => {
    resumeAudio();
    onLeave();
  };

  const handleToggleChat = () => {
    resumeAudio();
    onToggleChat();
  };

  return (
    <div className="flex justify-around items-center w-full pb-8 pt-4">
      <div className="flex flex-col items-center gap-2">
        <button 
          onClick={handleToggleSpeaker}
          className={clsx(
            "w-14 h-14 rounded-full flex items-center justify-center transition-colors",
            isSpeakerOn ? "bg-white/20 text-white" : "bg-white/10 text-white/50"
          )}
        >
          {isSpeakerOn ? <Volume2 size={24} /> : <VolumeX size={24} />}
        </button>
        <span className="text-[10px] text-white/70">Speaker</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button 
          onClick={handleToggleMute}
          className={clsx(
            "w-16 h-16 rounded-full flex items-center justify-center transition-colors shadow-lg",
            isMuted ? "bg-[#4A5D9E]/60 text-white" : "bg-sky-500/80 text-white"
          )}
        >
          {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
        </button>
        <span className="text-[10px] text-white/70">{isMuted ? 'Muted' : 'Unmuted'}</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button 
          onClick={handleLeave}
          className="w-14 h-14 rounded-full bg-[#E8622A] flex items-center justify-center text-white"
        >
          <LogOut size={24} />
        </button>
        <span className="text-[10px] text-white/70">Leave</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          onClick={handleToggleChat}
          className="w-14 h-14 rounded-full bg-[#26A69A] flex items-center justify-center text-white"
        >
          <MessageSquare size={24} />
        </button>
        <span className="text-[10px] text-white/70">Message</span>
      </div>
    </div>
  );
}

