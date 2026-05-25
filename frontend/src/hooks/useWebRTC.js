import { useEffect, useRef } from 'react';
import { useRoomStore } from '../store/roomStore';

export function useWebRTC(roomId, userId, wsRef) {
  const pcs = useRef({});
  const localStream = useRef(null);
  const iceServers = useRef([{ urls: 'stun:stun.l.google.com:19302' }]);
  const { isMuted } = useRoomStore();

  useEffect(() => {
    async function fetchIceConfig() {
        try {
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
            const cleanUrl = backendUrl.replace(/\/$/, ''); // Remove trailing slash
            const response = await fetch(`${cleanUrl}/api/ice-config`);
            const config = await response.json();
            if (config.iceServers) {
                iceServers.current = config.iceServers;
            }
        } catch (err) {
            console.error("Error fetching ICE config:", err);
        }
    }
    
    fetchIceConfig();

    async function startLocalStream() {
      try {
        localStream.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });
        localStream.current.getAudioTracks().forEach(track => {
            track.enabled = !isMuted;
        });
      } catch (err) {
        console.error("Error accessing microphone:", err);
      }
    }

    startLocalStream();

    return () => {
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
      }
      Object.values(pcs.current).forEach(pc => pc.close());
    };
  }, []);

  // ... (mute effect)

  // ... (speaking detection)

  const createPeerConnection = (targetUserId) => {
    if (pcs.current[targetUserId]) return pcs.current[targetUserId];

    const pc = new RTCPeerConnection({
        iceServers: iceServers.current
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsRef?.current?.send(JSON.stringify({
          type: 'ice_candidate',
          target_user_id: targetUserId,
          candidate: event.candidate
        }));
      }
    };

    pc.ontrack = (event) => {
      console.log(`Received remote track from ${targetUserId}`);
      const remoteStream = event.streams[0];
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true; // Use autoplay instead of manual play()
      
      // Handle browser autoplay policies
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Autoplay prevented. User interaction might be needed.", error);
          // Fallback: trigger play on next click
          window.addEventListener('click', () => audio.play(), { once: true });
        });
      }
    };

    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current);
      });
    }

    pcs.current[targetUserId] = pc;
    return pc;
  };

  return { handleOffer, handleAnswer, handleIceCandidate, createPeerConnection };
}
