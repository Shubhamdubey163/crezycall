/**
 * WebRTC — STUN + TURN, reliable signaling, remote audio/video play
 * Mobile: acquire mic/camera on a real user tap (iOS blocks delayed getUserMedia).
 */

async function requestUserMedia(callType) {
  if (!window.isSecureContext) {
    throw new Error('HTTPS chahiye mic/camera ke liye (http pe mobile allow nahi karta)');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Browser mic/camera support nahi karta — Chrome/Safari latest use karo');
  }

  const wantVideo = callType === 'video';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const attempts = [
    {
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: wantVideo
        ? {
            facingMode: 'user',
            width: { ideal: isMobile ? 480 : 640 },
            height: { ideal: isMobile ? 640 : 480 },
            frameRate: { ideal: 24, max: 30 },
          }
        : false,
    },
    {
      audio: true,
      video: wantVideo ? { facingMode: 'user' } : false,
    },
    {
      audio: true,
      video: wantVideo,
    },
  ];

  let lastErr;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Mic/Camera unavailable');
}

/** Call this inside a click/tap handler before starting the call (required on iOS). */
async function prepareCallMedia(callType) {
  if (window.__pendingLocalStream) {
    window.__pendingLocalStream.getTracks().forEach((t) => t.stop());
    window.__pendingLocalStream = null;
  }
  const stream = await requestUserMedia(callType);
  window.__pendingLocalStream = stream;
  window.__pendingCallType = callType;
  return stream;
}

function takePendingMedia(callType) {
  const stream = window.__pendingLocalStream;
  if (!stream) return null;
  if (window.__pendingCallType && callType && window.__pendingCallType !== callType) {
    return null;
  }
  window.__pendingLocalStream = null;
  window.__pendingCallType = null;
  return stream;
}

function createCallEngine({ socket, callId, isCaller, callType, elements, localStream: injectedStream }) {
  const { localVideo, remoteVideo, remoteAudio, onError, onConnected } = elements;
  const wantVideo = callType === 'video';

  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
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
  let localStream = injectedStream || takePendingMedia(callType) || null;
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

  window._retryCallMedia = async function () {
    try {
      if (!localStream || !localStream.getTracks().some((t) => t.readyState === 'live')) {
        localStream = await requestUserMedia(callType);
        if (localVideo) {
          localVideo.srcObject = localStream;
          localVideo.classList.toggle('hidden', !wantVideo);
          localVideo.muted = true;
          playEl(localVideo);
        }
        if (pc) {
          const senders = pc.getSenders();
          localStream.getTracks().forEach((track) => {
            const sender = senders.find((s) => s.track && s.track.kind === track.kind);
            if (sender) sender.replaceTrack(track);
            else pc.addTrack(track, localStream);
          });
        }
      }
      playEl(remoteVideo);
      playEl(remoteAudio);
      return true;
    } catch (e) {
      onError?.('Mic allow karo Settings → Safari/Chrome → Microphone: ' + (e.message || e.name));
      return false;
    }
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
      if (!localStream) {
        localStream = takePendingMedia(callType) || (await requestUserMedia(callType));
      }
    } catch (e) {
      const tip =
        e.name === 'NotAllowedError'
          ? 'Phone Settings mein browser ke liye Mic ON karo, phir "Enable Mic" dabao'
          : e.message;
      onError?.('Mic/Camera: ' + tip);
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
      if (s === 'failed') onError?.('Call failed to connect — try again (same WiFi try karo)');
      if (s === 'disconnected') console.warn('WebRTC disconnected');
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        onError?.('Network issue — dono devices same WiFi try karo ya mobile data');
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
