/**
 * The app's IndexedDB: recent file handles, and bookmarks.
 *
 * Version 3 drops the `folders` and `folderFiles` stores along with the library
 * feature they backed. Deleting them in the upgrade rather than leaving them
 * behind means the handles they held stop counting against the origin's
 * storage quota.
 *
 * This module owns the connection. Anything else that needs the database opens
 * it through `openDB` rather than calling `indexedDB.open` with its own copy of
 * the schema: two openers disagreeing about the version is a VersionError that
 * only shows up on the machines that already have the older database.
 */

const DB_NAME = 'cadence-db';
const DB_VERSION = 3;

const STORES = {
  RECENT_FILES: 'recentFiles',
  BOOKMARKS: 'bookmarks',
};

const RETIRED_STORES = ['folders', 'folderFiles'];

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
        if (!db.objectStoreNames.contains(STORES.RECENT_FILES)) {
          db.createObjectStore(STORES.RECENT_FILES, { keyPath: 'name' });
        }
        if (!db.objectStoreNames.contains(STORES.BOOKMARKS)) {
          const store = db.createObjectStore(STORES.BOOKMARKS, { keyPath: 'id' });
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

function runTransaction(storeName, mode, fn) {
  return openDB().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let result;
        try {
          result = fn(store, tx);
        } catch {
          result = null;
        }
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    });
  });
}

function runRequest(request) {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export function createId() {
  return crypto.randomUUID();
}

// ── Recent file handles ──

/**
 * @typedef {{ handle: FileSystemFileHandle, name: string, size: number, lastOpened: number }} RecentFileRecord
 */

/** @param {RecentFileRecord} record */
export async function saveRecentFileHandle(record) {
  if (!record?.handle) return false;
  const ok = await runTransaction(STORES.RECENT_FILES, 'readwrite', (store) => {
    store.put({
      handle: record.handle,
      name: record.name,
      size: record.size,
      lastOpened: record.lastOpened ?? Date.now(),
    });
  });
  return ok !== null;
}

/** @param {string} name @returns {Promise<RecentFileRecord|null>} */
export async function getRecentFileHandle(name) {
  return runTransaction(STORES.RECENT_FILES, 'readonly', (store) => runRequest(store.get(name)));
}

/** @returns {Promise<RecentFileRecord[]>} */
export async function getAllRecentFileHandles() {
  const records = await runTransaction(STORES.RECENT_FILES, 'readonly', (store) =>
    runRequest(store.getAll())
  );
  if (!Array.isArray(records)) return [];
  return records.sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0));
}

/** @param {string} name */
export async function deleteRecentFileHandle(name) {
  const ok = await runTransaction(STORES.RECENT_FILES, 'readwrite', (store) => {
    store.delete(name);
  });
  return ok !== null;
}
