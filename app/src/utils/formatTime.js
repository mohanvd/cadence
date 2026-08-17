/**
 * Re-export of the timecode formatter for the legacy `.jsx` screens.
 *
 * The implementation now lives in `lib/format.ts`; this shim keeps a single
 * source of truth while the remaining screens are still on JavaScript, so the
 * two can never drift apart.
 */
export { formatTime } from '../lib/format';
