import { useRef, useCallback, useEffect } from 'react';

const DOUBLE_TAP_DELAY = 300;
const SWIPE_THRESHOLD = 10;

/**
 * Touch gestures for video player:
 * - Double-tap left/right/center → seek ±10s / play-pause
 * - Single tap → toggle controls
 * - Horizontal swipe → seek proportional to deltaX
 * - Vertical swipe right → volume, left → brightness
 */
export function useTouchGestures({
  videoRef,
  containerRef,
  enabled = true,
  duration,
  seekRelative,
  seek,
  changeVolume,
  getVolume,
  togglePlay,
  onBrightnessChange,
  getBrightness,
  onFeedback,
  onSingleTap,
}) {
  const touchStartRef = useRef(null);
  const lastTapRef = useRef({ time: 0, x: 0 });
  const isSwipingRef = useRef(false);

  const getVideoWidth = useCallback(() => {
    const video = videoRef?.current;
    if (video) return video.getBoundingClientRect().width;
    return containerRef.current?.getBoundingClientRect().width ?? 1;
  }, [videoRef, containerRef]);

  const handleTouchStart = useCallback(
    (e) => {
      if (!enabled) return;
      const touch = e.touches[0];
      if (!touch) return;

      /* Chrome is not the picture.
         These listeners are on the shell so a swipe can start anywhere over the
         video, but that also puts every button, menu and the scrub bar inside
         the gesture area, so tapping "settings" counted as a tap on the
         picture and hid the chrome underneath the menu that was opening, and
         dragging the scrub bar seeked twice: once from the bar, once from the
         swipe. A touch that lands on a control belongs to that control. */
      if (e.target instanceof Element && e.target.closest('[data-player-chrome]')) {
        touchStartRef.current = null;
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
        rectWidth: rect.width,
        rectHeight: rect.height,
        rectLeft: rect.left,
        videoTimeAtStart: videoRef?.current?.currentTime ?? 0,
      };
      isSwipingRef.current = false;
    },
    [enabled, containerRef, videoRef]
  );

  const handleTouchMove = useCallback(
    (e) => {
      if (!enabled || !touchStartRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;

      const start = touchStartRef.current;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;

      if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;

      isSwipingRef.current = true;
      const touchXRelative = (start.x - start.rectLeft) / start.rectWidth;

      if (Math.abs(dx) >= Math.abs(dy)) {
        e.preventDefault();
        const videoWidth = getVideoWidth();
        const totalSeek = (dx / videoWidth) * (duration || 0) * 0.3;
        if (duration > 0) {
          const newTime = Math.max(0, Math.min(duration, start.videoTimeAtStart + totalSeek));
          seek(newTime);
          onFeedback?.('seek', { direction: dx > 0 ? 'right' : 'left', seconds: Math.round(totalSeek) });
        }
      } else {
        e.preventDefault();
        const deltaPercent = -dy / (start.rectHeight * 0.5);

        if (touchXRelative > 0.5) {
          const newVol = Math.max(0, Math.min(1, getVolume() + deltaPercent * 0.05));
          changeVolume(newVol);
          onFeedback?.('volume', { volume: newVol, muted: newVol === 0 });
        } else {
          const current = getBrightness?.() ?? 100;
          const newBright = Math.max(30, Math.min(200, current + deltaPercent * 2));
          onBrightnessChange?.(Math.round(newBright));
          onFeedback?.('brightness', { brightness: Math.round(newBright) });
        }

        touchStartRef.current = { ...start, y: touch.clientY };
      }
    },
    [
      enabled,
      duration,
      getVideoWidth,
      seek,
      changeVolume,
      getVolume,
      getBrightness,
      onBrightnessChange,
      onFeedback,
    ]
  );

  const handleTouchEnd = useCallback(
    (e) => {
      if (!enabled) return;
      const start = touchStartRef.current;
      if (!start) return;

      if (isSwipingRef.current) {
        touchStartRef.current = null;
        isSwipingRef.current = false;
        return;
      }

      const now = Date.now();
      const timeSinceLastTap = now - lastTapRef.current.time;
      const touchX = start.x;
      const touchXRelative = (touchX - start.rectLeft) / start.rectWidth;

      if (timeSinceLastTap < DOUBLE_TAP_DELAY && Math.abs(touchX - lastTapRef.current.x) < 50) {
        e.preventDefault();

        if (touchXRelative < 1 / 3) {
          seekRelative(-10);
          onFeedback?.('seek', { direction: 'left', seconds: -10 });
        } else if (touchXRelative > 2 / 3) {
          seekRelative(10);
          onFeedback?.('seek', { direction: 'right', seconds: 10 });
        } else {
          togglePlay();
        }

        lastTapRef.current = { time: 0, x: 0 };
      } else {
        lastTapRef.current = { time: now, x: touchX };
        onSingleTap?.();
      }

      touchStartRef.current = null;
    },
    [enabled, seekRelative, togglePlay, onFeedback, onSingleTap]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const opts = { passive: false };
    el.addEventListener('touchstart', handleTouchStart, opts);
    el.addEventListener('touchmove', handleTouchMove, opts);
    el.addEventListener('touchend', handleTouchEnd, opts);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart, opts);
      el.removeEventListener('touchmove', handleTouchMove, opts);
      el.removeEventListener('touchend', handleTouchEnd, opts);
    };
  }, [containerRef, enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);
}
