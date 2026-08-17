import * as React from 'react';
import { usePlayerStore } from '@/store/playerStore';
import {
  loadPosition,
  loadSpeed,
  loadVolume,
  savePosition,
  saveSpeed,
  saveVolume,
} from '@/utils/storage';

/** Don't offer to resume a file that barely started. */
const MIN_RESUME_SECONDS = 15;
/** Treat the last few seconds as "finished" and start it over instead. */
const END_MARGIN_SECONDS = 20;
/** How often the playhead is written to storage. */
const SAVE_INTERVAL_MS = 4000;
/**
 * How long the "resumed from…" notice stays up.
 *
 * It is an explanation for something that already happened, not a decision the
 * user owes an answer to, so it expires on its own. Left up, it parks over the
 * bottom-left of the picture for the whole film and reappears with every
 * pointer move, which is worse than never having explained anything.
 */
const RESUME_NOTICE_MS = 8000;

export interface ResumeInfo {
  /** Seconds that playback was restored to. */
  from: number;
  /** Rewind to the beginning and forget the saved position. */
  startOver: () => void;
}

/**
 * Restores volume, speed and playback position, and keeps them saved.
 *
 * Resuming happens *silently* rather than behind a modal. Being asked
 * "resume?" before every lecture is friction on the common path; the player
 * simply continues where it was and offers a one-click way to start over,
 * which is the same bargain every streaming service makes.
 */
export function usePlaybackMemory(fileKey: string): ResumeInfo | null {
  const [resume, setResume] = React.useState<ResumeInfo | null>(null);
  // Guards against re-resuming when the engine re-emits metadata.
  const restoredFor = React.useRef<string | null>(null);

  // Volume and speed are global preferences, applied as soon as an engine
  // exists rather than per file.
  React.useEffect(() => {
    const { setVolume, setRate } = usePlayerStore.getState();
    setVolume(loadVolume());
    setRate(loadSpeed());
  }, [fileKey]);

  React.useEffect(() => {
    let lastVolume = usePlayerStore.getState().volume;
    let lastRate = usePlayerStore.getState().rate;
    return usePlayerStore.subscribe((state) => {
      if (state.volume !== lastVolume) {
        lastVolume = state.volume;
        saveVolume(state.volume);
      }
      if (state.rate !== lastRate) {
        lastRate = state.rate;
        saveSpeed(state.rate);
      }
    });
  }, []);

  /** Restore the playhead once the duration is known. */
  React.useEffect(() => {
    if (!fileKey) return;
    if (restoredFor.current === fileKey) return;

    const unsubscribe = usePlayerStore.subscribe((state) => {
      if (state.duration <= 0 || restoredFor.current === fileKey) return;
      restoredFor.current = fileKey;

      const saved = loadPosition(fileKey);
      const position = saved?.position ?? 0;
      const worthResuming =
        position > MIN_RESUME_SECONDS && position < state.duration - END_MARGIN_SECONDS;

      if (!worthResuming) {
        setResume(null);
        return;
      }

      usePlayerStore.getState().seek(position);
      setResume({
        from: position,
        startOver: () => {
          usePlayerStore.getState().seek(0);
          savePosition(fileKey, 0);
          setResume(null);
        },
      });
    });

    return unsubscribe;
  }, [fileKey]);

  /** Retire the notice once it has been on screen long enough to read. */
  React.useEffect(() => {
    if (!resume) return;
    const timer = window.setTimeout(() => setResume(null), RESUME_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [resume]);

  /** Persist the playhead on a timer and when the tab goes away. */
  React.useEffect(() => {
    if (!fileKey) return;

    const persist = () => {
      const { currentTime, duration } = usePlayerStore.getState();
      if (currentTime <= 0 || duration <= 0) return;
      // A finished file should reopen at the start, not at the credits.
      savePosition(fileKey, currentTime >= duration - END_MARGIN_SECONDS ? 0 : currentTime);
    };

    const timer = window.setInterval(persist, SAVE_INTERVAL_MS);
    // `visibilitychange` is the only teardown hook that reliably fires when a
    // tab is closed or the OS kills it; `beforeunload` does not on mobile.
    const onHide = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    document.addEventListener('visibilitychange', onHide);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      persist();
    };
  }, [fileKey]);

  // Reset when switching files.
  React.useEffect(() => {
    setResume(null);
    restoredFor.current = null;
  }, [fileKey]);

  return resume;
}
