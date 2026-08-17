/**
 * The app's IndexedDB, which now holds bookmarks and nothing else.
 *
 * Version 4 drops `recentFiles`. That store existed to hold a
 * `FileSystemFileHandle` per recent entry, back when a file the app had opened
 * could only be named, not located. A recent entry carries the file's path now,
 * so the store has nothing left to hold, and leaving it behind would keep its
 * handles counting against the origin's storage quota. Version 3 retired
 * `folders` and `folderFiles` the same way.
 *
 * This module owns the schema. Anything that needs the database opens it
 * through `openDB` rather than calling `indexedDB.open` with its own copy of
 * the version number: two openers disagreeing is a VersionError that only shows
 * up on the machines that already have the older database.
 */

const DB_NAME = 'cadence-db';
const DB_VERSION = 4;

const BOOKMARKS_STORE = 'bookmarks';

const RETIRED_STORES = ['folders', 'folderFiles', 'recentFiles'];

/**
 * @returns {Promise<IDBDatabase|null>}
 */
export function openDB() {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => resolve(null);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(BOOKMARKS_STORE)) {
          const store = db.createObjectStore(BOOKMARKS_STORE, { keyPath: 'id' });
          store.createIndex('videoKey', 'videoKey', { unique: false });
        }
        for (const name of RETIRED_STORES) {
          if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
        }
      };
    } catch {
      resolve(null);
    }
  });
}
