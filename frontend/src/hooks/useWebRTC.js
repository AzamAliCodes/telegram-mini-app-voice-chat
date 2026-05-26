import { useEffect, useRef, useCallback, useState } from 'react';
import { useRoomStore } from '../store/roomStore';

export function useWebRTC(roomId, userId, wsRef) {
  const pcs = useRef({});
  const localStream = useRef(null);
  const iceServers = useRef([{ urls: 'stun:stun.l.google.com:19302' }]);
  const { isMuted } = useRoomStore();
  const [streamReady, setStreamReady] = useState(false);

  useEffect(() => {
    async function fetchIceConfig() {
        try {
            let backendUrl = import.meta.env.PROD ? window.location.origin : (import.meta.env.VITE_BACKEND_URL || '');
            if (import.meta.env.DEV && !backendUrl) {
                console.warn("VITE_BACKEND_URL missing, skipping ICE config fetch");
                return;
            }
            const cleanUrl = backendUrl ? backendUrl.replace(/\/$/, '') : '';
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
        console.log("Local audio stream initialized successfully.");
        setStreamReady(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        // We set it to true anyway so they can at least hear others if mic fails
        setStreamReady(true); 
      }
    }

    startLocalStream();

    return () => {
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
      }
      Object.values(pcs.current).forEach(pc => pc.close());
      pcs.current = {};
    };
  }, []);

  // Sync mute state with local audio tracks
  useEffect(() => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted]);

  const createPeerConnection = useCallback((targetUserId) => {
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
      audio.autoplay = true;
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Autoplay prevented:", error);
          window.addEventListener('click', () => audio.play(), { once: true });
        });
      }
    };

    if (localStream.current) {
      console.log(`Adding local tracks to peer connection for ${targetUserId}`);
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current);
      });
    } else {
      console.warn("No local stream available to add to peer connection");
    }

    pcs.current[targetUserId] = pc;
    return pc;
  }, [wsRef, iceServers]);

  const handleOffer = useCallback(async (fromUserId, offer) => {
    const pc = createPeerConnection(fromUserId);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    wsRef?.current?.send(JSON.stringify({
      type: 'answer',
      target_user_id: fromUserId,
      answer: answer
    }));
  }, [createPeerConnection, wsRef]);

  const handleAnswer = useCallback(async (fromUserId, answer) => {
    const pc = pcs.current[fromUserId];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }, []);

  const handleIceCandidate = useCallback(async (fromUserId, candidate) => {
    const pc = pcs.current[fromUserId];
    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    }
  }, []);

  return { handleOffer, handleAnswer, handleIceCandidate, createPeerConnection, streamReady };
}
