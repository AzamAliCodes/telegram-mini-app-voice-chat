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

  const flushOutgoingIce = useCallback(() => {
    const ws = wsRef?.current;
    const isReady = ws && (ws.readyState === WebSocket.OPEN || ws._isSSE);
    const pending = pendingOutgoing.current;
    if (Object.keys(pending).length === 0) return;
    
    // Don't flush if connection isn't ready
    if (!isReady) {
        console.log(`[WebRTC] Cannot flush candidates yet, connection not ready.`);
        return;
    }

    console.log(`[WebRTC] Flushing ${Object.values(pending).flat().length} pending candidates`);
    pendingOutgoing.current = {};
    Object.entries(pending).forEach(([targetId, candidates]) => {
      candidates.forEach(candidate => {
        ws.send(JSON.stringify({
          type: 'ice_candidate',
          target_user_id: targetId,
          candidate
        }));
      });
    });
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
        
        // CRITICAL FIX: Clone the stream for VAD. WebKit/Safari has a bug where routing 
        // a microphone stream into an AudioContext consumes it, causing WebRTC to send silence.
        const vadStream = stream.clone();
        
        analyser.current = audioContext.current.createAnalyser();
        analyser.current.fftSize = 2048; // Increased from 512 for better sampling
        analyser.current.smoothingTimeConstant = 0.4;
        microphone.current = audioContext.current.createMediaStreamSource(vadStream);
        microphone.current.connect(analyser.current);

        const pcmData = new Float32Array(analyser.current.fftSize);
        let speakingHistory = 0;
        let lastRmsLog = 0;

        vadInterval.current = setInterval(() => {
            const currentIsMuted = useRoomStore.getState().isMuted;
            
            // Health Check: Forcibly resume AudioContext if it's suspended
            if (!currentIsMuted && audioContext.current?.state === 'suspended') {
                audioContext.current.resume().catch(() => {});
            }

            if (currentIsMuted) {
                if (useRoomStore.getState().isLocalSpeaking) {
                    setLocalSpeaking(false);
                    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?._isSSE) {
                        wsRef.current.send(JSON.stringify({ type: 'speaking', is_speaking: false }));
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
            
            // Log RMS level every 2 seconds for debugging
            const now = Date.now();
            if (now - lastRmsLog > 2000) {
                console.log(`[WebRTC] VAD RMS Level: ${rms.toFixed(5)} (Threshold: 0.002)`);
                lastRmsLog = now;
            }

            // INCREASED SENSITIVITY: Threshold lowered from 0.005 to 0.002
            const isSpeakingNow = rms > 0.002;

            if (isSpeakingNow) {
                speakingHistory = Math.min(speakingHistory + 1, 8);
            } else {
                speakingHistory = Math.max(speakingHistory - 1, 0);
            }

            const currentlySpeaking = speakingHistory > 1;
            if (currentlySpeaking !== useRoomStore.getState().isLocalSpeaking) {
                console.log(`[WebRTC] Local VAD: ${currentlySpeaking ? 'Speaking' : 'Silent'}`);
                setLocalSpeaking(currentlySpeaking);
                if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?._isSSE) {
                    wsRef.current.send(JSON.stringify({ type: 'speaking', is_speaking: currentlySpeaking }));
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

    // Global audio unlocker for restrictive mobile environments (Telegram Mini Apps/iOS)
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
            // Find a sender that either has an audio track or is currently empty
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
        if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?._isSSE) {
          wsRef.current.send(JSON.stringify({
            type: 'offer',
            target_user_id: targetUserId,
            offer: pc.localDescription
          }));
        }
      } catch (err) {
        console.error("[WebRTC] Negotiation error:", err);
      } finally {
        makingOffer.current[targetUserId] = false;
      }
    };

    pc.onicecandidate = (event) => {
      const candidate = event.candidate;
      // Log candidate type for debugging (host vs srflx vs relay)
      if (candidate) {
          const type = candidate.candidate.split(' ')[7];
          if (type === 'relay') console.log(`[WebRTC] !!! RELAY candidate gathered for ${targetUserId} !!!`);
          else console.log(`[WebRTC] Local candidate: ${type}`);
      }
      
      const isReady = wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current._isSSE);
      if (isReady) {
        wsRef.current.send(JSON.stringify({
          type: 'ice_candidate',
          target_user_id: targetUserId,
          candidate: candidate
        }));
      } else {
        if (!pendingOutgoing.current[targetUserId]) {
          pendingOutgoing.current[targetUserId] = [];
        }
        pendingOutgoing.current[targetUserId].push(candidate);
        console.log(`[WebRTC] Queued outgoing ICE candidate for ${targetUserId} (Signaling not ready)`);
      }
    };

    pc.ontrack = (event) => {
      const trackKind = event.track.kind;
      console.log(`[WebRTC] Received remote ${trackKind} track from ${targetUserId}`);
      
      let remoteStream = event.streams[0];
      if (!remoteStream) {
          console.log(`[WebRTC] No stream found in ontrack, creating one for ${targetUserId}`);
          remoteStream = new MediaStream([event.track]);
      }
      
      let audio = document.getElementById(`audio-${targetUserId}`);
      if (!audio) {
        console.log(`[WebRTC] Creating new audio element for ${targetUserId}`);
        audio = document.createElement('audio');
        audio.id = `audio-${targetUserId}`;
        audio.autoplay = true;
        audio.playsInline = true;
        // Optimization: Fixed position and low opacity to prevent throttling while staying "visible" to the browser
        audio.style.position = 'fixed';
        audio.style.pointerEvents = 'none';
        audio.style.opacity = '0.01';
        audio.style.width = '1px';
        audio.style.height = '1px';
        document.body.appendChild(audio);
      }
      
      audio.srcObject = remoteStream;
      audio.muted = !isSpeakerOn;
      audio.volume = 1.0;
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
            console.log(`[WebRTC] Successfully playing audio from ${targetUserId}`);
        }).catch((e) => {
          console.warn(`[WebRTC] Autoplay blocked for ${targetUserId}:`, e);
          // If blocked, the global interaction unlocker will catch it
        });
      }
    };



    pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`[WebRTC] ICE state with ${targetUserId}: ${state}`);
        
        if (state === 'failed' || state === 'disconnected') {
            if (restartTimers.current[targetUserId]) clearTimeout(restartTimers.current[targetUserId]);
            
            // Give 'disconnected' 5 seconds to recover, 'failed' restarts immediately
            const delay = state === 'failed' ? 0 : 5000;
            
            restartTimers.current[targetUserId] = setTimeout(async () => {
                if (pcs.current[targetUserId] && (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected')) {
                    console.log(`[WebRTC] ICE ${state} for ${targetUserId}, attempting restart...`);
                    try {
                        if (pc.restartIce) {
                            pc.restartIce();
                        } else {
                            // Fallback for older browsers
                            makingOffer.current[targetUserId] = true;
                            await pc.setLocalDescription();
                            if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?._isSSE) {
                                wsRef.current.send(JSON.stringify({
                                    type: 'offer',
                                    target_user_id: targetUserId,
                                    offer: pc.localDescription
                                }));
                            }
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

    // Always create an audio transceiver to ensure consistent m-line ordering.
    // If we have a track already, we'll add it now.
    const audioTrack = localStream.current?.getAudioTracks()[0];
    if (audioTrack) {
        pc.addTrack(audioTrack, localStream.current);
    } else {
        console.warn(`[WebRTC] Adding empty audio transceiver for ${targetUserId} as localStream is not ready`);
        pc.addTransceiver('audio', { direction: 'sendrecv' });
    }

    pcs.current[targetUserId] = pc;
    return pc;
  }, [wsRef, isSpeakerOn, userId]); // Added userId to dependencies for polite logic

  const handleOffer = useCallback(async (fromUserId, offer) => {
    console.log(`[WebRTC] Handling offer from ${fromUserId}`);
    const pc = createPeerConnection(fromUserId);
    if (!pc) {
        console.error(`[WebRTC] Failed to create or retrieve PC for ${fromUserId}`);
        return;
    }
    
    try {
        const isPolite = String(userId) < String(fromUserId);
        const offerCollision = (makingOffer.current[fromUserId] || pc.signalingState !== 'stable');
        
        ignoreOffer.current[fromUserId] = !isPolite && offerCollision;
        if (ignoreOffer.current[fromUserId]) {
            console.warn(`[WebRTC] Ignoring offer collision from ${fromUserId} (impolite)`);
            return;
        }

        isSettingRemoteDescription.current[fromUserId] = true;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        isSettingRemoteDescription.current[fromUserId] = false;

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?._isSSE) {
          wsRef.current.send(JSON.stringify({
            type: 'answer',
            target_user_id: fromUserId,
            answer: pc.localDescription
          }));
        }

        if (pendingCandidates.current[fromUserId]) {
            console.log(`[WebRTC] Processing ${pendingCandidates.current[fromUserId].length} queued candidates for ${fromUserId}`);
            for (const cand of pendingCandidates.current[fromUserId]) {
                try {
                    if (cand) {
                        await pc.addIceCandidate(new RTCIceCandidate(cand));
                    } else {
                        await pc.addIceCandidate(null);
                    }
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
  }, [createPeerConnection, userId, wsRef]);

  const handleAnswer = useCallback(async (fromUserId, answer) => {
    console.log(`[WebRTC] Handling answer from ${fromUserId}`);
    const pc = pcs.current[fromUserId];
    if (pc) {
      try {
        isSettingRemoteDescription.current[fromUserId] = true;
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        isSettingRemoteDescription.current[fromUserId] = false;
        
        if (pendingCandidates.current[fromUserId]) {
            console.log(`[WebRTC] Processing ${pendingCandidates.current[fromUserId].length} queued candidates for ${fromUserId}`);
            for (const cand of pendingCandidates.current[fromUserId]) {
                try {
                    if (cand) {
                        await pc.addIceCandidate(new RTCIceCandidate(cand));
                    } else {
                        await pc.addIceCandidate(null);
                    }
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
        if (!candidate) {
            console.log(`[WebRTC] Received end-of-candidates for ${fromUserId}`);
            await pc.addIceCandidate(null);
        } else {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error("[WebRTC] Error adding ICE candidate:", err);
      }
    } else {
      if (!pendingCandidates.current[fromUserId]) {
          pendingCandidates.current[fromUserId] = [];
      }
      pendingCandidates.current[fromUserId].push(candidate);
      console.log(`[WebRTC] Queued ICE candidate for ${fromUserId} (${pendingCandidates.current[fromUserId].length} total)`);
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
    console.log("[WebRTC] Resuming audio context and elements...");
    if (audioContext.current && audioContext.current.state === 'suspended') {
        audioContext.current.resume().catch(console.error);
    }
    document.querySelectorAll('audio[id^="audio-"]').forEach(audio => {
        if (audio.srcObject) {
            audio.play().catch(() => {});
        }
    });
  }, []);

  return { handleOffer, handleAnswer, handleIceCandidate, handleUserLeft, createPeerConnection, streamReady, flushOutgoingIce, resumeAudio };
}

