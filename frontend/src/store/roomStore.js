import { create } from 'zustand';

export const useRoomStore = create((set) => ({
  participants: [],
  isMuted: true,
  isSpeakerOn: true,
  roomName: 'Voice Chat',
  messages: [],
  showChat: false,

  setParticipants: (participants) => set({ participants }),
  addParticipant: (participant) => set((state) => {
    // Prevent duplicates based on user_id
    if (state.participants.some(p => p.user_id === participant.user_id)) {
      return state;
    }
    return { participants: [...state.participants, participant] };
  }),
  updateParticipant: (userId, updates) => set((state) => ({
    participants: state.participants.map(p => 
      p.user_id === userId ? { ...p, ...updates } : p
    )
  })),
  removeParticipant: (userId) => set((state) => ({
    participants: state.participants.filter(p => p.user_id !== userId)
  })),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  toggleSpeaker: () => set((state) => ({ isSpeakerOn: !state.isSpeakerOn })),
  setRoomName: (name) => set({ roomName: name }),
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  toggleChat: () => set((state) => ({ showChat: !state.showChat })),
}));
