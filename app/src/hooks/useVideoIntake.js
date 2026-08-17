import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { getRecentFiles } from '../utils/storage';
import {
  supportsFileSystemAccess,
  VIDEO_PICKER_OPTIONS,
  saveFileHandle,
  warmRecentHandleCache,
} from '../utils/fileHandles';
import { openRecentFile } from '../utils/recentFileOpen';
import { isDesktop, pickVideoFile, onFileDrop } from '../lib/desktop';

export const ACCEPTED_TYPES = ['.mp4', '.webm', '.mkv', '.mov'];
const ACCEPTED_MIME = ['video/mp4', 'video/webm', 'video/x-matroska', 'video/quicktime'];
const URL_PATTERN = /^https?:\/\/.+\.(mp4|webm|mkv|mov)(\?.*)?$/i;

/**
 * Every way a video can enter the app: dropped, picked, pasted as a URL, or
 * re-opened from the recent list.
 *
 * This lives in a hook rather than in the drop zone component because the home
 * screen now spreads those affordances across several sibling components: the
 * card, the URL field and the recent grid all mutate the same error and
 * recent-files state, and a drop is accepted anywhere on the page.
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

  const refreshRecent = useCallback(() => {
    setRecentFiles(getRecentFiles());
  }, []);

  useEffect(() => {
    refreshRecent();
    warmRecentHandleCache();
  }, [refreshRecent]);

  // A load failure reported by the player replaces any local validation error,
  // so the user is never shown two contradictory messages at once.
  useEffect(() => {
    if (urlLoadError) setError('');
  }, [urlLoadError]);

  // A file dropped outside our handlers makes the browser navigate away from
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
          fail(`That format isn't supported. Use ${ACCEPTED_TYPES.join(', ')}`);
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
      fail(`That format isn't supported. Use ${ACCEPTED_TYPES.join(', ')}`);
      return false;
    },
    [fail]
  );

  const acceptFile = useCallback(
    (file, handle) => {
      if (!validateFile(file)) return;
      onFileSelect(file, handle);
      refreshRecent();
    },
    [onFileSelect, refreshRecent, validateFile]
  );

  const openPicker = useCallback(async () => {
    /* The desktop shell gets the operating system's own dialog, which hands
       back a path. That is the better of the two identities a file can have
       here: a path is still valid after a restart, where a browser file handle
       has to have its permission granted again, and WebView2 does not
       implement the handle API at all, so the alternative inside the app is
       the bare <input> below, which forgets the file the moment it is closed. */
    if (isDesktop()) {
      const path = await pickVideoFile();
      if (path) onPathSelect?.(path);
      return;
    }
    if (!supportsFileSystemAccess()) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker(VIDEO_PICKER_OPTIONS);
      const file = await handle.getFile();
      if (!validateFile(file)) return;
      await saveFileHandle({ handle, name: file.name, size: file.size, lastOpened: Date.now() });
      onFileSelect(file, handle);
      refreshRecent();
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (err?.name === 'NotAllowedError') {
        showToast?.('Permission denied. Try opening the file again.');
      }
    }
  }, [onFileSelect, onPathSelect, refreshRecent, showToast, validateFile]);

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
    if (!URL_PATTERN.test(trimmed) && !trimmed.match(/\.(mp4|webm|mkv|mov)/i)) {
      fail('Enter a direct video URL (.mp4, .webm, .mkv, .mov)');
      return;
    }
    onUrlSelect(trimmed);
    setUrlInput('');
    refreshRecent();
  }, [urlInput, onUrlSelect, onClearUrlError, refreshRecent, fail]);

  const openRecent = useCallback(
    async (recent) => {
      onClearUrlError?.();
      await openRecentFile(recent, {
        onPlayFile: (file, handle) => acceptFile(file, handle),
        onPlayUrl: (url) => {
          onUrlSelect(url);
          refreshRecent();
        },
        onPlayPath: (path) => {
          onPathSelect?.(path);
          refreshRecent();
        },
        onFallbackPicker: openPicker,
        showToast,
      });
    },
    [acceptFile, onUrlSelect, onPathSelect, onClearUrlError, openPicker, refreshRecent, showToast]
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

        /* Both of these must be read before the first await: `dataTransfer` is
           only valid for the duration of the event handler.

           `getAsFileSystemHandle` is what makes a dropped file re-openable
           later. Without it a drop yields a bare File, the recent entry gets
           saved with no handle behind it, and every later click on that entry
           can only apologise and ask for the file again. */
        const file = e.dataTransfer.files[0];
        const item = e.dataTransfer.items?.[0];
        const handlePromise =
          item && typeof item.getAsFileSystemHandle === 'function'
            ? item.getAsFileSystemHandle().catch(() => null)
            : Promise.resolve(null);

        if (!file) return;

        handlePromise.then((handle) => {
          acceptFile(file, handle?.kind === 'file' ? handle : undefined);
        });
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
    // dialog, even though WebView2 lacks the handle API that would otherwise
    // be the test for one.
    needsFallbackInput: !isDesktop() && !supportsFileSystemAccess(),
  };
}
