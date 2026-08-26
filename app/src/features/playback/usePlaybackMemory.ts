import * as React from 'react';
import { usePlayerStore } from '@/store/playerStore';
import {
  loadPosition,
  loadSpeed,
  loadBoost,
  loadVolume,
  savePosition,
  saveSpeed,
  saveBoost,
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
  /** Seconds the saved position is at. */
  from: number;
  /**
   * Whether playback was moved there, or is only being offered the chance.
   *
   * A film is moved. A track is offered, and starts at the beginning.
   */
  taken: boolean;
  /** Rewind to the beginning and forget the saved position. Films only. */
  startOver: () => void;
  /** Go to the saved position. Tracks only. */
  resume: () => void;
}

/**
 * Restores volume, speed and playback position, and keeps them saved.
 *
 * A film is moved to where it was left, silently. Being asked "resume?" before
 * every lecture is friction on the common path, so the player simply carries
 * on and offers a one-click way to start over, the bargain every streaming
 * service makes.
 *
 * A track is not. A song is a thing you play from the beginning; hearing half
 * of one yesterday is not a request to skip the first half of it today, and it
 * is worse than it sounds in a queue, where every track anybody had ever
 * half-listened to would jump on arriving. So the position is still kept and
 * still offered, one click, in the same place the film's notice appears, and
 * nothing seeks on its own.
 *
 * Which of the two it is is read from the store at the moment the duration
 * arrives rather than passed in, because the two facts land in the same
 * update: a caller reading "is this music" from a render would still be
 * holding the answer for the file before this one.
 */
export function usePlaybackMemory(fileKey: string): ResumeInfo | null {
  const [resume, setResume] = React.useState<ResumeInfo | null>(null);
  // Guards against re-resuming when the engine re-emits metadata.
  const restoredFor = React.useRef<string | null>(null);

  // Volume and speed are global preferences, applied as soon as an engine
  // exists rather than per file.
  React.useEffect(() => {
    const { setVolume, setBoost, setRate } = usePlayerStore.getState();
    setVolume(loadVolume());
    setBoost(loadBoost());
    setRate(loadSpeed());
  }, [fileKey]);

  React.useEffect(() => {
    let lastVolume = usePlayerStore.getState().volume;
    let lastBoost = usePlayerStore.getState().boost;
    let lastRate = usePlayerStore.getState().rate;
    return usePlayerStore.subscribe((state) => {
      if (state.volume !== lastVolume) {
        lastVolume = state.volume;
        saveVolume(state.volume);
      }
      if (state.boost !== lastBoost) {
        lastBoost = state.boost;
        saveBoost(state.boost);
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

      /* Sound with no picture. Read from the tracks rather than from
         `videoWidth`, which is still zero while a film's metadata settles. */
      const soundOnly =
        state.tracks.length > 0 &&
        !state.tracks.some((track) => track.type === 'video' && track.playable);

      if (soundOnly) {
        setResume({
          from: position,
          taken: false,
          startOver: () => setResume(null),
          resume: () => {
            usePlayerStore.getState().seek(position);
            setResume(null);
          },
        });
        return;
      }

      usePlayerStore.getState().seek(position);
      setResume({
        from: position,
        taken: true,
        resume: () => setResume(null),
        startOver: () => {
          usePlayerStore.getState().seek(0);
          savePosition(fileKey, 0);
          setResume(null);
        },
      });
    });

    return unsubscribe;
  }, [fileKey]);

  /**
   * Retire the notice once it has been on screen long enough to read.
   *
   * Only the film's. That one explains something that already happened and
   * expires the way an explanation should. The track's is an *offer*, and an
   * offer that withdraws itself after eight seconds is one nobody ever
   * accepts, least of all here, where a track starts with the player put
   * away, so the whole eight seconds would elapse behind a bar with no room
   * to show it. It waits until it is taken, dismissed, or the file changes.
   */
  React.useEffect(() => {
    if (!resume?.taken) return;
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
