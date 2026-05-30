import { useEffect, useRef, useCallback, useState } from 'react';
import { useRoomStore } from '../store/roomStore';

export function useWebRTC(roomId, userId, wsRef) {
  const pcs = useRef({});
  const makingOffer = useRef({});
  const ignoreOffer = useRef({});
  const isSettingRemoteDescription = useRef({});
  const localStream = useRef(null);
  const pendingCandidates = useRef({});
  const pendingOutgoing = useRef({});
  const iceServers = useRef([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]);
  const { isMuted, isSpeakerOn, roomEnded, setLocalSpeaking } = useRoomStore();
  const [streamReady, setStreamReady] = useState(false);
  const restartTimers = useRef({});
  const vadInterval = useRef(null);
  const audioContext = useRef(null);
  const analyser = useRef(null);
  const microphone = useRef(null);

  const sendMessage = useCallback((msg) => {
    const ws = wsRef?.current;
    const isReady = ws && (ws.readyState === WebSocket.OPEN || ws._isSSE);
    
    if (isReady) {
        ws.send(JSON.stringify(msg));
    } else {
        console.log(`[WebRTC] Queuing outgoing message of type ${msg.type}`);
        if (!pendingOutgoing.current[msg.target_user_id]) {
            pendingOutgoing.current[msg.target_user_id] = [];
        }
        pendingOutgoing.current[msg.target_user_id].push(msg);
    }
  }, [wsRef]);

  const flushOutgoingMessages = useCallback(() => {
    const ws = wsRef?.current;
    const isReady = ws && (ws.readyState === WebSocket.OPEN || ws._isSSE);
    if (!isReady) return;

    const pending = pendingOutgoing.current;
    if (Object.keys(pending).length === 0) return;
    
    console.log(`[WebRTC] Flushing pending messages...`);
    Object.entries(pending).forEach(([targetId, messages]) => {
      messages.forEach(msg => {
        ws.send(JSON.stringify(msg));
      });
    });
    pendingOutgoing.current = {};
  }, [wsRef]);

  useEffect(() => {
    if (roomEnded) {
        console.log("[WebRTC] Room ended, stopping all tracks and closing connections.");
        if (localStream.current) {
            localStream.current.getTracks().forEach(track => track.stop());
        }
        Object.values(pcs.current).forEach(pc => pc.close());
        pcs.current = {};
        pendingCandidates.current = {};
        pendingOutgoing.current = {};
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
                const hasTurn = config.iceServers.some(s => s.urls && (Array.isArray(s.urls) ? s.urls.some(u => u.startsWith('turn:')) : s.urls.startsWith('turn:')));
                console.log(`[WebRTC] ICE Servers loaded. Relay (TURN) support: ${hasTurn ? 'YES' : 'NO'}`);
            }
        } catch (err) {
            console.warn("[WebRTC] Using fallback STUN servers:", err);
        }
    }
    
    fetchIceConfig();

    async function startLocalStream() {
      const { setNotification } = useRoomStore.getState();
      try {
        console.log("[WebRTC] Requesting microphone access...");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        
        localStream.current = stream;
        localStream.current.getAudioTracks().forEach(track => {
            track.enabled = !isMuted;
        });

        // Initialize VAD (Voice Activity Detection)
        audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
        
        const vadStream = stream.clone();
        
        analyser.current = audioContext.current.createAnalyser();
        analyser.current.fftSize = 2048;
        analyser.current.smoothingTimeConstant = 0.4;
        microphone.current = audioContext.current.createMediaStreamSource(vadStream);
        microphone.current.connect(analyser.current);

        const pcmData = new Float32Array(analyser.current.fftSize);
        let speakingHistory = 0;
        let lastRmsLog = 0;

        vadInterval.current = setInterval(() => {
            const currentIsMuted = useRoomStore.getState().isMuted;
            
            if (!currentIsMuted && audioContext.current?.state === 'suspended') {
                audioContext.current.resume().catch(() => {});
            }

            if (currentIsMuted) {
                if (useRoomStore.getState().isLocalSpeaking) {
                    setLocalSpeaking(false);
                    const ws = wsRef.current;
                    if (ws && (ws.readyState === WebSocket.OPEN || ws._isSSE)) {
                        ws.send(JSON.stringify({ type: 'speaking', is_speaking: false }));
                    }
                }
                return;
            }

            analyser.current.getFloatTimeDomainData(pcmData);
            let sumSquares = 0.0;
            for (const amplitude of pcmData) {
                sumSquares += amplitude * amplitude;
            }
            const rms = Math.sqrt(sumSquares / pcmData.length);
            
            const now = Date.now();
            if (now - lastRmsLog > 2000) {
                lastRmsLog = now;
            }

            const isSpeakingNow = rms > 0.002;

            if (isSpeakingNow) {
                speakingHistory = Math.min(speakingHistory + 1, 8);
            } else {
                speakingHistory = Math.max(speakingHistory - 1, 0);
            }

            const currentlySpeaking = speakingHistory > 1;
            if (currentlySpeaking !== useRoomStore.getState().isLocalSpeaking) {
                setLocalSpeaking(currentlySpeaking);
                const ws = wsRef.current;
                if (ws && (ws.readyState === WebSocket.OPEN || ws._isSSE)) {
                    ws.send(JSON.stringify({ type: 'speaking', is_speaking: currentlySpeaking }));
                }
            }
        }, 100);

        
        console.log("[WebRTC] Local audio stream & VAD ready.");
        setStreamReady(true);
      } catch (err) {
        console.error("[WebRTC] Mic access denied:", err);
        setNotification({ 
            message: "Microphone access denied. Please check app permissions and try again.", 
            type: "warning" 
        });
        setStreamReady(true);
      }
    }


    startLocalStream();

    const unlockAudio = () => {
        document.querySelectorAll('audio[id^="audio-"]').forEach(audio => {
            if (audio.paused && !audio.muted) {
                audio.play().catch(() => {});
            }
        });
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      if (vadInterval.current) clearInterval(vadInterval.current);
      if (microphone.current) microphone.current.disconnect();
      if (audioContext.current && audioContext.current.state !== 'closed') {
          audioContext.current.close().catch(console.error);
      }
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
      }

      Object.values(pcs.current).forEach(pc => pc.close());
      pcs.current = {};
      pendingCandidates.current = {};
      pendingOutgoing.current = {};
      document.querySelectorAll('audio[id^="audio-"]').forEach(el => el.remove());
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replace empty senders with real tracks when local stream becomes ready late
  useEffect(() => {
    if (streamReady && localStream.current) {
        const audioTrack = localStream.current.getAudioTracks()[0];
        if (!audioTrack) return;
        
        Object.entries(pcs.current).forEach(([targetId, pc]) => {
            const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio' || s.track === null);
            if (audioSender && !audioSender.track) {
                console.log(`[WebRTC] Replacing empty track for ${targetId}`);
                audioSender.replaceTrack(audioTrack);
            }
        });
    }
  }, [streamReady]);

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
        iceServers: iceServers.current,
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        sdpSemantics: 'unified-plan'
    });

    pc.onnegotiationneeded = async () => {
      try {
        console.log(`[WebRTC] Negotiation needed for ${targetUserId}`);
        makingOffer.current[targetUserId] = true;
        await pc.setLocalDescription();
        sendMessage({
          type: 'offer',
          target_user_id: targetUserId,
          offer: pc.localDescription
        });
      } catch (err) {
        console.error("[WebRTC] Negotiation error:", err);
      } finally {
        makingOffer.current[targetUserId] = false;
      }
    };

    pc.onicecandidate = (event) => {
      sendMessage({
        type: 'ice_candidate',
        target_user_id: targetUserId,
        candidate: event.candidate
      });
    };

    pc.ontrack = (event) => {
      const trackKind = event.track.kind;
      console.log(`[WebRTC] Received remote ${trackKind} track from ${targetUserId}`);
      
      let remoteStream = event.streams[0];
      if (!remoteStream) {
          remoteStream = new MediaStream([event.track]);
      }
      
      let audio = document.getElementById(`audio-${targetUserId}`);
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `audio-${targetUserId}`;
        audio.autoplay = true;
        audio.playsInline = true;
        audio.style.position = 'fixed';
        audio.style.pointerEvents = 'none';
        audio.style.opacity = '0.01';
        audio.style.width = '1px';
        audio.style.height = '1px';
        document.body.appendChild(audio);
      }
      
      if (audio.srcObject !== remoteStream) {
        audio.srcObject = remoteStream;
      }
      audio.muted = !isSpeakerOn;
      audio.volume = 1.0;
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    };



    pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`[WebRTC] ICE state with ${targetUserId}: ${state}`);
        
        if (state === 'failed' || state === 'disconnected') {
            if (restartTimers.current[targetUserId]) clearTimeout(restartTimers.current[targetUserId]);
            
            const delay = state === 'failed' ? 0 : 5000;
            
            restartTimers.current[targetUserId] = setTimeout(async () => {
                if (pcs.current[targetUserId] && (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected')) {
                    console.log(`[WebRTC] ICE ${state} for ${targetUserId}, attempting restart...`);
                    try {
                        if (pc.restartIce) {
                            pc.restartIce();
                        } else {
                            makingOffer.current[targetUserId] = true;
                            await pc.setLocalDescription();
                            sendMessage({
                                type: 'offer',
                                target_user_id: targetUserId,
                                offer: pc.localDescription
                            });
                        }
                    } catch (e) {
                        console.error("[WebRTC] ICE restart failed:", e);
                    } finally {
                        makingOffer.current[targetUserId] = false;
                    }
                }
            }, delay);
        } else if (state === 'connected' || state === 'completed') {
            if (restartTimers.current[targetUserId]) {
                clearTimeout(restartTimers.current[targetUserId]);
                delete restartTimers.current[targetUserId];
            }
        }
    };

    const audioTrack = localStream.current?.getAudioTracks()[0];
    if (audioTrack) {
        pc.addTrack(audioTrack, localStream.current);
    } else {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
    }

    pcs.current[targetUserId] = pc;
    return pc;
  }, [wsRef, isSpeakerOn, userId, sendMessage]);

  const handleOffer = useCallback(async (fromUserId, offer) => {
    console.log(`[WebRTC] Handling offer from ${fromUserId}`);
    const pc = createPeerConnection(fromUserId);
    if (!pc) return;
    
    try {
        const isPolite = String(userId) < String(fromUserId);
        const offerCollision = (makingOffer.current[fromUserId] || pc.signalingState !== 'stable');
        
        ignoreOffer.current[fromUserId] = !isPolite && offerCollision;
        if (ignoreOffer.current[fromUserId]) {
            console.warn(`[WebRTC] Ignoring offer collision from ${fromUserId}`);
            return;
        }

        isSettingRemoteDescription.current[fromUserId] = true;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        isSettingRemoteDescription.current[fromUserId] = false;

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        sendMessage({
          type: 'answer',
          target_user_id: fromUserId,
          answer: pc.localDescription
        });

        if (pendingCandidates.current[fromUserId]) {
            for (const cand of pendingCandidates.current[fromUserId]) {
                try {
                    await pc.addIceCandidate(cand ? new RTCIceCandidate(cand) : null);
                } catch (e) {
                    console.error("[WebRTC] Error adding queued candidate", e);
                }
            }
            delete pendingCandidates.current[fromUserId];
        }
    } catch (err) {
        console.error("[WebRTC] Error in handleOffer:", err);
    } finally {
        isSettingRemoteDescription.current[fromUserId] = false;
    }
  }, [createPeerConnection, userId, sendMessage]);

  const handleAnswer = useCallback(async (fromUserId, answer) => {
    console.log(`[WebRTC] Handling answer from ${fromUserId}`);
    const pc = pcs.current[fromUserId];
    if (pc) {
      try {
        isSettingRemoteDescription.current[fromUserId] = true;
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        isSettingRemoteDescription.current[fromUserId] = false;
        
        if (pendingCandidates.current[fromUserId]) {
            for (const cand of pendingCandidates.current[fromUserId]) {
                try {
                    await pc.addIceCandidate(cand ? new RTCIceCandidate(cand) : null);
                } catch (e) {
                    console.error("[WebRTC] Error adding queued candidate", e);
                }
            }
            delete pendingCandidates.current[fromUserId];
        }
      } catch (err) {
          console.error("[WebRTC] Error in handleAnswer:", err);
      } finally {
          isSettingRemoteDescription.current[fromUserId] = false;
      }
    }
  }, []);

  const handleIceCandidate = useCallback(async (fromUserId, candidate) => {
    const pc = pcs.current[fromUserId];
    const ready = pc && pc.remoteDescription && pc.remoteDescription.type && !isSettingRemoteDescription.current[fromUserId];
    
    if (ready) {
      try {
        await pc.addIceCandidate(candidate ? new RTCIceCandidate(candidate) : null);
      } catch (err) {
        console.error("[WebRTC] Error adding ICE candidate:", err);
      }
    } else {
      if (!pendingCandidates.current[fromUserId]) {
          pendingCandidates.current[fromUserId] = [];
      }
      pendingCandidates.current[fromUserId].push(candidate);
    }
  }, []);

  const handleUserLeft = useCallback((targetUserId) => {
    console.log(`[WebRTC] Cleaning up for user ${targetUserId}`);
    if (pcs.current[targetUserId]) {
      pcs.current[targetUserId].close();
      delete pcs.current[targetUserId];
    }
    if (pendingCandidates.current[targetUserId]) {
        delete pendingCandidates.current[targetUserId];
    }
    const audio = document.getElementById(`audio-${targetUserId}`);
    if (audio) audio.remove();
  }, []);

  const resumeAudio = useCallback(() => {
    if (audioContext.current && audioContext.current.state === 'suspended') {
        audioContext.current.resume().catch(console.error);
    }
    document.querySelectorAll('audio[id^="audio-"]').forEach(audio => {
        if (audio.srcObject) {
            audio.play().catch(() => {});
        }
    });
  }, []);

  return { handleOffer, handleAnswer, handleIceCandidate, handleUserLeft, createPeerConnection, streamReady, flushOutgoingMessages, resumeAudio };
}


