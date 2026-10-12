import { GLYPHS, type GlyphName } from './glyphs';

/**
 * The application's icon vocabulary, in one place.
 *
 * The glyphs are Cadence's own, drawn in `brand/icons/glyphs.mjs` to the same
 * geometry as the mark and copied in as `./glyphs.ts` by `npm run brand`. They
 * replaced Lucide, which is a fine set and somebody else's: next to the mark,
 * its proportions and its play button were the two things in the window that
 * plainly came from another drawing.
 *
 * Two rules, and the second one is arithmetic rather than taste:
 *
 *   • Transport is solid. Play, pause and the skips are filled, built from the
 *     mark's own rounded bars; everything else is outline. Solid is how the eye
 *     finds the thing to press over a moving picture, without a colour or a
 *     border doing the work. Each glyph says for itself which parts are solid.
 *
 *   • Every outline glyph lands on the same stroke *as drawn on screen*, no
 *     matter what size it is asked for.
 *
 * The second rule is the one that was being broken everywhere. A set drawn on
 * a 24 unit grid comes out at 2px in a 24px box and 1.5px in an 18px one if the
 * stroke is left alone. Call sites were picking a size and a stroke
 * independently, and the result was seven different weights between 0.85px and
 * 2px: a title bar lighter than the control row, a drop card heavier than both,
 * and a window that looked assembled out of several other people's
 * applications. Passing a size here rather than sizing the glyph from the
 * outside is what makes that impossible to do again.
 */

/** What every outline glyph measures on screen, whatever box it sits in. */
export const ICON_STROKE = 1.75;

/**
 * The window controls, which are lighter on purpose.
 *
 * They are the one part of the interface that is not Cadence talking: minimise,
 * maximise and close belong to Windows, they sit where Windows puts them, and
 * every other application on the desktop draws them at about this weight.
 * Matching the control row here would be consistency with the wrong thing.
 */
export const CHROME_STROKE = 1.25;

export type IconName = GlyphName;

export function Icon({
  name,
  size = 18,
  stroke = ICON_STROKE,
  className,
}: {
  name: IconName;
  /** Rendered box, in pixels. The stroke is compensated to match. */
  size?: number;
  /** Only the window controls pass this. See `CHROME_STROKE`. */
  stroke?: number;
  className?: string;
}) {
  return (
    <svg
      // An inline size as well as the attributes, because the button variants
      // set one through a class and a class would win over the attributes.
      width={size}
      height={size}
      style={{ width: size, height: size }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={(stroke * 24) / size}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      // The glyphs are constants from the brand directory, never anything a
      // person or a file supplied, which is the only case this is safe for.
      dangerouslySetInnerHTML={{ __html: GLYPHS[name] }}
    />
  );
}
