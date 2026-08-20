import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { getRecentFiles, setRecentPoster } from '../utils/storage';
import { capturePoster } from '../utils/poster';
import { isDesktop, pickMediaFile, onFileDrop } from '../lib/desktop';

/**
 * Containers Cadence opens.
 *
 * This list matches the one the installer registers file associations for, and
 * that was not true before: the shell claimed avi, wmv, flv and half a dozen
 * others while the player accepted four, so double-clicking an .avi opened a
 * window that then failed on it.
 *
 * It was also, until now, only video — which is what everyone who tried to
 * play an album here ran into. Not a codec problem and not a decoder problem:
 * the file was turned away at the door by this list, with a sentence saying
 * Cadence does not open .mp3 files, about a format it has always been able to
 * decode. Everything below the divider was already playable and merely
 * unwelcome.
 *
 * The four shown on the drop card are still four. A wall of extensions is not
 * information, and the ones named are the ones people arrive holding.
 */
export const ACCEPTED_TYPES = [
  '.mp4',
  '.mkv',
  '.webm',
  '.mov',
  '.avi',
  '.m4v',
  '.wmv',
  '.flv',
  '.ts',
  '.m2ts',
  '.mts',
  '.mpg',
  '.mpeg',
  '.3gp',
  '.ogv',
  // Sound.
  '.mp3',
  '.m4a',
  '.m4b',
  '.flac',
  '.wav',
  '.opus',
  '.ogg',
  '.oga',
  '.aac',
  '.wma',
  '.aiff',
  '.aif',
  '.ape',
  '.wv',
  '.mka',
];

/** The few the drop card names, in the order it names them. */
export const HEADLINE_TYPES = ['MP4', 'MKV', 'MP3', 'FLAC'];

const ACCEPTED_MIME = [
  'video/mp4',
  'video/webm',
  'video/x-matroska',
  'video/quicktime',
  'audio/mpeg',
  'audio/mp4',
  'audio/flac',
  'audio/wav',
  'audio/ogg',
];
const URL_PATTERN = /^https?:\/\/.+\.(mp4|webm|mkv|mov|mp3|m4a|flac|opus|ogg|wav)(\?.*)?$/i;

/**
 * Every way a video can enter the app: dropped, picked, pasted as a URL, or
 * re-opened from the recent list.
 *
 * This lives in a hook rather than in the drop zone component because the home
 * screen now spreads those affordances across several sibling components: the
 * card, the URL field and the recent grid all mutate the same error and
 * recent-files state, and a drop is accepted anywhere on the page.
 *
 * A file has one identity here: its path. What used to sit alongside it was the
 * browser's File System Access layer, which handed back a handle instead, and a
 * handle is a poor substitute: its permission lapses between visits, WebView2
 * does not implement it at all, and it took an IndexedDB store, a memory cache
 * and a permission dance to make one nearly as useful as a string. The branches
 * below that are not path-shaped exist for `npm run dev` in a browser tab,
 * where there is no shell to ask.
 */
