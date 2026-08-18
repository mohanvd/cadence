/**
 * Captures the current video frame and downloads it as PNG.
 *
 * Returns false when the frame cannot be read. That happens for a video played
 * from a link: the canvas is tainted by it, and reading pixels back out is
 * exactly what the taint forbids. Files on disk are unaffected, and a link that
 * plays at all is worth more than one that could be screenshotted and could
 * not be played, which is the trade the other direction.
 *
 * @param {HTMLVideoElement} video
 * @returns {boolean} Whether a frame was read.
 */
export function captureScreenshot(video) {
  if (!video || !video.videoWidth) return false;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  try {
    ctx.drawImage(video, 0, 0);
    // Reads the pixels, so this is where a tainted canvas throws rather than
    // at the draw above.
    canvas.toDataURL('image/png');
  } catch {
    return false;
  }

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

  return true;
}
