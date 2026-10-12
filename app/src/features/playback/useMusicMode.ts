import * as React from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { isSoundOnly } from '@/lib/media';
import { useSettings } from '@/store/settingsStore';

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

export interface MusicModeApi {
  enabled: boolean;
  /** True when the file has no playable video track, so this is the only sane view. */
  forced: boolean;
  toggle: () => void;
}

export function useMusicMode(onToast?: (message: string) => void): MusicModeApi {
  const tracks = usePlayerStore((s) => s.tracks);
  const source = usePlayerStore((s) => s.source);

  // The viewer's choice, kept with the rest of the settings.
  const preference = useSettings((s) => s.musicMode);

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
     doing, and an unexplained audio-only screen is the thing worth explaining.
     
     Never for music. The message exists for the file that looks like video and
     turns out not to be, a concert `.mkv` that is really a recording, an
     `.mp4` rip of a podcast, where a black screen would otherwise need
     explaining. Somebody who put on an album already knows it has no picture,
     and saying so once per track is a notification every three minutes about
     the thing they chose. */
  const announcedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    const name = source?.name ?? null;
    if (!forced || !name || announcedFor.current === name) return;
    announcedFor.current = name;
    /* Only for a file whose name promised a picture. `.flac` promised nothing
       and delivered nothing; `.mkv` promised one and has none, and that is the
       surprise worth a word. */
    if (!isSoundOnly(name)) onToast?.('No video track. Playing as audio');
  }, [forced, source, onToast]);

  const toggle = React.useCallback(() => {
    const { musicMode, set } = useSettings.getState();
    set({ musicMode: !musicMode });
  }, []);

  return { enabled: forced || preference, forced, toggle };
}
