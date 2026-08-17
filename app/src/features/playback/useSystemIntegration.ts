import * as React from 'react';
import { usePlayerStore } from '@/store/playerStore';

/**
 * Wires the player into the operating system.
 *
 * Media Session is what makes the keyboard's play/pause key, the headset
 * button, the Windows volume flyout and the macOS Now Playing panel control
 * *this* player. It is a handful of lines and it is the difference between a
 * web page and something that behaves like an installed app.
 */
export function useMediaSession(
  title: string,
  handlers: { next?: (() => void) | undefined; previous?: (() => void) | undefined },
): void {
  const handlerRef = React.useRef(handlers);
  handlerRef.current = handlers;

  React.useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;

    session.metadata = new MediaMetadata({
      // Strip the extension: the OS panel is a place for a title, not a filename.
      title: title.replace(/\.[^.]+$/, ''),
      artist: 'Cadence',
    });

    const store = () => usePlayerStore.getState();
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => store().play()],
      ['pause', () => store().pause()],
      ['seekbackward', (d) => store().seekBy(-(d.seekOffset ?? 10))],
      ['seekforward', (d) => store().seekBy(d.seekOffset ?? 10)],
      [
        'seekto',
        (d) => {
          if (typeof d.seekTime === 'number') store().seek(d.seekTime);
        },
      ],
      ['previoustrack', () => handlerRef.current.previous?.()],
      ['nexttrack', () => handlerRef.current.next?.()],
    ];

    for (const [action, handler] of actions) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Older browsers reject unknown actions; the rest still register.
      }
    }

    return () => {
      for (const [action] of actions) {
        try {
          session.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
      session.metadata = null;
    };
  }, [title]);

  /** Keep the OS scrubber and play state in step with the engine. */
  React.useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    return usePlayerStore.subscribe((state) => {
      navigator.mediaSession.playbackState = state.paused ? 'paused' : 'playing';
      if (state.duration > 0 && Number.isFinite(state.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: state.duration,
            playbackRate: state.rate,
            position: Math.min(state.currentTime, state.duration),
          });
        } catch {
          // Throws if position briefly exceeds duration during a seek.
        }
      }
    });
  }, []);
}

type WakeLock = { release: () => Promise<void>; released: boolean };

/**
 * Holds a screen wake lock while playing.
 *
 * Without it the display dims partway through a long lecture whenever the
 * viewer is watching rather than typing. The lock is dropped on pause so a
 * paused player does not keep a laptop awake.
 */
export function useWakeLock(active: boolean): void {
  React.useEffect(() => {
    const api = (navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLock> };
    }).wakeLock;
    if (!api || !active) return;

    let lock: WakeLock | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const next = await api.request('screen');
        if (cancelled) {
          void next.release();
          return;
        }
        lock = next;
      } catch {
        // Denied in a background tab or on battery saver; not worth surfacing.
      }
    };

    void acquire();

    // The lock is dropped automatically when the tab is hidden, so it has to be
    // taken again on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !lock?.released) return;
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
