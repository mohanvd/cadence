import * as React from 'react';
import { usePlayerStore } from '@/store/playerStore';

/**
 * Music mode: playback with the picture switched off.
 *
 * Not the same thing as minimising the window. Compositing a video frame sixty
 * times a second costs real power whether or not anyone is looking at it, and a
 * player that holds a wake lock through a two-hour album is actively hostile on
 * a laptop. Music mode stops painting, releases the lock, and pins the chrome
 * so the transport is always reachable without hunting for it.
 *
 * It engages by itself for files that have no video track at all (an .mkv that
 * is really a concert recording, an .mp4 rip of a podcast) because the
 * alternative is a black rectangle the user has to be told is working.
 */

const STORAGE_KEY = 'cadence-music-mode';

export interface MusicModeApi {
  enabled: boolean;
  /** True when the file has no playable video track, so this is the only sane view. */
  forced: boolean;
  toggle: () => void;
}

function loadPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useMusicMode(onToast?: (message: string) => void): MusicModeApi {
  const tracks = usePlayerStore((s) => s.tracks);
  const source = usePlayerStore((s) => s.source);

  const [preference, setPreference] = React.useState(loadPreference);

  /**
   * Whether this source can show a picture at all.
   *
   * Read from the probe rather than from `videoWidth`, which is still 0 while
   * metadata loads and would flash music mode on for every ordinary file.
   */
  const forced = React.useMemo(() => {
    if (tracks.length === 0) return false;
    return !tracks.some((track) => track.type === 'video' && track.playable);
  }, [tracks]);

  /* Announce the switch once per file, and only when it was not the user's
     doing, and an unexplained audio-only screen is the thing worth explaining. */
  const announcedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    const name = source?.name ?? null;
    if (!forced || !name || announcedFor.current === name) return;
    announcedFor.current = name;
    onToast?.('No video track. Playing as audio');
  }, [forced, source, onToast]);

  const toggle = React.useCallback(() => {
    setPreference((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* Private browsing; the preference just won't outlive the session. */
      }
      return next;
    });
  }, []);

  return { enabled: forced || preference, forced, toggle };
}
