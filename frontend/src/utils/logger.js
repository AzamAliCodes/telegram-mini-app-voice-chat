export const sendLog = (roomId, userId, userName, event, extra = {}) => {
    try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL;
        if (!backendUrl || !roomId || !userId) return;
        
        const cleanUrl = backendUrl.replace(/\/$/, '');
        fetch(`${cleanUrl}/api/client_event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room_id: roomId,
                user_id: userId,
                user_name: userName,
                event,
                ...extra
            })
        }).catch(() => {});
    } catch (e) {
        // Ignore errors to not disrupt voice chat
    }
};
