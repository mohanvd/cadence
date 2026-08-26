import { artworkUrl, frameUrl } from '../lib/desktop';
import { isSoundOnly } from '../lib/media';

/** Five of these live in localStorage, so the quality has to buy its size. */
const POSTER_QUALITY = 0.55;
/** Wider than the card so it stays sharp on a scaled display. */
const POSTER_WIDTH = 420;

/**
 * Grab a picture for a file's tile in the recent list.
 *
 * A frame for a film and a sleeve for a track. They are not the same request:
 * a frame is a moment part-way through a video stream, and a sleeve is a still
 * with no timeline that may not be in the file at all, asking for one the way
 * you ask for the other gets nothing back.
 *
 * FFmpeg's frame, not the media element's. That is the whole reason the list
 * has pictures on it at all: the element could only produce one for a file it
 * could already open by itself, so an MKV, or anything holding a codec the
 * browser refuses, got a grey tile, which was most of what a video player is
 * asked to open.
 *
 * The result is a data URL rather than a link to the shell, because it outlives
 * the shell that served it: entries are read back on the next launch, when that
 * loopback port belongs to nobody.
 *
 * Every failure resolves to null. A missing poster costs a grey tile; a throw
 * here would cost the file opening at all.
 *
 * @param {string} path
 * @returns {Promise<string | null>} A JPEG data URL, or null.
 */
export async function capturePoster(path) {
  try {
    const url = isSoundOnly(path)
      ? await artworkUrl(path, { width: POSTER_WIDTH })
      : await frameUrl(path, { width: POSTER_WIDTH });
    if (!url) return null;

    const response = await fetch(url);
    if (!response.ok) return null;

    /* Re-encoded rather than stored as it arrived. FFmpeg's JPEG is sized for
       looking at; five of these have to fit in a five megabyte store beside
       everything else the app keeps. */
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    return canvas.toDataURL('image/jpeg', POSTER_QUALITY);
  } catch {
    return null;
  }
}
