/**
 * Copies IndexedDB contents from any previously-named database into
 * `cadence-db`.
 *
 * Renaming a database does not move anything, it just points the app at a new,
 * empty one. Everything in the old database would still exist and simply never
 * be read again: recent-file handles that carry granted read permission, and
 * every bookmark.
 *
 * File handles are structured-cloneable, so they survive the copy and keep
 * their permission. Old databases are left in place rather than deleted, so a
 * failed migration is recoverable.
 */

const OLD_DBS = ['xenon-db', 'auva-play-db'];
const NEW_DB = 'cadence-db';
const DB_VERSION = 3;
/* `folders` and `folderFiles` are deliberately absent: the library feature they
   belonged to is gone, so copying them forward would only recreate stores that
   the version 3 upgrade immediately deletes again. */
const STORES = ['recentFiles', 'bookmarks'];
const FLAG = 'cadence-db-migrated';
const STALE_FLAGS = ['xenon-db-migrated'];

function openDatabase(name, upgrade) {
  return new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(name, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
    if (upgrade) request.onupgradeneeded = (event) => upgrade(event.target.result);
  });
}

function createStores(db) {
  if (!db.objectStoreNames.contains('recentFiles')) {
    db.createObjectStore('recentFiles', { keyPath: 'name' });
  }
  if (!db.objectStoreNames.contains('bookmarks')) {
    const store = db.createObjectStore('bookmarks', { keyPath: 'id' });
    store.createIndex('videoKey', 'videoKey', { unique: false });
  }
  for (const name of ['folders', 'folderFiles']) {
    if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
  }
}

function readAll(db, store) {
  return new Promise((resolve) => {
    if (!db.objectStoreNames.contains(store)) {
      resolve([]);
      return;
    }
    try {
      const request = db.transaction(store, 'readonly').objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function writeAll(db, store, rows) {
  return new Promise((resolve) => {
    if (rows.length === 0 || !db.objectStoreNames.contains(store)) {
      resolve(0);
      return;
    }
    try {
      const tx = db.transaction(store, 'readwrite');
      const target = tx.objectStore(store);
      for (const row of rows) target.put(row);
      tx.oncomplete = () => resolve(rows.length);
      tx.onerror = () => resolve(0);
      tx.onabort = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}

/** Returns a per-store count of what was copied, or null if it did not run. */
export async function migrateDatabase() {
  try {
    if (localStorage.getItem(FLAG) === 'true') return null;

    // `databases()` avoids creating an old database just to find it empty.
    let candidates = OLD_DBS;
    if (typeof indexedDB.databases === 'function') {
      const existing = await indexedDB.databases().catch(() => []);
      const names = new Set(existing.map((entry) => entry.name));
      candidates = OLD_DBS.filter((name) => names.has(name));
      if (candidates.length === 0) {
        localStorage.setItem(FLAG, 'true');
        for (const flag of STALE_FLAGS) localStorage.removeItem(flag);
        return null;
      }
    }

    // Newest naming first, so a user who passed through several renames gets
    // their most recent data rather than a stale generation of it.
    let payload = null;
    for (const name of candidates) {
      const oldDb = await openDatabase(name, createStores);
      if (!oldDb) continue;
      const rows = {};
      for (const store of STORES) rows[store] = await readAll(oldDb, store);
      oldDb.close();
      if (STORES.some((store) => rows[store].length > 0)) {
        payload = rows;
        break;
      }
    }

    if (!payload) {
      localStorage.setItem(FLAG, 'true');
      for (const flag of STALE_FLAGS) localStorage.removeItem(flag);
      return null;
    }

    const newDb = await openDatabase(NEW_DB, createStores);
    if (!newDb) return null;

    const copied = {};
    for (const store of STORES) {
      copied[store] = await writeAll(newDb, store, payload[store]);
    }
    newDb.close();

    localStorage.setItem(FLAG, 'true');
    for (const flag of STALE_FLAGS) localStorage.removeItem(flag);
    return copied;
  } catch {
    // Leave the flag unset so a transient failure retries on the next load.
    return null;
  }
}
