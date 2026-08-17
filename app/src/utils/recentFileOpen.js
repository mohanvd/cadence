import { getRecentFileHandle, saveRecentFileHandle } from './db';
import { openFileWithPermission, isInstalledApp } from './openFileWithPermission';
import { getCachedRecentHandle, cacheRecentHandle } from './handleCache';
import { isDesktop } from '../lib/desktop';

/**
 * Re-open a recent entry.
 *
 * On the desktop the entry carries the file's path, and a path is all it takes:
 * it survives a restart, it needs no permission re-granted, and reopening is
 * indistinguishable from opening. Everything below that is the browser story,
 * where localStorage holds the name and IndexedDB holds a handle that may or
 * may not still grant access.
 *
 * @param {{ name: string, url?: string, path?: string }} recent
 * @param {{ onPlayFile: Function, onPlayUrl?: Function, onPlayPath?: Function, onFallbackPicker?: Function, showToast?: Function }} callbacks
 */
export async function openRecentFile(
  recent,
  { onPlayFile, onPlayUrl, onPlayPath, onFallbackPicker, showToast },
) {
  if (recent.url) {
    onPlayUrl?.(recent.url);
    return;
  }

  if (recent.path && isDesktop()) {
    onPlayPath?.(recent.path);
    return;
  }

  /* Read from memory first. Falling through to IndexedDB costs an await, and
     the permission prompt below has to run while the click still counts as a
     user gesture. */
  let handle = getCachedRecentHandle(recent.name);

  if (!handle) {
    const record = await getRecentFileHandle(recent.name);
    handle = record?.handle ?? null;
    if (handle) cacheRecentHandle(recent.name, handle);
  }

  if (!handle) {
    onFallbackPicker?.();
    return;
  }

  try {
    const { file, denied, missing } = await openFileWithPermission(handle);

    /* Denial is not a dead end and not a reason to throw the file picker at
       the user: the handle is still good and the next click asks again. */
    if (denied) {
      showToast?.(
        isInstalledApp()
          ? `Allow access to play ${recent.name}. Choose "Allow on every visit" and Cadence won't ask again.`
          : `Allow access to play ${recent.name}. Install Cadence to keep access between visits.`
      );
      return;
    }

    if (missing || !file) {
      // The handle is stale: the file was moved, renamed or deleted.
      showToast?.(`${recent.name} has moved. Pick it again.`);
      onFallbackPicker?.();
      return;
    }

    cacheRecentHandle(recent.name, handle);
    await saveRecentFileHandle({
      handle,
      name: file.name,
      size: file.size,
      lastOpened: Date.now(),
    });

    onPlayFile(file, handle);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    showToast?.(`Could not reopen ${recent.name}. Pick it again.`);
    onFallbackPicker?.();
  }
}
