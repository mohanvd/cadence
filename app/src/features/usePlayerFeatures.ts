import * as React from 'react';
import { useVideoEl, usePlayerStore } from '@/store/playerStore';
import { describeTrack } from '@/lib/format';
import type { MediaTrack } from '@/engine/types';

// The feature hooks predate the engine and are written against a React ref.
// They are sound, well-tested behaviour; rewriting them wholesale would risk
// regressions for no user-visible gain, so they are reused as-is and fed a ref
// that tracks whichever element the active backend created.
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

  /** Clear file-scoped state when the source changes. */
  React.useEffect(() => {
    subtitles.clear();
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
    const saved = captureScreenshot(video);
    onToast(saved ? 'Screenshot saved' : 'A video played from a link cannot be captured');
  }, [onToast, videoRef]);

  /** Load a dragged-in subtitle file. */
  const loadSubtitleFile = React.useCallback(
    async (file: File) => {
      const ok = await subtitles.loadFile(file);
      onToast(ok ? `Subtitles loaded, ${file.name}` : 'Subtitles come as .srt, .vtt, .ass or .ssa');
      return ok;
    },
    [subtitles, onToast],
  );

  /**
   * Show a subtitle track that is inside the file being played.
   *
   * The path comes from the store rather than from the caller because only one
   * file is open, and a menu that had to be told which film it belonged to
   * could be told the wrong one.
   */
  const selectSubtitleTrack = React.useCallback(
    async (track: MediaTrack) => {
      const source = usePlayerStore.getState().source;
      if (source?.kind !== 'path') {
        onToast('Subtitles inside a file need the file itself, not a link');
        return;
      }
      const name = describeTrack(track);
      /* Three kinds come out of a file by three routes: words are converted
         to WebVTT and parsed, a script goes to libass as it stands, and
         pictures are decoded into images this player positions itself. Which
         one this is was settled by the probe. */
      const load = track.pictures
        ? subtitles.loadPictures
        : track.script
          ? subtitles.loadScript
          : subtitles.loadEmbedded;
      const { ok, error } = await load(source.path, Number(track.id), name);
      if (!ok && error) onToast(error);
    },
    [subtitles, onToast],
  );

  return {
    videoRef,
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
    selectSubtitleTrack,
  };
}

export type PlayerFeatures = ReturnType<typeof usePlayerFeatures>;
