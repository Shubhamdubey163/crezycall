/**
 * Call ring + message notification sounds + vibration
 */
const CallAlerts = (() => {
  let ringTimer = null;
  let audioCtx = null;

  function ctx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function tone(freq, duration, vol, type = 'sine') {
    try {
      const c = ctx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol ?? 0.25, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + duration);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + duration);
    } catch {
      /* ignore */
    }
  }

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  /** Classic phone ring — 2-tone pattern */
  function playCallRingBurst() {
    tone(440, 0.4, 0.28);
    setTimeout(() => tone(480, 0.4, 0.28), 450);
    setTimeout(() => tone(440, 0.4, 0.28), 900);
  }

  /** WhatsApp-style message ding */
  function playMessageSound() {
    tone(880, 0.08, 0.2);
    setTimeout(() => tone(1175, 0.12, 0.18), 90);
    setTimeout(() => tone(880, 0.06, 0.12), 200);
  }

  return {
    unlock() {
      ctx();
    },

    startRinging() {
      this.stopRinging();
      playCallRingBurst();
      vibrate([500, 200, 500, 200, 500, 200, 500]);
      ringTimer = setInterval(() => {
        playCallRingBurst();
        vibrate([400, 150, 400, 150, 400]);
      }, 2200);
    },

    stopRinging() {
      if (ringTimer) clearInterval(ringTimer);
      ringTimer = null;
    },

    onCallConnected() {
      this.stopRinging();
      tone(600, 0.1, 0.15);
      setTimeout(() => tone(800, 0.15, 0.12), 100);
    },

    onCallEnded(reason) {
      this.stopRinging();
      tone(350, 0.25, 0.2);
      setTimeout(() => tone(280, 0.3, 0.15), 280);
      vibrate([200, 100, 200, 100, 200]);
      if (reason && typeof toast === 'function') toast(reason);
    },

    onIncomingCall() {
      this.startRinging();
    },

    onOutgoingCall() {
      this.startRinging();
    },

    onNewMessage(preview) {
      playMessageSound();
      vibrate([100, 50, 100, 50, 150]);
      if (preview && typeof toast === 'function') toast(preview);
    },
  };
})();

window.CallAlerts = CallAlerts;

function unlockAudio() {
  CallAlerts.unlock();
  if (typeof window._retryCallAudio === 'function') window._retryCallAudio();
}

['click', 'touchend', 'touchstart'].forEach((ev) => {
  document.addEventListener(ev, unlockAudio, { capture: true, passive: true });
});
