/**
 * WebRTC — STUN + TURN, reliable signaling, remote audio/video play
 */
function createCallEngine({ socket, callId, isCaller, callType, elements }) {
  const { localVideo, remoteVideo, remoteAudio, onError, onConnected } = elements;
  const wantVideo = callType === 'video';

  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];

  let pc = null;
  let localStream = null;
  let startPromise = null;
  let remoteStream = null;
  const iceQueue = [];
  const signalQueue = [];
  let processing = false;

  function emitSignal(payload) {
    socket.emit('webrtc:signal', {
      callId,
      signal: payload,
      toRole: isCaller ? 'agent' : 'customer',
    });
  }

  function setMobileVideoAttrs(el) {
    if (!el) return;
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');
    el.playsInline = true;
    if ('disablePictureInPicture' in el) el.disablePictureInPicture = true;
  }

  function playEl(el) {
    if (!el) return;
    setMobileVideoAttrs(el);
    const tryPlay = () => el.play?.().catch(() => {});
    tryPlay();
    setTimeout(tryPlay, 300);
    setTimeout(tryPlay, 1000);
  }

  window._retryCallAudio = function () {
    playEl(remoteVideo);
    playEl(remoteAudio);
  };

  function attachRemote(stream) {
    if (!stream) return;
    remoteStream = stream;
    if (wantVideo && remoteVideo) {
      remoteVideo.srcObject = stream;
      remoteVideo.classList.remove('hidden');
      remoteVideo.muted = false;
      playEl(remoteVideo);
    }
    if (remoteAudio) {
      remoteAudio.srcObject = stream;
      remoteAudio.classList.remove('hidden');
      remoteAudio.volume = 1;
      remoteAudio.muted = false;
      playEl(remoteAudio);
    }
    onConnected?.();
  }

  async function flushIce() {
    while (iceQueue.length && pc?.remoteDescription) {
      const c = iceQueue.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.warn('ICE add failed', e);
      }
    }
  }

  async function ensurePeer() {
    if (pc) return pc;

    try {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: wantVideo
          ? {
              facingMode: 'user',
              width: { ideal: isMobile ? 480 : 640 },
              height: { ideal: isMobile ? 640 : 480 },
              frameRate: { ideal: 24, max: 30 },
            }
          : false,
      });
    } catch (e) {
      onError?.('Mic/Camera permission chahiye: ' + e.message);
      throw e;
    }

    if (localVideo) {
      localVideo.srcObject = localStream;
      localVideo.classList.toggle('hidden', !wantVideo);
      localVideo.muted = true;
      playEl(localVideo);
    }

    pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10,
    });

    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

    pc.ontrack = (e) => {
      const stream = e.streams?.[0] || new MediaStream([e.track]);
      attachRemote(stream);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        emitSignal({ candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') onConnected?.();
      if (s === 'failed') onError?.('Call failed to connect — try again');
      if (s === 'disconnected') console.warn('WebRTC disconnected');
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        onError?.('Network issue — check WiFi or mobile data on both sides');
      }
    };

    return pc;
  }

  async function runStart() {
    await ensurePeer();

    if (isCaller) {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: wantVideo,
      });
      await pc.setLocalDescription(offer);
      emitSignal({ sdp: pc.localDescription });
    }
  }

  async function applySignal(signal) {
    await ensurePeer();

    if (signal.sdp) {
      const desc = new RTCSessionDescription(signal.sdp);
      await pc.setRemoteDescription(desc);
      await flushIce();

      if (desc.type === 'offer' && !isCaller) {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        emitSignal({ sdp: pc.localDescription });
      }
    } else if (signal.candidate) {
      if (pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (e) {
          console.warn('ICE candidate', e);
        }
      } else {
        iceQueue.push(signal.candidate);
      }
    }
  }

  async function drainSignals() {
    if (processing) return;
    processing = true;
    try {
      while (signalQueue.length) {
        const sig = signalQueue.shift();
        await applySignal(sig);
      }
    } finally {
      processing = false;
    }
  }

  async function ensureStarted() {
    if (!startPromise) startPromise = runStart();
    await startPromise;
    await drainSignals();
  }

  async function start() {
    await ensureStarted();
  }

  async function handleSignal(signal) {
    signalQueue.push(signal);
    if (startPromise) {
      await startPromise;
      await drainSignals();
    } else {
      await ensureStarted();
    }
  }

  function stop() {
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    if (pc) pc.close();
    pc = null;
    localStream = null;
    remoteStream = null;
    startPromise = null;
    signalQueue.length = 0;
    iceQueue.length = 0;

    [localVideo, remoteVideo].forEach((v) => {
      if (v) {
        v.srcObject = null;
        v.classList.add('hidden');
      }
    });
    if (remoteAudio) {
      remoteAudio.srcObject = null;
      remoteAudio.classList.add('hidden');
    }
  }

  return { start, handleSignal, stop };
}
