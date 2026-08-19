import * as React from 'react';
import { usePlayerStore } from '@/store/playerStore';

/**
 * Wheel and trackpad control over the player surface.
 *
 * Vertical scroll adjusts volume; horizontal scroll, which a trackpad gives
 * you for free, scrubs. Both are normalised before use: a mouse wheel reports
 * one large notch per click while a trackpad streams dozens of tiny pixel
 * deltas, and treating those the same makes one device unusable. Normalising to
 * an approximate "notch" count keeps a wheel click and a short two-finger swipe
 * worth roughly the same amount.
 */

/** Volume change for one full wheel notch. */
const VOLUME_PER_NOTCH = 0.05;
/** Seconds scrubbed per notch of horizontal scroll. */
const SECONDS_PER_NOTCH = 5;
/** Ignore sub-pixel jitter that trackpads emit while settling. */
const DEAD_ZONE = 0.4;

export interface WheelControlOptions {
  /** The element that should respond to wheel events. */
  targetRef: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
  onVolume?: (volume: number, muted: boolean) => void;
  onSeek?: (seconds: number) => void;
}

/** Convert a wheel delta in any unit into approximate notches. */
function toNotches(delta: number, mode: number): number {
  // 0 = pixels, 1 = lines, 2 = pages.
  if (mode === 1) return delta / 3;
  if (mode === 2) return delta * 4;
  // A mouse notch is ~100px in Chrome; a trackpad sends far smaller deltas.
  return delta / 100;
}

export function useWheelControls({
  targetRef,
  enabled = true,
  onVolume,
  onSeek,
}: WheelControlOptions): void {
  const callbacks = React.useRef({ onVolume, onSeek });
  callbacks.current = { onVolume, onSeek };

  React.useEffect(() => {
    const element = targetRef.current;
    if (!element || !enabled) return;

    const onWheel = (event: WheelEvent) => {
      // Let menus and any scrollable panel keep their own scrolling.
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[data-radix-popper-content-wrapper], [data-scrollable]')
      ) {
        return;
      }

      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const raw = horizontal ? event.deltaX : event.deltaY;
      const notches = toNotches(raw, event.deltaMode);
      if (Math.abs(notches) < DEAD_ZONE / 10) return;

      // Only now claim the gesture, so an ignored event can still scroll.
      event.preventDefault();

      const store = usePlayerStore.getState();

      if (horizontal) {
        const next = store.currentTime + notches * SECONDS_PER_NOTCH;
        store.seek(next);
        callbacks.current.onSeek?.(notches * SECONDS_PER_NOTCH);
        return;
      }

      /* Scrolling up raises the volume, matching every OS convention.
         
         Not clamped to full volume here: the store knows the ceiling, which is
         higher when the source can be amplified. Stopping at 1 would mean a
         wheel that quietly undoes a boost and then cannot restore it. */
      const next = Math.max(0, store.volume - notches * VOLUME_PER_NOTCH);
      store.setVolume(next);
      const applied = usePlayerStore.getState().volume;
      callbacks.current.onVolume?.(applied, applied === 0);
    };

    // `passive: false` is required to call `preventDefault` on wheel events.
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [targetRef, enabled]);
}
