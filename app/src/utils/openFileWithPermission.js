/**
 * Chrome only keeps a file permission across sessions for an installed app;
 * in a tab the grant dies with the tab no matter what the page does. Knowing
 * which one we are in is the difference between telling the user how to stop
 * being asked and pretending we can stop asking.
 *
 * @returns {boolean}
 */
export function isInstalledApp() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    window.navigator.standalone === true
  );
}

/**
 * Open a FileSystemFileHandle with read permission.
 *
 * A handle read back from IndexedDB survives a reload but its permission does
 * not: it reverts to `prompt`, so the first click of every session has to ask.
 * Asking is `requestPermission`, and it has to be the first thing that touches
 * the handle. Calling `getFile()` first, hoping permission is already there,
 * rejects with the same shape of error as a file that has been moved or
 * deleted, and the caller then can't tell "needs a prompt" from "gone", which
 * is how a small permission bubble turned into a full file picker.
 *
 * @param {FileSystemFileHandle} handle
 * @returns {Promise<{ file: File|null, denied: boolean, missing: boolean }>}
 */
export async function openFileWithPermission(handle) {
  if (!handle || typeof handle.getFile !== 'function') {
    return { file: null, denied: false, missing: false };
  }

  let state = 'granted';

  if (typeof handle.queryPermission === 'function') {
    try {
      state = await handle.queryPermission({ mode: 'read' });
    } catch {
      state = 'prompt';
    }
  }

  if (state === 'prompt' && typeof handle.requestPermission === 'function') {
    try {
      state = await handle.requestPermission({ mode: 'read' });
    } catch {
      /* Thrown when the click's user activation has already expired. Nothing
         was denied, so don't say it was. The next click will ask properly. */
      return { file: null, denied: true, missing: false };
    }
  }

  if (state !== 'granted') {
    return { file: null, denied: true, missing: false };
  }

  try {
    const file = await handle.getFile();
    return { file, denied: false, missing: false };
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    /* Permission is granted at this point, so a failure here can only be the
       file itself: moved, renamed or deleted. */
    return { file: null, denied: false, missing: true };
  }
}
