import type { ComponentType } from 'react';
import { GLYPHS, type GlyphName } from './glyphs';

/**
 * Cadence's own icons, under the names the page already used.
 *
 * The glyphs are the player's, drawn in `brand/icons/glyphs.mjs` and copied in
 * as `./glyphs.ts` by `npm run brand`. The page used to draw with Lucide, and
 * its picture of the player was the one place the player's real icons and
 * somebody else's sat side by side. Keeping Lucide's names means each section
 * changed one import line and nothing else.
 *
 * `strokeWidth` is in grid units, as Lucide's is, because that is what every
 * call site already passes. The page is drawn once at build time and ships no
 * script, so these are plain SVG in the HTML.
 */

interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
  /** Accepted for Lucide's sake and ignored: a glyph says which parts are solid. */
  fill?: string;
}

function glyph(name: GlyphName): ComponentType<IconProps> {
  function Glyph({ size = 24, strokeWidth = 2, className, 'aria-hidden': hidden = true }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden={hidden}
        focusable="false"
        // Constants from the brand directory, never anything a visitor supplied.
        dangerouslySetInnerHTML={{ __html: GLYPHS[name] }}
      />
    );
  }
  Glyph.displayName = `Glyph(${name})`;
  return Glyph;
}

export const ArrowLeft = glyph('back');
export const ArrowRight = glyph('forwardArrow');
export const AudioLines = glyph('audioLines');
export const BadgeCheck = glyph('badgeCheck');
export const Bookmark = glyph('bookmark');
export const Boxes = glyph('boxes');
export const Camera = glyph('camera');
export const Captions = glyph('captions');
export const Contrast = glyph('contrast');
export const Cpu = glyph('cpu');
export const Disc3 = glyph('album');
export const Download = glyph('download');
export const FolderInput = glyph('folderInput');
export const Frame = glyph('frame');
export const Gauge = glyph('speed');
export const Images = glyph('images');
export const Keyboard = glyph('keyboard');
export const KeyRound = glyph('keyRound');
export const Lightbulb = glyph('lightbulb');
export const ListMusic = glyph('queue');
export const ListVideo = glyph('listVideo');
export const Maximize = glyph('fullscreen');
export const Minus = glyph('minimise');
export const MonitorDown = glyph('monitorDown');
export const MousePointerClick = glyph('mousePointerClick');
export const Music = glyph('music');
export const Palette = glyph('palette');
export const Pause = glyph('pause');
export const Radio = glyph('radio');
export const RefreshCw = glyph('refresh');
export const Repeat = glyph('repeat');
export const RotateCcw = glyph('rewind');
export const RotateCw = glyph('forward');
export const Search = glyph('search');
export const Settings = glyph('settings');
export const SkipBack = glyph('previous');
export const SkipForward = glyph('next');
export const Square = glyph('maximise');
export const SquarePlay = glyph('dropTarget');
export const Tags = glyph('tags');
export const Timer = glyph('timer');
export const User = glyph('artist');
export const Volume2 = glyph('volumeHigh');
export const Waves = glyph('waves');
export const WifiOff = glyph('wifiOff');
export const X = glyph('close');
export const ZoomIn = glyph('zoom');
