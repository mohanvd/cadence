import {
  AudioLines,
  Camera,
  Contrast,
  Frame,
  Gauge,
  Images,
  Lightbulb,
  MonitorDown,
  MousePointerClick,
  Palette,
  Radio,
  Repeat,
  Timer,
  Bookmark,
  WifiOff,
  ZoomIn,
} from 'lucide-react';

/**
 * The long tail, as an index rather than as more cards.
 *
 * Everything here is real and none of it needs a paragraph. Given a card each
 * they would out-shout the five things above that actually distinguish the
 * player; given a dense three-column list they read the way a spec sheet reads,
 * which is what a visitor scanning for one particular feature actually wants.
 */
const CAPABILITIES = [
  { icon: Gauge, label: 'Speed from 0.25× to 4×', note: 'remembered per file' },
  { icon: Frame, label: 'Frame-accurate stepping' },
  { icon: Repeat, label: 'A–B loop over any range' },
  { icon: Bookmark, label: 'Timestamp bookmarks', note: 'with notes' },
  { icon: Images, label: 'Frame previews while scrubbing' },
  { icon: AudioLines, label: 'Five-band equaliser', note: 'seven presets' },
  { icon: Contrast, label: 'Brightness, contrast, saturation', note: 'nine presets' },
  { icon: Lightbulb, label: 'Ambient glow sampled from the frame' },
  { icon: ZoomIn, label: 'Zoom and pan into the picture' },
  { icon: Timer, label: 'Sleep timer', note: '15 to 90 minutes' },
  { icon: Camera, label: 'Save the current frame as a PNG' },
  { icon: MousePointerClick, label: 'Touch gestures', note: 'tap, swipe, double-tap' },
  { icon: Radio, label: 'Media keys and the OS now-playing panel' },
  { icon: Palette, label: 'Six accents, three themes, three densities' },
  { icon: MonitorDown, label: 'Opens videos straight from the desktop' },
  { icon: WifiOff, label: 'Never needs a connection' },
];

export default function CapabilityList() {
  return (
    <section className="xn-section">
      <header className="xn-section__head">
        <h2 className="xn-section__title">Also included</h2>
        <span className="xn-section__meta">{CAPABILITIES.length} more</span>
      </header>

      <ul className="xn-caps">
        {CAPABILITIES.map(({ icon: Icon, label, note }) => (
          <li key={label} className="xn-caps__item">
            <Icon size={14} strokeWidth={1.6} className="xn-caps__icon" aria-hidden />
            <span className="xn-caps__text">
              {label}
              {note && <span className="xn-caps__note">, {note}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
