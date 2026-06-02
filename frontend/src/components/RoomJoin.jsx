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
          <div className="animate-pulse space-y-6">
            <div className="w-20 h-20 bg-white/20 rounded-full mx-auto flex items-center justify-center">
              <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
            </div>
            <div className="space-y-3">
              <div className="h-6 bg-white/20 rounded-lg w-3/4 mx-auto"></div>
              <div className="h-4 bg-white/10 rounded-lg w-1/2 mx-auto"></div>
            </div>
            <div className="h-12 bg-white/5 rounded-full w-full"></div>
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
