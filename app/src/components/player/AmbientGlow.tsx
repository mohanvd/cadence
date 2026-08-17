import * as React from 'react';
import { useIsPaused, useVideoEl } from '@/store/playerStore';

/**
 * Bias-lighting glow sampled from the video.
 *
 * A tiny 64×36 canvas is blown up and heavily blurred behind the frame, so the
 * wall behind the player picks up the scene's colour. The canvas stays that
 * small on purpose: it is the blur radius that does the work, and sampling at
 * full resolution would cost real GPU time for an identical result.
 *
 * Sampling is driven by `requestVideoFrameCallback` where available, which
 * fires once per *decoded frame*, so it costs nothing on a still frame and
 * automatically stops while paused or in a background tab.
 */
export function AmbientGlow({ enabled }: { enabled: boolean }) {
  const videoEl = useVideoEl();
  const paused = useIsPaused();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    if (!enabled || !videoEl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let cancelled = false;
    let frameHandle = 0;
    let timer = 0;

    const draw = () => {
      if (cancelled) return;
      if (videoEl.readyState >= 2) {
        try {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        } catch {
          // Cross-origin frames taint the canvas; skip rather than throw.
          cancelled = true;
          return;
        }
      }
    };

    type WithFrameCallback = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };
    const withFrames = videoEl as WithFrameCallback;

    // A paused frame produces no frame callbacks, so a seek made while paused
    // would leave the glow showing the frame before it.
    videoEl.addEventListener('seeked', draw);
    videoEl.addEventListener('loadeddata', draw);
    const detachEvents = () => {
      videoEl.removeEventListener('seeked', draw);
      videoEl.removeEventListener('loadeddata', draw);
    };

    if (typeof withFrames.requestVideoFrameCallback === 'function') {
      const loop = () => {
        draw();
        if (!cancelled) {
          frameHandle = withFrames.requestVideoFrameCallback!(loop);
        }
      };
      loop();
      return () => {
        cancelled = true;
        detachEvents();
        withFrames.cancelVideoFrameCallback?.(frameHandle);
      };
    }

    // Fallback: a slow interval is plenty for something this blurred.
    draw();
    if (!paused) timer = window.setInterval(draw, 120);
    return () => {
      cancelled = true;
      detachEvents();
      window.clearInterval(timer);
    };
  }, [enabled, videoEl, paused]);

  if (!enabled) return null;

  /*
   * Deliberately *not* a negative z-index. The shell behind this canvas paints
   * an opaque black background, and a negatively-stacked child paints behind
   * its ancestor's background, which is why the glow was invisible. At z-0,
   * placed before the engine's mount in the DOM, it lands where it belongs:
   * over the black, under the picture, showing in the letterbox.
   */
  return (
    <canvas
      ref={canvasRef}
      width={64}
      height={36}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 size-full scale-110 opacity-45 blur-[64px] saturate-150"
    />
  );
}
