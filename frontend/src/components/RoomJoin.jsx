export default function RoomJoin({ roomId, onJoin, status }) {
  const isConnecting = status === 'Connecting...' || !status;
  const isConnected = status === 'Connected';

  const handleJoin = () => {
    if (!isConnected) return;
    // Standard trick to unlock audio context on mobile/Safari:
    const audio = new Audio();
    audio.play().catch(() => {});
    onJoin();
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-[#5B6BC0] via-[#4A3080] to-[#8B5A7A] p-6 font-sans text-white">
      <div className="bg-white/15 backdrop-blur-xl border border-white/20 rounded-[24px] p-8 w-full max-w-sm text-center shadow-2xl">
        {isConnecting ? (
          <div className="flex flex-col items-center justify-center space-y-8 py-6">
            <div className="relative w-28 h-28 flex items-center justify-center animate-float">
              <div className="absolute inset-0 rounded-full border-4 border-white/10"></div>
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-white/80 animate-spin-slow"></div>
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center animate-pulse-glow backdrop-blur-md shadow-xl">
                <span className="text-4xl drop-shadow-lg">🎙️</span>
              </div>
            </div>
            <div className="space-y-2 text-center">
              <h3 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 animate-pulse">
                Connecting...
              </h3>
              <p className="text-xs text-white/50 font-semibold tracking-widest uppercase">
                Securing channel
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="text-5xl mb-4 drop-shadow-lg">🎙️</div>
            <h2 className="text-2xl font-bold mb-2">Voice Chat</h2>
            <p className="text-white/60 text-sm mb-6 break-all">
              Room: {roomId || '...'}
            </p>
            <button
              onClick={handleJoin}
              disabled={!roomId || !isConnected}
              className={`w-full py-3 px-6 rounded-full font-semibold text-lg transition-all duration-300 ${
                isConnected 
                ? 'bg-white/20 hover:bg-white/30 active:scale-95 shadow-lg' 
                : 'bg-white/5 opacity-40 cursor-not-allowed'
              }`}
            >
              {isConnected ? 'Join Voice Chat' : 'Connecting...'}
            </button>
          </>
        )}
      </div>
      
      {/* Bottom status indicator */}
      <div className="mt-8 flex items-center gap-2 px-4 py-2 bg-black/20 rounded-full backdrop-blur-md">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400 animate-bounce'}`}></div>
        <span className="text-[10px] uppercase tracking-widest text-white/50 font-medium">
          Signal: {status || 'Initializing'}
        </span>
      </div>
    </div>
  );
}
