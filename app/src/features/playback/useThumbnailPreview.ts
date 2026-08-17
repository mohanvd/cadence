import * as React from 'react';
import { usePlayerStore } from '@/store/playerStore';
import type { MediaSourceInput } from '@/engine/types';

/**
 * Frame previews for the scrub bar.
 *
 * The playing element cannot be borrowed to render these: seeking it to the
 * hovered time is exactly what the user has *not* asked for, and seeking a
 * decoder back and forth on every pointer move is what makes other players
 * stutter while you hover. So this decodes into a second, muted, never-attached
 * `<video>` of its own: the same source, an independent playhead.
 *
 * Two rules keep that second decoder cheap:
 *
 *  - Only one seek is ever in flight. Pointer moves land at pointer rate, which
 *    is far faster than a decoder can honour, so the newest request is stashed
 *    and issued when the current one reports back. Queuing them instead would
 *    build a backlog that finishes seconds after the cursor has moved on.
 *  - Frames are drawn to a small canvas and cached by rounded second. Scrubbing
 *    back and forth over the same stretch, which is most scrubbing, then costs
 *    nothing after the first pass.
 *
 * Native playback only. The remux and decode backends drive their own pipelines
 * from a single reader, and a second element pointed at the same source would
 * either fail to open it or double the memory a file is already straining.
 */

/** Width of a generated thumbnail. Height follows the source's aspect. */
const THUMB_WIDTH = 168;
/** Cache granularity, in seconds. */
const BUCKET = 2;
/** Stop the cache growing without bound on a long file. */
const MAX_CACHED = 120;

export interface ThumbnailPreview {
  /** True once the preview element can produce frames. */
  ready: boolean;
  /** Data URL for the requested time, or null while it is being decoded. */
  frame: string | null;
  /** Pixel height to reserve, so the popover does not resize on first frame. */
  height: number;
  /** Ask for the frame at `time`; pass null when the pointer leaves the bar. */
  request: (time: number | null) => void;
}

const EMPTY: ThumbnailPreview = {
  ready: false,
  frame: null,
  height: 94,
  request: () => {},
};

export function useThumbnailPreview(): ThumbnailPreview {
  const source = usePlayerStore((s) => s.source);
  const backend = usePlayerStore((s) => s.backend);
  const enabled = backend === 'native' && source !== null;

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const cacheRef = React.useRef(new Map<number, string>());
  /** The seek currently being awaited, if any. */
  const inFlightRef = React.useRef<number | null>(null);
  /** The most recent request made while a seek was in flight. */
  const pendingRef = React.useRef<number | null>(null);

  const [ready, setReady] = React.useState(false);
  const [frame, setFrame] = React.useState<string | null>(null);
  const [height, setHeight] = React.useState(94);

  /* Build the off-screen decoder. Keyed on the source so a file switch tears
     down the old element and its object URL rather than leaking both. */
  React.useEffect(() => {
    setReady(false);
    setFrame(null);
    cacheRef.current.clear();
    inFlightRef.current = null;
    pendingRef.current = null;

    if (!enabled || !source) return;

    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';
    // Required on iOS, where a video without it is handed to the fullscreen
    // player instead of decoding inline where we can read pixels from it.
    video.playsInline = true;

    const objectUrl = sourceToUrl(source);
    video.src = objectUrl.url;

    const onLoaded = () => {
      if (!video.videoWidth) return;
      setHeight(Math.round((THUMB_WIDTH * video.videoHeight) / video.videoWidth));
      setReady(true);
    };
    video.addEventListener('loadedmetadata', onLoaded);

    videoRef.current = video;

    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      // Emptying `src` and reloading is what actually releases the decoder;
      // dropping the reference alone leaves it running until GC notices.
      video.removeAttribute('src');
      video.load();
      videoRef.current = null;
      objectUrl.revoke();
    };
  }, [enabled, source]);

  /** Draw the current frame and resolve the request that asked for it. */
  const capture = React.useCallback((bucket: number) => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvasRef.current = canvas;
    }
    const h = Math.round((THUMB_WIDTH * video.videoHeight) / video.videoWidth);
    canvas.width = THUMB_WIDTH;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let url: string;
    try {
      ctx.drawImage(video, 0, 0, THUMB_WIDTH, h);
      // JPEG at this size is a few kilobytes; PNG would be an order of
      // magnitude larger for a picture nobody inspects closely.
      url = canvas.toDataURL('image/jpeg', 0.72);
    } catch {
      // A cross-origin URL without permissive CORS taints the canvas. Nothing
      // can be read from it, and no later frame will fare better.
      setReady(false);
      return;
    }

    const cache = cacheRef.current;
    if (cache.size >= MAX_CACHED) {
      // Insertion-ordered, so the first key is the oldest.
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(bucket, url);
    setFrame(url);
  }, []);

  /** Issue the next seek, if the decoder is free and one is waiting. */
  const pump = React.useCallback(() => {
    const video = videoRef.current;
    if (!video || inFlightRef.current !== null) return;

    const bucket = pendingRef.current;
    if (bucket === null) return;
    pendingRef.current = null;

    const cached = cacheRef.current.get(bucket);
    if (cached) {
      setFrame(cached);
      // Still recurse: a later request may have arrived behind this one.
      pump();
      return;
    }

    inFlightRef.current = bucket;
    try {
      video.currentTime = bucket;
    } catch {
      inFlightRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready) return;

    const onSeeked = () => {
      const bucket = inFlightRef.current;
      inFlightRef.current = null;
      if (bucket !== null) capture(bucket);
      pump();
    };

    video.addEventListener('seeked', onSeeked);
    return () => video.removeEventListener('seeked', onSeeked);
  }, [ready, capture, pump]);

  const request = React.useCallback(
    (time: number | null) => {
      if (time === null) {
        pendingRef.current = null;
        setFrame(null);
        return;
      }
      if (!videoRef.current || !ready) return;

      const bucket = Math.max(0, Math.round(time / BUCKET) * BUCKET);
      const cached = cacheRef.current.get(bucket);
      if (cached) {
        // A cache hit must not wait on whatever seek is in flight: this is the
        // path that makes a second pass over the same stretch feel instant.
        setFrame(cached);
        return;
      }

      pendingRef.current = bucket;
      pump();
    },
    [ready, pump],
  );

  if (!enabled) return EMPTY;
  return { ready, frame, height, request };
}

/** Resolve a source to a URL the preview element can open, plus its cleanup. */
function sourceToUrl(source: MediaSourceInput): { url: string; revoke: () => void } {
  if (source.kind === 'url') return { url: source.url, revoke: () => {} };
  const url = URL.createObjectURL(source.file);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}
