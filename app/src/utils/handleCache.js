/**
 * Handles held in memory for the life of the page.
 *
 * Re-opening a recent file needs `requestPermission()`, which only works inside
 * a user gesture. Reading the handle back from IndexedDB first costs an await,
 * and awaits can outlive the gesture, so handles are warmed into this map on
 * load and the click path reads from memory.
 *
 * @type {Map<string, FileSystemFileHandle>}
 */
const recentFileHandles = new Map();

export function cacheRecentHandle(name, handle) {
  if (name && handle) recentFileHandles.set(name, handle);
}

export function getCachedRecentHandle(name) {
  return recentFileHandles.get(name) ?? null;
}

export function removeCachedRecentHandle(name) {
  recentFileHandles.delete(name);
}
