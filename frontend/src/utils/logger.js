export const sendLog = (roomId, userId, userName, event, extra = {}) => {
    try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL;
        if (!backendUrl || !roomId || !userId) return;
        
        const cleanUrl = backendUrl.replace(/\/$/, '');
        const url = `${cleanUrl}/api/client_event`;
        const payload = JSON.stringify({
            room_id: roomId,
            user_id: userId,
            user_name: userName,
            event,
            ...extra
        });

        if (event === 'leave' && navigator.sendBeacon) {
            // sendBeacon is much more reliable for closing/leaving events
            const blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon(url, blob);
        } else {
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            }).catch(() => {});
        }
    } catch {
        // Ignore errors to not disrupt voice chat
    }
};
