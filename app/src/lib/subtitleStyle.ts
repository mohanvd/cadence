/**
 * How subtitles are drawn: the defaults, the values each setting may take, and
 * a way to clean up a saved style before trusting it.
 *
 * Its own module because two things need it and neither may import the other:
 * the subtitles hook, which draws with the style, and the settings store, which
 * keeps it. The hook re-exports `SUBTITLE_OPTIONS` for the menus that already
 * read it from there.
 */

/**
 * How the cues are drawn.
 *
 * Stored as plain numbers and names rather than as finished CSS, so that the
 * menu has something to put a tick beside. A colour kept as
 * `rgba(0, 0, 0, 0.75)` can be applied and cannot be answered questions about:
 * "is the backdrop black" becomes string comparison, and "is it 75%" becomes a
 * regular expression, which is what the backdrop control used to be.
 */
export interface SubtitleStyle {
  family: string;
  size: number;
  color: string;
  opacity: number;
  backgroundColor: string;
  backgroundOpacity: number;
  edge: string;
}

type Option = { value: string | number; label: string };

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  family: 'sans',
  /** Percent of the player's own base size, the way YouTube counts it. */
  size: 100,
  color: '#ffffff',
  opacity: 100,
  backgroundColor: '#000000',
  backgroundOpacity: 75,
  edge: 'shadow',
};

/** The values each setting is allowed to take, and the menu's list of them. */
export const SUBTITLE_OPTIONS: Record<keyof SubtitleStyle, Option[]> = {
  family: [
    { value: 'sans', label: 'Sans-serif' },
    { value: 'serif', label: 'Serif' },
    { value: 'mono', label: 'Monospace' },
    { value: 'rounded', label: 'Rounded' },
  ],
  size: [50, 75, 100, 150, 200, 300].map((value) => ({ value, label: `${value}%` })),
  color: [
    { value: '#ffffff', label: 'White' },
    { value: '#ffff00', label: 'Yellow' },
    { value: '#00ff00', label: 'Green' },
    { value: '#00ffff', label: 'Cyan' },
    { value: '#ff0000', label: 'Red' },
    { value: '#000000', label: 'Black' },
  ],
  opacity: [25, 50, 75, 100].map((value) => ({ value, label: `${value}%` })),
  backgroundColor: [
    { value: '#000000', label: 'Black' },
    { value: '#ffffff', label: 'White' },
    { value: '#ff0000', label: 'Red' },
    { value: '#0000ff', label: 'Blue' },
    { value: '#ffff00', label: 'Yellow' },
  ],
  backgroundOpacity: [0, 25, 50, 75, 100].map((value) => ({ value, label: `${value}%` })),
  edge: [
    { value: 'none', label: 'None' },
    { value: 'shadow', label: 'Drop shadow' },
    { value: 'outline', label: 'Outline' },
    { value: 'raised', label: 'Raised' },
  ],
};

/**
 * A saved style, keeping only the values the menus can still offer.
 *
 * What is on disk was written by an older version of this code, and the shape
 * has already changed once: the size used to be the string `'18px'` and the
 * backdrop a whole `rgba()` expression. Merging that over the defaults would
 * put a string where the menu now expects a number and leave the text
 * undrawable. So it is checked value by value, and anything unrecognised is
 * dropped rather than repaired: one bad value must not cost the viewer the
 * other six.
 */
export function sanitizeSubtitleStyle(saved: unknown): SubtitleStyle {
  const style: Record<string, unknown> = { ...DEFAULT_SUBTITLE_STYLE };
  if (!saved || typeof saved !== 'object') return style as unknown as SubtitleStyle;
  const record = saved as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SUBTITLE_STYLE) as (keyof SubtitleStyle)[]) {
    if (SUBTITLE_OPTIONS[key].some((option) => option.value === record[key])) {
      style[key] = record[key];
    }
  }
  return style as unknown as SubtitleStyle;
}
