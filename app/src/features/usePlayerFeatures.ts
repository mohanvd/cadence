import * as React from 'react';
import { useVideoEl, usePlayerStore } from '@/store/playerStore';

// The feature hooks predate the engine and are written against a React ref.
// They are sound, well-tested behaviour; rewriting them wholesale would risk
// regressions for no user-visible gain, so they are reused as-is and fed a ref
// that tracks whichever element the active backend created.
import { useABRepeat } from '@/hooks/useABRepeat';
import { useBookmarks } from '@/hooks/useBookmarks';
import { useEqualizer, EQ_PRESETS } from '@/hooks/useEqualizer';
import { useSleepTimer } from '@/hooks/useSleepTimer';
import { useSubtitles } from '@/hooks/useSubtitles';
import { useVideoFilters, FILTER_PRESETS } from '@/hooks/useVideoFilters';
import { useZoomPan } from '@/hooks/useZoomPan';

/**
 * A stable ref object that always points at the engine's current video element.
 *
 * The engine replaces the element whenever the backend changes, so a plain
 * `useRef` captured once would go stale. Keeping identity stable matters
 * because several hooks list the ref in dependency arrays.
 */
export function useVideoRef(): React.RefObject<HTMLVideoElement | null> {
  const videoEl = useVideoEl();
  const ref = React.useRef<HTMLVideoElement | null>(null);
  ref.current = videoEl;
  return ref;
}

export interface PlayerFeatureOptions {
  /** Storage key for per-file state such as bookmarks. */
  fileKey: string;
  onToast: (message: string) => void;
}

/**
 * Instantiates every optional player feature and wires the cross-cutting
 * behaviour that used to live inline in the old `Player` component.
 */
export function usePlayerFeatures({ fileKey, onToast }: PlayerFeatureOptions) {
  const videoRef = useVideoRef();
  // The element itself, for effects that must re-run when a backend swap or a
  // file switch replaces it. The ref alone is stable by design and so would
  // never re-trigger them.
  const videoEl = useVideoEl();

  const abRepeat = useABRepeat();
  const bookmarks = useBookmarks(fileKey);
  // The element is passed as well as the ref: the subtitle track is a real DOM
  // child of it, so it has to be re-attached whenever a backend swap or a file
  // switch builds a new one.
  const subtitles = useSubtitles(videoRef, videoEl);
  const equalizer = useEqualizer(videoRef);
  const filters = useVideoFilters();
  const zoomPan = useZoomPan();

  const sleepTimer = useSleepTimer(
    React.useCallback(() => {
      usePlayerStore.getState().pause();
      onToast('Sleep timer ended');
    }, [onToast]),
  );

  const [loop, setLoop] = React.useState(false);

  React.useEffect(() => {
    if (videoEl) videoEl.loop = loop;
  }, [loop, videoEl]);

  /**
   * A-B repeat: jump back to A whenever playback passes B.
   *
   * Driven off `timeupdate` rather than the store so the check runs at the
   * element's own cadence and does not depend on React having re-rendered.
   */
  const { pointA, pointB } = abRepeat;
  React.useEffect(() => {
    if (!videoEl || pointA === null || pointB === null) return;
    const onTimeUpdate = () => {
      if (videoEl.currentTime >= pointB) videoEl.currentTime = pointA;
    };
    videoEl.addEventListener('timeupdate', onTimeUpdate);
    return () => videoEl.removeEventListener('timeupdate', onTimeUpdate);
  }, [pointA, pointB, videoEl]);

  /** Clear file-scoped state when the source changes. */
  React.useEffect(() => {
    subtitles.clear();
    abRepeat.clear();
    // Intentionally keyed only on the file: re-running on hook identity would
    // wipe subtitles the moment any unrelated state changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey]);

  const addBookmarkAtPlayhead = React.useCallback(async () => {
    const time = videoRef.current?.currentTime;
    if (time === undefined) return;
    await bookmarks.add(time);
    onToast('Bookmark added');
  }, [bookmarks, onToast, videoRef]);

  const takeScreenshot = React.useCallback(async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const { captureScreenshot } = await import('@/utils/screenshot');
    captureScreenshot(video);
    onToast('Screenshot saved');
  }, [onToast, videoRef]);

  /** Load a dragged-in subtitle file. */
  const loadSubtitleFile = React.useCallback(
    async (file: File) => {
      const ok = await subtitles.loadFile(file);
      onToast(ok ? `Subtitles loaded, ${file.name}` : 'Only .srt and .vtt are supported');
      return ok;
    },
    [subtitles, onToast],
  );

  return {
    videoRef,
    abRepeat,
    bookmarks,
    subtitles,
    // The preset lists are module constants in the original hooks; attaching
    // them here means the UI has one object to consume per feature.
    equalizer: { ...equalizer, presets: EQ_PRESETS },
    filters: { ...filters, presets: FILTER_PRESETS },
    zoomPan,
    sleepTimer,
    loop,
    toggleLoop: React.useCallback(() => setLoop((v) => !v), []),
    addBookmarkAtPlayhead,
    takeScreenshot,
    loadSubtitleFile,
  };
}

export type PlayerFeatures = ReturnType<typeof usePlayerFeatures>;
