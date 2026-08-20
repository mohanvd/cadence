import {
  AlertTriangle,
  Aperture,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Captions,
  Check,
  ChevronRight,
  Copy,
  Disc3,
  Folder,
  Gauge,
  Link2,
  ListMusic,
  Loader2,
  Maximize,
  Minimize,
  Minus,
  Moon,
  Music,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  Square,
  SquarePlay,
  Trash2,
  User,
  Volume1,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react';

/**
 * The application's icon vocabulary, in one place.
 *
 * Two rules, and the second one is arithmetic rather than taste:
 *
 *   • Play is solid. Everything else is outline. Play is the one action a
 *     player exists to offer, and giving it the only filled glyph is how the
 *     eye finds it without a colour or a border doing the work.
 *
 *   • Every outline glyph lands on the same stroke *as drawn on screen*, no
 *     matter what size it is asked for.
 *
 * The second rule is the one that was being broken everywhere. Lucide draws on
 * a 24 unit grid, so a stroke of 2 comes out at 2px in a 24px box and 1.5px in
 * an 18px one. Call sites were picking a size and a stroke independently, and
 * the result was seven different weights between 0.85px and 2px: a title bar
 * lighter than the control row, a drop card heavier than both, and a window
 * that looked assembled out of several other people's applications. Passing a
 * size here rather than sizing the glyph from the outside is what makes that
 * impossible to do again.
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

export const Icons = {
  back: ArrowLeft,
  forwardArrow: ArrowRight,
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
  fullscreen: Maximize,
  exitFullscreen: Minimize,
  music: Music,
  album: Disc3,
  artist: User,
  queue: ListMusic,
  shuffle: Shuffle,
  repeatOne: Repeat1,
  search: Search,
  folder: Folder,
  link: Link2,
  dropTarget: SquarePlay,
  remove: Trash2,
  close: X,
  alert: AlertTriangle,
  loading: Loader2,
  check: Check,
  submenu: ChevronRight,
  louder: Plus,
  minimise: Minus,
  maximise: Square,
  restore: Copy,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof Icons;

/**
 * The transport pair, drawn solid wherever either appears.
 *
 * Pause is on the list because outline is not an option for it: Lucide draws it
 * as two rectangles, and a hollow pause is two empty boxes rather than a
 * symbol. Solid also keeps it the same weight as the play it replaces, so the
 * button does not change colour as the film starts.
 */
const SOLID: ReadonlySet<IconName> = new Set(['play', 'pause']);

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
  const Component = Icons[name];
  const solid = SOLID.has(name);

  return (
    <Component
      // An inline size, because the button variants set one through a class and
      // a class would win over the width and height attributes Lucide writes.
      style={{ width: size, height: size }}
      strokeWidth={solid ? 0 : (stroke * 24) / size}
      {...(solid ? { fill: 'currentColor' } : {})}
      className={className}
      aria-hidden="true"
    />
  );
}
