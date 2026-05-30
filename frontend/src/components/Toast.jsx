import { useRoomStore } from '../store/roomStore';

export default function Toast() {
  const { notification } = useRoomStore();

  if (!notification) return null;

  const bgClass = notification.type === 'success' ? 'bg-green-500/80' : 
                  notification.type === 'warning' ? 'bg-yellow-500/80' : 
                  'bg-white/20';

  return (
    <div className={`fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full backdrop-blur-md border border-white/20 text-white text-sm font-medium shadow-lg transition-all animate-slide-up ${bgClass}`}>
      {notification.message}
    </div>
  );
}
