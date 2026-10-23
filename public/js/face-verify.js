const FACE_STEPS = [
  { key: 'center', label: 'Look straight at camera', hint: 'Center your face' },
  { key: 'left', label: 'Turn face LEFT', hint: 'Slowly turn left' },
  { key: 'right', label: 'Turn face RIGHT', hint: 'Slowly turn right' },
  { key: 'up', label: 'Look UP', hint: 'Tilt head up' },
  { key: 'down', label: 'Look DOWN', hint: 'Tilt head down' },
];

function createFaceVerifier(container, onComplete) {
  let step = 0;
  let stream = null;
  const captures = {};

  container.innerHTML = `
    <div class="face-verify">
      <video id="fv-video" autoplay playsinline muted style="width:100%;border-radius:12px;background:#000"></video>
      <canvas id="fv-canvas" class="hidden"></canvas>
      <p id="fv-label" style="font-weight:700;margin:12px 0;font-size:1rem"></p>
      <p id="fv-hint" style="color:var(--muted);font-size:0.85rem;margin-bottom:12px"></p>
      <div class="face-progress" id="fv-progress"></div>
      <button type="button" class="btn btn-primary" id="fv-capture">Capture</button>
    </div>`;

  const video = container.querySelector('#fv-video');
  const canvas = container.querySelector('#fv-canvas');
  const label = container.querySelector('#fv-label');
  const hint = container.querySelector('#fv-hint');
  const progress = container.querySelector('#fv-progress');
  const btn = container.querySelector('#fv-capture');

  function renderProgress() {
    progress.innerHTML = FACE_STEPS.map(
      (s, i) =>
        `<span class="fv-dot ${i < step ? 'done' : ''} ${i === step ? 'active' : ''}">${i + 1}</span>`
    ).join('');
  }

  function showStep() {
    const s = FACE_STEPS[step];
    label.textContent = s.label;
    hint.textContent = s.hint;
    renderProgress();
    btn.textContent = step < FACE_STEPS.length - 1 ? 'Capture & Next' : 'Finish Verification';
  }

  async function startCamera() {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 480, height: 480 },
    });
    video.srcObject = stream;
  }

  function captureFrame() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  btn.onclick = () => {
    const key = FACE_STEPS[step].key;
    captures[key] = captureFrame();
    step += 1;
    if (step >= FACE_STEPS.length) {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      onComplete(captures);
      return;
    }
    showStep();
  };

  showStep();
  startCamera().catch(() => {
    label.textContent = 'Camera permission required';
  });

  return {
    stop: () => stream?.getTracks().forEach((t) => t.stop()),
  };
}
