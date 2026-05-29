import { create } from 'zustand';

export const useRoomStore = create((set) => ({
  participants: [],
  isMuted: true,
  isSpeakerOn: true,
  roomName: 'Voice Chat',
  messages: [],
  showChat: false,
  roomEnded: false,
  roomNotStarted: false,
  notification: null, // { message: string, type: 'info' | 'success' | 'warning' }

  setNotification: (notification) => {
    set({ notification });
    if (notification) {
      setTimeout(() => set((state) => {
        if (state.notification?.message === notification.message) {
            return { notification: null };
        }
        return state;
      }), 4000);
    }
  },

  setParticipants: (participants) => set({ participants }),
  setRoomEnded: (ended) => set({ roomEnded: ended }),
  setRoomNotStarted: (notStarted) => set({ roomNotStarted: notStarted }),
  addParticipant: (participant) => set((state) => {
    const newId = String(participant.user_id);
    const existing = state.participants.find(p => String(p.user_id) === newId);
    
    if (existing) {
      // Update existing participant info
      return {
        participants: state.participants.map(p => 
          String(p.user_id) === newId ? { ...p, ...participant } : p
        )
      };
    }
    return { participants: [...state.participants, { ...participant, user_id: newId }] };
  }),
  updateParticipant: (userId, updates) => set((state) => ({
    participants: state.participants.map(p => 
      String(p.user_id) === String(userId) ? { ...p, ...updates } : p
    )
  })),
  removeParticipant: (userId) => set((state) => ({
    participants: state.participants.filter(p => String(p.user_id) !== String(userId))
  })),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  toggleSpeaker: () => set((state) => ({ isSpeakerOn: !state.isSpeakerOn })),
  setRoomName: (name) => set({ roomName: name }),
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  toggleChat: () => set((state) => ({ showChat: !state.showChat })),
}));
