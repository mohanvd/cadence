import { GLYPHS, GLYPH_VIEW_BOX, type GlyphName } from './glyphs';

/**
 * The application's icon vocabulary, in one place.
 *
 * The glyphs are Google's Material Symbols, in the Rounded style, chosen and
 * named in `brand/icons/glyphs.mjs` and copied in as `./glyphs.ts` by
 * `npm run brand`. They replaced a set drawn in-house, which was in one hand
 * and was also nobody's idea of what a settings gear or a queue looks like: a
 * symbol people have met in a thousand other places needs no learning.
 *
 * Two rules:
 *
 *   • Transport is solid. Play, pause and the skips are the filled cut;
 *     everything else is outline. Solid is how the eye finds the thing to
 *     press over a moving picture, without a colour or a border doing the
 *     work. The set decides which is which, not the call site.
 *
 *   • A call site passes a size and nothing else. The box asked for is the box
 *     drawn, with Material's own padding inside it, so two icons at one size
 *     line up without either being nudged.
 */

export type IconName = GlyphName;

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  /** Rendered box, in pixels. */
  size?: number;
  className?: string;
}) {
  return (
    <svg
      // An inline size as well as the attributes, because the button variants
      // set one through a class and a class would win over the attributes.
      width={size}
      height={size}
      style={{ width: size, height: size }}
      viewBox={GLYPH_VIEW_BOX}
      fill="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
      // The glyphs are constants from the brand directory, never anything a
      // person or a file supplied, which is the only case this is safe for.
      dangerouslySetInnerHTML={{ __html: GLYPHS[name] }}
    />
  );
}
