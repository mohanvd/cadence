/**
 * One-time rename of stored keys onto the current `cadence-*` names.
 *
 * Renaming a storage key without moving the data is silent data loss: every
 * bookmark, saved position and preference would still be on disk but under a
 * name nothing reads any more. This copies each value across, then removes the
 * original, and records that it ran so it never repeats.
 *
 * The table maps every historic name straight to its current one rather than
 * chaining rename to rename. A returning user is on exactly one generation of
 * keys, whichever release they last opened, so one hop is all any of them need.
 */

const MIGRATION_FLAG = 'cadence-storage-migrated';

/** Flags from earlier renames; dead weight once this one has run. */
const STALE_FLAGS = ['xenon-storage-migrated'];

/** Old prefix or exact key -> current name. Prefixes end with `_` or `-`. */
const RENAMES = [
  ['vp_position_', 'cadence-position-'],
  ['vp_recent_files', 'cadence-recent-files'],
  ['vp_volume', 'cadence-volume'],
  ['vp_speed', 'cadence-speed'],
  ['vp_time_display_mode', 'cadence-time-display'],
  ['vp_bookmarks_', 'cadence-bookmarks-'],
  ['auva-play-loop', 'cadence-loop'],
  ['auva-ambient', 'cadence-ambient'],
  ['auva-audio-eq', 'cadence-audio-eq'],
  ['auva-subtitle-style', 'cadence-subtitle-style'],
  ['auva-video-filters', 'cadence-video-filters'],
  ['auva-install-dismissed', 'cadence-install-dismissed'],
  ['auva-landscape-tip', 'cadence-landscape-tip'],
  ['xenon-position-', 'cadence-position-'],
  ['xenon-recent-files', 'cadence-recent-files'],
  ['xenon-volume', 'cadence-volume'],
  ['xenon-speed', 'cadence-speed'],
  ['xenon-time-display', 'cadence-time-display'],
  ['xenon-bookmarks-', 'cadence-bookmarks-'],
  ['xenon-loop', 'cadence-loop'],
  ['xenon-ambient', 'cadence-ambient'],
  ['xenon-audio-eq', 'cadence-audio-eq'],
  ['xenon-subtitle-style', 'cadence-subtitle-style'],
  ['xenon-video-filters', 'cadence-video-filters'],
  ['xenon-install-dismissed', 'cadence-install-dismissed'],
  ['xenon-landscape-tip', 'cadence-landscape-tip'],
];

export function migrateStorage() {
  try {
    if (localStorage.getItem(MIGRATION_FLAG) === 'true') return;

    // Snapshot first: writing while iterating `localStorage` is undefined.
    const entries = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key) entries.push([key, localStorage.getItem(key)]);
    }

    for (const [key, value] of entries) {
      for (const [from, to] of RENAMES) {
        if (key === from) {
          localStorage.setItem(to, value);
          localStorage.removeItem(key);
          break;
        }
        // Prefixed keys carry a per-file suffix that must be preserved.
        if ((from.endsWith('_') || from.endsWith('-')) && key.startsWith(from)) {
          localStorage.setItem(to + key.slice(from.length), value);
          localStorage.removeItem(key);
          break;
        }
      }
    }

    for (const flag of STALE_FLAGS) localStorage.removeItem(flag);
    localStorage.setItem(MIGRATION_FLAG, 'true');
  } catch {
    // Private browsing or a full quota; the app still works on defaults.
  }
}
