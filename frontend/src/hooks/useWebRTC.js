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
            // Use same-origin fallback for production
            let backendUrl = import.meta.env.PROD ? window.location.origin : (import.meta.env.VITE_BACKEND_URL || '');
            const cleanUrl = backendUrl ? backendUrl.replace(/\/$/, '') : '';
            
            // Try fetching from /api/ice-config (standard) or /ice-config (root fallback)
            const response = await fetch(`${cleanUrl}/api/ice-config`).catch(() => fetch(`${cleanUrl}/ice-config`));
            const config = await response.json();
            if (config.iceServers) {
                iceServers.current = config.iceServers;
                console.log("[WebRTC] ICE Servers loaded.");
            }
        } catch (err) {
            console.warn("[WebRTC] Using fallback STUN servers:", err);
        }
    }
    
    fetchIceConfig();

    async function startLocalStream() {
      try {
        localStream.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        
        localStream.current.getAudioTracks().forEach(track => {
            track.enabled = !isMuted;
        });
        
        console.log("[WebRTC] Local audio stream ready.");
        setStreamReady(true);
      } catch (err) {
        console.error("[WebRTC] Mic access denied:", err);
        setStreamReady(true); // Allow hearing others even if mic fails
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

    console.log(`[WebRTC] Creating PC for ${targetUserId}`);
    const pc = new RTCPeerConnection({
        iceServers: iceServers.current
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef?.current) {
        wsRef.current.send(JSON.stringify({
          type: 'ice_candidate',
          target_user_id: targetUserId,
          candidate: event.candidate
        }));
      }
    };

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received remote track from ${targetUserId}`);
      const remoteStream = event.streams[0];
      
      // Use a persistent audio element to avoid garbage collection
      let audio = document.getElementById(`audio-${targetUserId}`);
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `audio-${targetUserId}`;
        audio.autoplay = true;
        document.body.appendChild(audio);
      }
      
      audio.srcObject = remoteStream;
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn("[WebRTC] Autoplay blocked, waiting for user interaction.");
          // Mobile browsers require a click to start audio
          const enableAudio = () => {
             audio.play();
             window.removeEventListener('click', enableAudio);
          };
          window.addEventListener('click', enableAudio);
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
  }, [wsRef]);

  const handleOffer = useCallback(async (fromUserId, offer) => {
    console.log(`[WebRTC] Handling offer from ${fromUserId}`);
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
    console.log(`[WebRTC] Handling answer from ${fromUserId}`);
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
        console.error("[WebRTC] Error adding ICE candidate:", err);
      }
    }
  }, []);

  return { handleOffer, handleAnswer, handleIceCandidate, createPeerConnection, streamReady };
}
