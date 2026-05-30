export default function RoomJoin({ roomId, onJoin }) {
  const handleJoin = () => {
    // Standard trick to unlock audio context on mobile/Safari:
    // Play a silent or empty sound on the first user gesture.
    const audio = new Audio();
    audio.play().catch(() => {});
    onJoin();
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-[#5B6BC0] via-[#4A3080] to-[#8B5A7A] p-6 font-sans text-white">
      <div className="bg-white/15 backdrop-blur-xl border border-white/20 rounded-[24px] p-8 w-full max-w-sm text-center">
        <div className="text-5xl mb-4">🎙️</div>
        <h2 className="text-2xl font-bold mb-2">Voice Chat</h2>
        <p className="text-white/60 text-sm mb-6 break-all">
          Room: {roomId || '...'}
        </p>
        <button
          onClick={handleJoin}
          disabled={!roomId}
          className="w-full py-3 px-6 rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-lg transition-colors"
        >
          Join Voice Chat
        </button>
      </div>
    </div>
  );
}
