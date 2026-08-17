import { STORAGE_KEYS } from './storage';
import { isDesktop } from '../lib/desktop';

const PRUNE_FLAG = 'cadence-recents-pruned';

/**
 * Drop recent entries the desktop application cannot reopen.
 *
 * Recents used to be stored as a name and a size, with the bytes reachable only
 * through a File System Access handle in IndexedDB. That handle does not exist
 * in the desktop shell, so those entries have nothing behind them: clicking one
 * could only fall through to the file picker, which is not reopening a recent
 * file, it is asking the user to find it again while pretending otherwise.
 *
 * Entries written since carry the path, and a path always works. This clears
 * out the ones written before, once, so the list contains only tiles that do
 * what they look like they do.
 */
export function pruneUnopenableRecents() {
  try {
    if (!isDesktop()) return;
    if (localStorage.getItem(PRUNE_FLAG) === 'true') return;

    const raw = localStorage.getItem(STORAGE_KEYS.RECENT);
    if (raw) {
      const entries = JSON.parse(raw);
      if (Array.isArray(entries)) {
        const keep = entries.filter((entry) => entry?.path || entry?.url);
        if (keep.length !== entries.length) {
          localStorage.setItem(STORAGE_KEYS.RECENT, JSON.stringify(keep));
        }
      }
    }

    localStorage.setItem(PRUNE_FLAG, 'true');
  } catch {
    /* A malformed list is not worth failing a launch over. */
  }
}
