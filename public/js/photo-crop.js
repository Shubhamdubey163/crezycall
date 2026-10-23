/** Square crop with top bias so face stays visible in circular avatars */
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function cropPortraitForProfile(file, maxSize = 320) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Please choose an image file');
  }
  if (file.size > 8_000_000) {
    throw new Error('Photo must be under 8MB');
  }
  const img = await loadImageFromFile(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const size = Math.min(w, h);
  let sx;
  let sy;
  if (h >= w) {
    sx = (w - size) / 2;
    sy = Math.max(0, (h - size) * 0.1);
  } else {
    sx = (w - size) / 2;
    sy = (h - size) / 2;
  }
  const out = Math.min(maxSize, size);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, sx, sy, size, size, 0, 0, out, out);
  return canvas.toDataURL('image/jpeg', 0.72);
}

window.cropPortraitForProfile = cropPortraitForProfile;
