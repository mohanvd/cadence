import {
  Aperture,
  ArrowLeft,
  Bookmark,
  Captions,
  Gauge,
  Maximize,
  Minimize,
  Moon,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Settings,
  SkipBack,
  SkipForward,
  Sliders,
  Volume1,
  Volume2,
  VolumeX,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react';

/**
 * The player's icon vocabulary, in one place.
 *
 * The rule that keeps the control bar looking like one system rather than a
 * pile of imports:
 *
 *   • every icon is outline, at the same stroke width and optical size;
 *   • exactly one icon is filled, play/pause, the single primary action.
 *
 * Mixing filled and outline glyphs at different sizes inside one row is what
 * makes a toolbar read as assembled from different sources, so any new icon
 * must join this list rather than being imported ad hoc at a call site.
 */

/** Stroke weight shared by every outline glyph. */
export const ICON_STROKE = 2;

export const Icons = {
  back: ArrowLeft,
  play: Play,
  pause: Pause,
  previous: SkipBack,
  next: SkipForward,
  rewind: RotateCcw,
  forward: RotateCw,
  volumeHigh: Volume2,
  volumeLow: Volume1,
  volumeOff: VolumeX,
  captions: Captions,
  bookmark: Bookmark,
  speed: Gauge,
  settings: Settings,
  filters: Sliders,
  equalizer: Sliders,
  zoom: ZoomIn,
  repeat: Repeat,
  screenshot: Aperture,
  sleep: Moon,
  pip: PictureInPicture2,
  fullscreen: Maximize,
  exitFullscreen: Minimize,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof Icons;

/**
 * Render an icon from the vocabulary with the shared stroke weight.
 *
 * `filled` is deliberately opt-in and used only for play/pause.
 */
export function Icon({
  name,
  className,
  filled = false,
}: {
  name: IconName;
  className?: string;
  filled?: boolean;
}) {
  const Component = Icons[name];
  return (
    <Component
      strokeWidth={ICON_STROKE}
      className={className}
      {...(filled ? { fill: 'currentColor' } : {})}
    />
  );
}