export function useVideoIntake({
  onFileSelect,
  onUrlSelect,
  onPathSelect,
  showToast,
  urlLoadError = '',
  onClearUrlError,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [recentFiles, setRecentFiles] = useState(() => getRecentFiles());
  const fileInputRef = useRef(null);
  const dragDepth = useRef(0);

  const posterAttempted = useRef(new Set());

  const refreshRecent = useCallback(() => {
    setRecentFiles(getRecentFiles());
  }, []);

  /* Fill in the tiles that have no picture yet.
   *
   * Entries are given one when their file is opened, so a list built before
   * this existed — or by a version that dropped the field on the way out of
   * storage — is a wall of grey until every one of them is watched again.
   * FFmpeg can read a frame from any of them right now, so it does.
   *
   * Each path is tried once per session. Without that the effect would chase
   * its own tail: a file that cannot produce a frame stays in the missing list,
   * and re-reading the list is what schedules the next attempt. */
  useEffect(() => {
    if (!isDesktop()) return undefined;

    const missing = recentFiles.filter(
      (file) => file.path && !file.poster && !posterAttempted.current.has(file.path)
    );
    if (!missing.length) return undefined;
    missing.forEach((file) => posterAttempted.current.add(file.path));

    let cancelled = false;
    void (async () => {
      let filled = false;
      // One at a time: five FFmpeg processes at once, while a film is also
      // being decoded, is a lot of machine to spend on thumbnails.
      for (const file of missing) {
        const poster = await capturePoster(file.path);
        if (cancelled) return;
        if (poster) {
          setRecentPoster(file.name, poster);
          filled = true;
        }
      }
      if (filled) refreshRecent();
    })();

    return () => {
      cancelled = true;
    };
  }, [recentFiles, refreshRecent]);

  // A load failure reported by the player replaces any local validation error,
  // so the user is never shown two contradictory messages at once.
  useEffect(() => {
    if (urlLoadError) setError('');
  }, [urlLoadError]);

  // A file dropped outside our handlers makes the webview navigate away from
  // the app and render the raw video, which looks like a crash. Swallow those.
  useEffect(() => {
    const swallow = (e) => e.preventDefault();
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  const fail = useCallback((message) => {
    setError(message);
    setTimeout(() => setError(''), 3000);
  }, []);

  /* On the desktop the shell takes the drop before the webview sees it, which
     is what turns a dropped file into a path instead of a nameless handle. The
     HTML drag events below never fire there, so the veil has to be driven from
     the shell's events too.

     Declared after `fail` rather than beside the other effects: a dependency
     array is evaluated during render, and naming a `const` there before its
     initialiser has run is a ReferenceError rather than an undefined. */
  useEffect(() => {
    if (!isDesktop()) return undefined;
    return onFileDrop({
      onOver: () => setIsDragging(true),
      onLeave: () => {
        dragDepth.current = 0;
        setIsDragging(false);
      },
      onDrop: (paths) => {
        const [first] = paths;
        if (!first) return;
        const ext = '.' + first.split('.').pop().toLowerCase();
        if (!ACCEPTED_TYPES.includes(ext)) {
          fail(`Cadence does not open ${ext} files.`);
          return;
        }
        onPathSelect?.(first);
        refreshRecent();
      },
    });
  }, [onPathSelect, refreshRecent, fail]);

  const validateFile = useCallback(
    (file) => {
      if (!file) return false;
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (ACCEPTED_TYPES.includes(ext) || ACCEPTED_MIME.includes(file.type)) return true;
      fail(`Cadence does not open ${ext} files.`);
      return false;
    },
    [fail]
  );

  const acceptFile = useCallback(
    (file) => {
      if (!validateFile(file)) return;
      onFileSelect(file);
      refreshRecent();
    },
    [onFileSelect, refreshRecent, validateFile]
  );

  const openPicker = useCallback(async () => {
    // The desktop shell gets the operating system's own dialog, which hands
    // back a path. In a browser tab there is only the bare input below, which
    // forgets the file the moment it is closed.
    if (isDesktop()) {
      const path = await pickMediaFile();
      if (path) onPathSelect?.(path);
      return;
    }
    fileInputRef.current?.click();
  }, [onPathSelect]);

  const handleFileInput = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) acceptFile(file);
      e.target.value = '';
    },
    [acceptFile]
  );

  const submitUrl = useCallback(() => {
    const trimmed = urlInput.trim();
    onClearUrlError?.();
    if (!trimmed) return;
    if (!URL_PATTERN.test(trimmed) && !trimmed.match(/\.(mp4|webm|mkv|mov|mp3|m4a|flac|opus|ogg|wav)/i)) {
      fail('Enter a direct link to a file (.mp4, .mkv, .mp3, .flac and the like)');
      return;
    }
    onUrlSelect(trimmed);
    setUrlInput('');
    refreshRecent();
  }, [urlInput, onUrlSelect, onClearUrlError, refreshRecent, fail]);

  const openRecent = useCallback(
    (recent) => {
      onClearUrlError?.();
      if (recent.url) {
        onUrlSelect(recent.url);
        refreshRecent();
        return;
      }
      if (recent.path) {
        onPathSelect?.(recent.path);
        refreshRecent();
        return;
      }
      /* No path and no URL. Only reachable in a browser tab, where a file
         picked through the bare input leaves nothing behind to reopen it
         with, so the honest response is to ask for it again. */
      showToast?.(`Pick ${recent.name} again to play it.`);
      void openPicker();
    },
    [onUrlSelect, onPathSelect, onClearUrlError, openPicker, refreshRecent, showToast]
  );

  /* Drag counting rather than a boolean: dragenter/dragleave also fire for
     every child element the cursor crosses, so a naive toggle flickers. */
  const dragProps = useMemo(
    () => ({
      onDragEnter: (e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setIsDragging(true);
      },
      onDragLeave: (e) => {
        e.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setIsDragging(false);
        }
      },
      onDragOver: (e) => e.preventDefault(),
      onDrop: (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = 0;
        setIsDragging(false);
        // `dataTransfer` is only valid for the duration of the handler.
        const file = e.dataTransfer.files[0];
        if (file) acceptFile(file);
      },
    }),
    [acceptFile]
  );

  return {
    isDragging,
    dragProps,
    error: urlLoadError || error,
    urlInput,
    setUrlInput,
    submitUrl,
    openPicker,
    recentFiles,
    openRecent,
    fileInputRef,
    handleFileInput,
    // The desktop shell never falls back to a bare <input>: it has a real
    // dialog behind `openPicker`.
    needsFallbackInput: !isDesktop(),
  };
}
