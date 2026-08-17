/** Where in the video to sample. Far enough in to clear titles and fades. */
const SAMPLE_FRACTION = 0.12;
/** Wider than the card so it stays sharp on a scaled display. */
const POSTER_WIDTH = 420;
/** Five of these live in localStorage, so the quality has to buy its size. */
const POSTER_QUALITY = 0.55;
/** A file that will not produce a frame in this long is not going to. */
const TIMEOUT_MS = 6000;

/**
 * Grab a still from a video to use as its poster in the recent list.
 *
 * Done on a detached element rather than off the player: the poster is wanted
 * once, at the moment a file enters the recent list, and reading it from the
 * live player would mean seeking away from where someone is watching.
 *
 * Every failure resolves to null. A missing poster costs a grey tile; a throw
 * here would cost the file opening at all.
 *
 * @param {string} url A source the media element can load.
 * @returns {Promise<string | null>} A JPEG data URL, or null.
 */
export function capturePoster(url) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      // Without an explicit load() the element keeps the connection open and
      // goes on buffering a file nobody is watching.
      video.load();
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), TIMEOUT_MS);

    video.muted = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';

    video.addEventListener('error', () => finish(null));

    video.addEventListener('loadedmetadata', () => {
      if (!video.duration || !Number.isFinite(video.duration)) return finish(null);
      // Seeking is what forces a frame to be decoded; `loadedmetadata` alone
      // leaves the element with dimensions and no picture.
      video.currentTime = video.duration * SAMPLE_FRACTION;
    });

    video.addEventListener('seeked', () => {
      try {
        const ratio = video.videoHeight / video.videoWidth;
        if (!Number.isFinite(ratio) || ratio <= 0) return finish(null);

        const canvas = document.createElement('canvas');
        canvas.width = POSTER_WIDTH;
        canvas.height = Math.round(POSTER_WIDTH * ratio);
        const context = canvas.getContext('2d');
        if (!context) return finish(null);

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', POSTER_QUALITY));
      } catch {
        // A tainted canvas, which is any source the origin will not share.
        finish(null);
      }
    });

    video.src = url;
  });
}
