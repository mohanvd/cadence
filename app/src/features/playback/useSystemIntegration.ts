import * as React from 'react';
import { useCoverArt } from './useCoverArt';
import { usePlayerStore } from '@/store/playerStore';
import { isDesktop, onNowPlaying, setNowPlaying } from '@/lib/desktop';

/**
 * Wires the player into the operating system.
 *
 * Media Session is what makes the keyboard's play/pause key, the headset
 * button, the Windows volume flyout and the macOS Now Playing panel control
 * *this* player. It is a handful of lines and it is the difference between a
 * web page and something that behaves like an installed app.
 *
 * On the desktop the shell asks for the same panel as well, and the browser's
 * copy is switched off, see `useShellNowPlaying` below for why. The page's
 * own is kept for everywhere that is not the desktop app, where it is the only
 * one there is.
 */
export function useMediaSession(
  title: string,
  subtitle: string,
  handlers: { next?: (() => void) | undefined; previous?: (() => void) | undefined },
  /** The record it is from, when the file says so. Blank for a film. */
  album = '',
  /** Whether Windows should file this under music rather than video. */
  music = false,
): void {
  useShellNowPlaying(title, subtitle, handlers, album, music);

  const handlerRef = React.useRef(handlers);
  handlerRef.current = handlers;

  React.useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;

    session.metadata = new MediaMetadata({
      // Strip the extension: the OS panel is a place for a title, not a filename.
      title: title.replace(/\.[^.]+$/, ''),
      /* Who it is by when the file says so, and the program's own name when it
         does not. A panel with an empty line where the artist goes reads as
         something that failed to load rather than as a file with no tags. */
      artist: subtitle || 'Cadence',
      album,
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
  }, [title, subtitle, album]);

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

/**
 * The same panel, asked for by the shell rather than by the page.
 *
 * On Windows the page's own request produces a panel headed **Unknown app**,
 * because Windows names it after the process that asked and the process that
 * asks for a page is the browser, here WebView2, which it knows only as
 * `msedgewebview2.exe`. The shell has a name and an icon, so it asks instead,
 * and the browser's copy is switched off in the window's arguments so that
 * only one entry appears.
 *
 * What the page keeps is everything that requires knowing: what is playing,
 * how far in, whether there is another file after this one, and what to do
 * when a button is pressed.
 */
function useShellNowPlaying(
  title: string,
  subtitle: string,
  handlers: { next?: (() => void) | undefined; previous?: (() => void) | undefined },
  album: string,
  music: boolean,
): void {
  const handlerRef = React.useRef(handlers);
  handlerRef.current = handlers;

  React.useEffect(() => {
    if (!isDesktop()) return undefined;

    let stop: (() => void) | null = null;
    let live = true;

    void onNowPlaying((action) => {
      const store = usePlayerStore.getState();
      if (action === 'play') store.play();
      else if (action === 'pause') store.pause();
      else if (action === 'next') handlerRef.current.next?.();
      else if (action === 'previous') handlerRef.current.previous?.();
    }).then((off) => {
      if (live) stop = off;
      else off();
    });

    return () => {
      live = false;
      stop?.();
    };
  }, []);

  const next = !!handlers.next;
  const previous = !!handlers.previous;

  /* Empty until a cover has been found, and empty forever unless the setting
     asking for one is on. The card goes up either way; a picture that arrives
     late replaces the logo rather than delaying the card. */
  const artwork = useCoverArt(subtitle, album, music);

  React.useEffect(() => {
    if (!isDesktop()) return undefined;

    /* The clock moves constantly and the panel does not need to hear about it
       constantly: a scrubber that is a second out is a scrubber nobody can see
       is a second out. Everything else, a pause, a new file, the end of a
       queue, goes over the moment it happens, because those are the things
       somebody is looking at the panel to check. */
    let sent = 0;

    const push = (force: boolean) => {
      const state = usePlayerStore.getState();
      const now = performance.now();
      if (!force && now - sent < 1000) return;
      sent = now;
      void setNowPlaying({
        title: title.replace(/\.[^.]+$/, ''),
        subtitle,
        album,
        music,
        playing: !state.paused,
        duration: Number.isFinite(state.duration) ? state.duration : 0,
        position: state.currentTime,
        hasNext: next,
        hasPrevious: previous,
        artwork,
      });
    };

    push(true);
    let paused = usePlayerStore.getState().paused;
    const unsubscribe = usePlayerStore.subscribe((state) => {
      const changed = state.paused !== paused;
      paused = state.paused;
      push(changed);
    });

    return () => {
      unsubscribe();
      // Nothing is open any more, and a panel still offering to pause a film
      // that has been closed is a panel telling a lie.
      void setNowPlaying({
        title: '',
        subtitle: '',
        album: '',
        music: false,
        playing: false,
        duration: 0,
        position: 0,
        hasNext: false,
        hasPrevious: false,
        artwork: '',
      });
    };
  }, [title, subtitle, album, music, next, previous, artwork]);
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
