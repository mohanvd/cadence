const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Short, glanceable age for a timestamp: "just now", "3h", "2d".
 *
 * Deliberately terse: this sits in the metadata line of a card where the file
 * name is what matters, so the age has to stay visually quiet.
 *
 * @param {number} timestamp epoch milliseconds
 * @returns {string}
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const elapsed = Date.now() - timestamp;
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
