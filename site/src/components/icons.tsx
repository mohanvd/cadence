import type { ComponentType } from 'react';
import { GLYPHS, GLYPH_VIEW_BOX, type GlyphName } from './glyphs';

/**
 * The player's icons, under the names the page already used.
 *
 * The glyphs are Google's Material Symbols, in the Rounded style, chosen and
 * named in `brand/icons/glyphs.mjs` and copied in as `./glyphs.ts` by
 * `npm run brand`. They are the same ones the player draws, so the page's
 * picture of the player is a picture of the player. The exports keep the names
 * the sections imported when the page drew with Lucide, which is why they do
 * not match the glyphs' own.
 *
 * The page is drawn once at build time and ships no script, so these are plain
 * SVG in the HTML.
 */

interface IconProps {
  size?: number;
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}

function glyph(name: GlyphName): ComponentType<IconProps> {
  function Glyph({ size = 24, className, 'aria-hidden': hidden = true }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={GLYPH_VIEW_BOX}
        fill="currentColor"
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
