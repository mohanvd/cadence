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

/**
 * The name a language tag should be shown under.
 *
 * Container metadata carries ISO 639-2 codes, so a subtitle menu built from it
 * reads `ara`, `eng`, `jpn` — accurate and useless to the person choosing.
 * `Intl.DisplayNames` holds the translations the browser already ships for its
 * own interface, which is a better list than any table kept here would be, and
 * it is asked in the viewer's own language rather than in English.
 *
 * The code itself is the fallback, for the tags it does not recognise. Showing
 * `mis` is worse than showing "Uncoded" and better than showing nothing.
 */
export function formatLanguage(tag: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/**
 * What to call a track in a menu.
 *
 * A file names its tracks in one of three ways and often in none: a title in
 * the metadata ("Signs & Songs", "Forced"), a language tag, or neither. The
 * title wins where both exist, because a rip that bothered to name a track
 * named it more precisely than its language does — but the language is kept
 * beside it, since "Full" and "Full" tell two tracks apart only when one of
 * them says English and the other Arabic.
 */
export function describeTrack(track: {
  label?: string;
  language?: string;
  codec?: string;
}): string {
  const language = track.language ? formatLanguage(track.language) : null;
  if (track.label && language && !track.label.toLowerCase().includes(language.toLowerCase())) {
    return `${track.label} — ${language}`;
  }
  return track.label ?? language ?? track.codec ?? 'Track';
}

export function formatSpeed(rate: number): string {
  const text = Number.isInteger(rate) ? String(rate) : String(rate).replace(/0+$/, '');
  return `${text}×`;
}
