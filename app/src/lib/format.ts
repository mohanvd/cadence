/**
 * Format seconds as a timecode, omitting the hours field unless it is needed.
 *
 * `total` lets a whole timeline agree on width: when a video is over an hour,
 * even the early timestamps render as `0:05:03` so the text does not jump from
 * five characters to seven mid-playback.
 */
export function formatTime(seconds: number, total?: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;

  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;

  const showHours = hours > 0 || (total !== undefined && total >= 3600);

  if (showHours) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/** Signed offset for seek feedback, e.g. `+10s`. */
export function formatOffset(seconds: number): string {
  const sign = seconds >= 0 ? '+' : '−';
  return `${sign}${Math.abs(Math.round(seconds))}s`;
}

export function formatFileSize(bytes: number): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatSpeed(rate: number): string {
  const text = Number.isInteger(rate) ? String(rate) : String(rate).replace(/0+$/, '');
  return `${text}×`;
}
