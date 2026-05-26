import { useEffect, useRef, useCallback, useState } from 'react';
import { useRoomStore } from '../store/roomStore';

export function useWebRTC(roomId, userId, wsRef) {
  const pcs = useRef({});
  const localStream = useRef(null);
  const iceServers = useRef([{ urls: 'stun:stun.l.google.com:19302' }]);
  const { isMuted, isSpeakerOn, roomEnded } = useRoomStore();
  const [streamReady, setStreamReady] = useState(false);

  useEffect(() => {
    if (roomEnded) {
        console.log("[WebRTC] Room ended, stopping all tracks and closing connections.");
        if (localStream.current) {
            localStream.current.getTracks().forEach(track => track.stop());
        }
        Object.values(pcs.current).forEach(pc => pc.close());
        pcs.current = {};
        document.querySelectorAll('audio[id^="audio-"]').forEach(el => el.remove());
    }
  }, [roomEnded]);

  useEffect(() => {
    async function fetchIceConfig() {
        try {
            let backendUrl = import.meta.env.PROD ? window.location.origin : (import.meta.env.VITE_BACKEND_URL || '');
            const cleanUrl = backendUrl ? backendUrl.replace(/\/$/, '') : '';
            
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
        console.log("[WebRTC] Requesting microphone access...");
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
      // Cleanup remote audio elements
      document.querySelectorAll('audio[id^="audio-"]').forEach(el => el.remove());
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

  // Sync speaker state with remote audio elements
  useEffect(() => {
    document.querySelectorAll('audio[id^="audio-"]').forEach(audio => {
        audio.muted = !isSpeakerOn;
    });
  }, [isSpeakerOn]);

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
      let remoteStream = event.streams[0];
      
      if (!remoteStream) {
          console.log(`[WebRTC] No stream found in ontrack, creating one for ${targetUserId}`);
          remoteStream = new MediaStream([event.track]);
      }
      
      let audio = document.getElementById(`audio-${targetUserId}`);
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `audio-${targetUserId}`;
        audio.autoplay = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
      }
      
      audio.srcObject = remoteStream;
      audio.muted = !isSpeakerOn;
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn("[WebRTC] Autoplay blocked, waiting for user interaction.");
          const enableAudio = () => {
             audio.play().catch(e => console.error("[WebRTC] Play failed after click:", e));
             window.removeEventListener('click', enableAudio);
          };
          window.addEventListener('click', enableAudio);
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE state with ${targetUserId}: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'failed') {
            pc.restartIce();
        }
    };

    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current);
      });
    } else {
      console.warn(`[WebRTC] Adding empty audio transceiver for ${targetUserId} as localStream is not ready`);
      pc.addTransceiver('audio', { direction: 'sendrecv' });
    }

    pcs.current[targetUserId] = pc;
    return pc;
  }, [wsRef, isSpeakerOn]);

  const handleOffer = useCallback(async (fromUserId, offer) => {
    console.log(`[WebRTC] Handling offer from ${fromUserId}`);
    const pc = createPeerConnection(fromUserId);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer({ offerToReceiveAudio: true });
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

  const handleUserLeft = useCallback((targetUserId) => {
    console.log(`[WebRTC] Cleaning up for user ${targetUserId}`);
    if (pcs.current[targetUserId]) {
      pcs.current[targetUserId].close();
      delete pcs.current[targetUserId];
    }
    const audio = document.getElementById(`audio-${targetUserId}`);
    if (audio) audio.remove();
  }, []);

  return { handleOffer, handleAnswer, handleIceCandidate, handleUserLeft, createPeerConnection, streamReady };
}
