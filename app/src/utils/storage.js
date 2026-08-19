const BOOKMARK_KEY_PREFIX = 'cadence-bookmarks-';

export const STORAGE_KEYS = {
  POSITION: 'cadence-position-',
  RECENT: 'cadence-recent-files',
  VOLUME: 'cadence-volume',
  BOOST: 'cadence-boost',
  SPEED: 'cadence-speed',
  TIME_DISPLAY: 'cadence-time-display',
  LOOP: 'cadence-loop',
  AMBIENT: 'cadence-ambient',
};

/**
 * Get a sanitized key from a filename
 * @param {string} filename
 * @returns {string}
 */
function sanitizeKey(filename) {
  return filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

/**
 * Remove all bookmark data from localStorage.
 */
export function clearBookmarkStorage() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(BOOKMARK_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}

/**
 * Save playback position for a video file
 * @param {string} filename
 * @param {number} position - Time in seconds
 */
export function savePosition(filename, position) {
  try {
    localStorage.setItem(
      STORAGE_KEYS.POSITION + sanitizeKey(filename),
      JSON.stringify({ position, timestamp: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

/**
 * Load saved playback position for a video file
 * @param {string} filename
 * @returns {{ position: number, timestamp: number } | null}
 */
export function loadPosition(filename) {
  try {
    const data = localStorage.getItem(
      STORAGE_KEYS.POSITION + sanitizeKey(filename)
    );
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/**
 * @typedef {{ name: string, size: number, openedAt: number, path?: string, url?: string, poster?: string }} RecentFile
 */

/**
 * Normalize legacy recent file entries (plain strings) to objects.
 *
 * Every field an entry can carry has to be named here. Listing only some of
 * them is not a smaller version of the same thing: `path` and `poster` were
 * written on the way in and dropped on the way out, so the list showed grey
 * tiles and, when clicked, offered the file picker for a file it was already
 * holding the path to.
 *
 * @param {unknown} entry
 * @returns {RecentFile|null}
 */
function normalizeRecentEntry(entry) {
  if (typeof entry === 'string') {
    return { name: entry, size: 0, openedAt: Date.now() };
  }
  if (entry && typeof entry === 'object' && entry.name) {
    return {
      name: entry.name,
      size: entry.size ?? 0,
      openedAt: entry.openedAt ?? Date.now(),
      ...(entry.path ? { path: entry.path } : {}),
      ...(entry.url ? { url: entry.url } : {}),
      ...(entry.poster ? { poster: entry.poster } : {}),
    };
  }
  return null;
}

/**
 * Add a file to the recent files list
 * @param {{ name: string, size?: number, url?: string }} fileInfo
 */
export function addRecentFile(fileInfo) {
  try {
    const recent = getRecentFiles();
    const entry = {
      name: fileInfo.name,
      size: fileInfo.size ?? 0,
      openedAt: Date.now(),
      /* The path is what makes an entry re-openable. Without it the list can
         only ever offer to show the file picker again, which is not a recent
         files list, it is a button that says "find it yourself". */
      ...(fileInfo.path ? { path: fileInfo.path } : {}),
      ...(fileInfo.url ? { url: fileInfo.url } : {}),
      ...(fileInfo.poster ? { poster: fileInfo.poster } : {}),
    };
    const previous = recent.find((f) => f.name === entry.name);
    // A re-open should not lose the poster captured the first time round.
    if (previous?.poster && !entry.poster) entry.poster = previous.poster;
    const filtered = recent.filter((f) => f.name !== entry.name);
    filtered.unshift(entry);
    localStorage.setItem(
      STORAGE_KEYS.RECENT,
      JSON.stringify(filtered.slice(0, 5))
    );
  } catch {
    /* ignore */
  }
}

/**
 * Attach a poster to an entry already in the list, without disturbing it.
 *
 * Separate from `addRecentFile` because that one means "this was just opened":
 * it stamps the time and moves the entry to the front. A picture arriving for
 * something watched last week is not a reason to claim it was watched now.
 *
 * @param {string} name
 * @param {string} poster
 */
export function setRecentPoster(name, poster) {
  try {
    const recent = getRecentFiles();
    const entry = recent.find((file) => file.name === name);
    if (!entry) return;
    entry.poster = poster;
    localStorage.setItem(STORAGE_KEYS.RECENT, JSON.stringify(recent));
  } catch {
    /* ignore */
  }
}

/**
 * Get the list of recent files
 * @returns {RecentFile[]}
 */
export function getRecentFiles() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.RECENT);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeRecentEntry).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Save volume level
 * @param {number} volume - 0 to 1
 */
export function saveVolume(volume) {
  try {
    localStorage.setItem(STORAGE_KEYS.VOLUME, String(volume));
  } catch {
    /* ignore */
  }
}

/**
 * Save the volume boost.
 *
 * Kept apart from the volume itself because they answer different questions:
 * how loud you want it now, and how much this machine's speakers need help.
 * @param {number} boost
 */
export function saveBoost(boost) {
  try {
    localStorage.setItem(STORAGE_KEYS.BOOST, String(boost));
  } catch {
    /* ignore */
  }
}

/**
 * Load the saved volume boost.
 * @returns {number}
 */
export function loadBoost() {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.BOOST);
    const parsed = v !== null ? parseFloat(v) : 1;
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  } catch {
    return 1;
  }
}

/**
 * Load saved volume level
 * @returns {number}
 */
export function loadVolume() {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.VOLUME);
    return v !== null ? parseFloat(v) : 1;
  } catch {
    return 1;
  }
}

/**
 * Save playback speed
 * @param {number} speed
 */
export function saveSpeed(speed) {
  try {
    localStorage.setItem(STORAGE_KEYS.SPEED, String(speed));
  } catch {
    /* ignore */
  }
}

/**
 * Load saved playback speed
 * @returns {number}
 */
export function loadSpeed() {
  try {
    const s = localStorage.getItem(STORAGE_KEYS.SPEED);
    return s !== null ? parseFloat(s) : 1;
  } catch {
    return 1;
  }
}

/**
 * Save time display mode preference
 * @param {'elapsed' | 'remaining'} mode
 */
export function saveTimeDisplayMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEYS.TIME_DISPLAY, mode);
  } catch {
    /* ignore */
  }
}

/**
 * Load time display mode preference
 * @returns {'elapsed' | 'remaining'}
 */
export function loadTimeDisplayMode() {
  try {
    const mode = localStorage.getItem(STORAGE_KEYS.TIME_DISPLAY);
    return mode === 'remaining' ? 'remaining' : 'elapsed';
  } catch {
    return 'elapsed';
  }
}

/**
 * Save loop preference
 * @param {boolean} loop
 */
export function saveLoop(loop) {
  try {
    localStorage.setItem(STORAGE_KEYS.LOOP, loop ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * Load loop preference
 * @returns {boolean}
 */
export function loadLoop() {
  try {
    return localStorage.getItem(STORAGE_KEYS.LOOP) === '1';
  } catch {
    return false;
  }
}

/**
 * Save ambient mode preference
 * @param {boolean} enabled
 */
export function saveAmbient(enabled) {
  try {
    localStorage.setItem(STORAGE_KEYS.AMBIENT, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * Load ambient mode preference
 * @returns {boolean}
 */
export function loadAmbient() {
  try {
    return localStorage.getItem(STORAGE_KEYS.AMBIENT) === '1';
  } catch {
    return false;
  }
}
