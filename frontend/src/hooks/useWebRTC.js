import { useEffect, useRef } from 'react';
import { useRoomStore } from '../store/roomStore';

export function useWebRTC(roomId, userId, wsRef) {
  const pcs = useRef({});
  const localStream = useRef(null);
  const { isMuted } = useRoomStore();

  useEffect(() => {
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

  useEffect(() => {
    if (localStream.current) {
        localStream.current.getAudioTracks().forEach(track => {
            track.enabled = !isMuted;
        });
    }
  }, [isMuted]);

  useEffect(() => {
    if (!localStream.current) return;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(localStream.current);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let isSpeakingLocal = false;
    let silenceTimer = null;
    const SPEAKING_HOLD_MS = 1500;

    const checkSpeaking = () => {
      const ws = wsRef?.current;
      if (!ws) return;

      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const threshold = 15;

      if (average > threshold && !isMuted) {
        if (!isSpeakingLocal) {
          isSpeakingLocal = true;
          ws.send(JSON.stringify({ type: 'speaking', is_speaking: true }));
        }
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
      } else if (average <= threshold && isSpeakingLocal && !silenceTimer) {
        silenceTimer = setTimeout(() => {
          isSpeakingLocal = false;
          silenceTimer = null;
          ws.send(JSON.stringify({ type: 'speaking', is_speaking: false }));
        }, SPEAKING_HOLD_MS);
      }
    };

    const interval = setInterval(checkSpeaking, 200);

    return () => {
      clearInterval(interval);
      audioContext.close();
    };
  }, [localStream.current, isMuted]);

  const handleOffer = async (fromUserId, offer) => {
    const pc = createPeerConnection(fromUserId);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    wsRef?.current?.send(JSON.stringify({ type: 'answer', target_user_id: fromUserId, answer }));
  };

  const handleAnswer = async (fromUserId, answer) => {
    const pc = pcs.current[fromUserId];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  const handleIceCandidate = async (fromUserId, candidate) => {
    const pc = pcs.current[fromUserId];
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  const createPeerConnection = (targetUserId) => {
    if (pcs.current[targetUserId]) return pcs.current[targetUserId];

    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
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
      const remoteStream = event.streams[0];
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.play();
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
