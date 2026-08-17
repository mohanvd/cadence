/**
 * Captures the current video frame and downloads it as PNG.
 * @param {HTMLVideoElement} video
 */
export function captureScreenshot(video) {
  if (!video || !video.videoWidth) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(video, 0, 0);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cadence-screenshot-${Date.now()}.png`;
    // Firefox ignores a click on an anchor that is not in the document, and
    // revoking synchronously can cancel the download before it starts.
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1000);
  }, 'image/png');
}
