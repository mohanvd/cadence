import * as React from 'react';
import { frameUrl, toPlayableUrl } from '@/lib/desktop';
import { usePlayerStore } from '@/store/playerStore';
import type { MediaSourceInput, MediaTrack } from '@/engine/types';

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
 * That second element can only open what the browser demuxes by itself, so it
 * serves natively-played files and nothing else. Everything else — which is
 * every Matroska file, and anything holding a codec the browser refuses — asks
 * the shell for the frame instead. FFmpeg is already open for those, and one
 * frame from it costs a keyframe seek.
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

/**
 * Frames read from a second, hidden media element.
 *
 * Free when it works: the browser already has the file open, so a seek costs a
 * decode and nothing else. It works only for sources the browser can demux.
 */
function useElementPreview(source: MediaSourceInput | null): ThumbnailPreview {
  const enabled = source !== null;

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

    /* Resolving the URL is asynchronous now, because a path has to be turned
       into one the webview will open. The element is built first and pointed at
       the result when it arrives, so a source switched during the resolve tears
       down cleanly rather than pointing the new element at the old file. */
    let released = false;
    let revoke = () => {};
    void sourceToUrl(source).then((resolved) => {
      if (released) {
        resolved.revoke();
        return;
      }
      revoke = resolved.revoke;
      video.src = resolved.url;
    });

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
      released = true;
      video.removeAttribute('src');
      video.load();
      videoRef.current = null;
      revoke();
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

/**
 * Frames read from the shell, one FFmpeg call each.
 *
 * Simpler than the element it stands in for, because there is no decoder to
 * keep or seek: a timestamp is a URL, and an `<img>` loads it. The shell serves
 * those with a long cache lifetime and the answer for a given timestamp never
 * changes, so scrubbing back over a stretch costs one request the first time
 * and nothing afterwards.
 */
function useShellPreview(
  target: string | null,
  tracks: readonly MediaTrack[],
): ThumbnailPreview {
  const [frame, setFrame] = React.useState<string | null>(null);

  /* Reserved from the inspection rather than measured from the first frame,
     which is the one advantage of not having an element: the popover is the
     right shape before any picture has arrived. */
  const height = React.useMemo(() => {
    const video = tracks.find((track) => track.type === 'video');
    return video?.width && video?.height
      ? Math.round((THUMB_WIDTH * video.height) / video.width)
      : EMPTY.height;
  }, [tracks]);

  /** The request being loaded, and the newest one made while it loads. */
  const inFlightRef = React.useRef(false);
  const pendingRef = React.useRef<number | null>(null);
  const liveRef = React.useRef(true);

  React.useEffect(() => {
    liveRef.current = true;
    setFrame(null);
    return () => {
      liveRef.current = false;
    };
  }, [target]);

  const issue = React.useCallback(() => {
    if (!target || inFlightRef.current) return;
    const bucket = pendingRef.current;
    if (bucket === null) return;
    pendingRef.current = null;
    inFlightRef.current = true;

    void frameUrl(target, { at: bucket, width: THUMB_WIDTH * 2 })
      .then((url) => {
        if (!url) throw new Error('no pipeline');
        /* Loaded out of sight before it is shown. Handing the URL straight to
           the popover would swap a drawn thumbnail for an empty box while the
           next one arrives, which reads as flicker on every pointer move. */
        return new Promise<string>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(url);
          image.onerror = () => reject(new Error('no frame'));
          image.src = url;
        });
      })
      .then((url) => {
        if (liveRef.current) setFrame(url);
      })
      .catch(() => {
        /* A timestamp past the end, or a file FFmpeg cannot seek in. The
           previous frame stays up, which is better than a hole. */
      })
      .finally(() => {
        inFlightRef.current = false;
        issue();
      });
  }, [target]);

  const request = React.useCallback(
    (time: number | null) => {
      if (time === null) {
        pendingRef.current = null;
        setFrame(null);
        return;
      }
      pendingRef.current = Math.max(0, Math.round(time / BUCKET) * BUCKET);
      issue();
    },
    [issue],
  );

  if (!target) return EMPTY;
  return { ready: true, frame, height, request };
}

/**
 * Frames for the scrub bar, from whichever side of the app has the file open.
 */
export function useThumbnailPreview(): ThumbnailPreview {
  const source = usePlayerStore((s) => s.source);
  const backend = usePlayerStore((s) => s.backend);
  const tracks = usePlayerStore((s) => s.tracks);

  const viaShell = backend === 'stream';
  const element = useElementPreview(!viaShell && backend === 'native' ? source : null);
  const shell = useShellPreview(
    viaShell && source ? (source.kind === 'path' ? source.path : source.kind === 'url' ? source.url : null) : null,
    tracks,
  );

  return viaShell ? shell : element;
}

/**
 * Resolve a source to a URL the preview element can open, plus its cleanup.
 */
async function sourceToUrl(
  source: MediaSourceInput,
): Promise<{ url: string; revoke: () => void }> {
  if (source.kind === 'url') return { url: source.url, revoke: () => {} };
  if (source.kind === 'path') {
    return { url: await toPlayableUrl(source.path), revoke: () => {} };
  }
  const url = URL.createObjectURL(source.file);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}
