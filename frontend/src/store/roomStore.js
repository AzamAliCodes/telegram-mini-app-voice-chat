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

  setParticipants: (participants) => set({ participants }),
  setRoomEnded: (ended) => set({ roomEnded: ended }),
  setRoomNotStarted: (notStarted) => set({ roomNotStarted: notStarted }),
  addParticipant: (participant) => set((state) => {
    // Prevent duplicates based on user_id (force string comparison)
    const newId = String(participant.user_id);
    if (state.participants.some(p => String(p.user_id) === newId)) {
      return state;
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
