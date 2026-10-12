import {
  AudioLines,
  Camera,
  Contrast,
  Frame,
  Gauge,
  Images,
  Keyboard,
  Lightbulb,
  ListVideo,
  MonitorDown,
  MousePointerClick,
  Palette,
  Radio,
  Repeat,
  Settings,
  Timer,
  Bookmark,
  WifiOff,
  ZoomIn,
} from './icons';

/**
 * The long tail, as an index rather than as more cards.
 *
 * Everything here is real and none of it needs a paragraph. Given a card each
 * they would out-shout the five things above that actually distinguish the
 * player; given a dense three-column list they read the way a spec sheet reads,
 * which is what a visitor scanning for one particular feature actually wants.
 *
 * Every count below is a number in the player, not a round figure that sounded
 * about right. `EQ_PRESETS`, `FILTER_PRESETS`, `ACCENTS`, `THEMES`, `DENSITIES`
 * and the sleep timer's own options are where they come from, and are what to
 * read these against when one of them changes.
 */
const CAPABILITIES = [
  { icon: Gauge, label: 'Speed from 0.25× to 4×', note: 'remembered per file' },
  { icon: Frame, label: 'Frame-accurate stepping' },
  { icon: Repeat, label: 'Loop a file, shuffle a queue' },
  { icon: Bookmark, label: 'Timestamp bookmarks', note: 'with notes' },
  { icon: Images, label: 'Frame previews while scrubbing' },
  { icon: ListVideo, label: 'Plays the rest of the folder', note: 'a season, or an album' },
  { icon: AudioLines, label: 'Five-band equaliser', note: 'seven presets' },
  { icon: Contrast, label: 'Brightness, contrast, saturation', note: 'nine presets' },
  { icon: Lightbulb, label: 'Ambient glow sampled from the frame' },
  { icon: ZoomIn, label: 'Zoom and pan into the picture' },
  { icon: Timer, label: 'Sleep timer', note: '15 to 90 minutes' },
  { icon: Camera, label: 'Save the current frame as a PNG' },
  { icon: MousePointerClick, label: 'Wheel for volume, trackpad swipe to scrub' },
  { icon: Radio, label: 'Media keys and the OS now-playing panel' },
  { icon: Palette, label: 'Seven accents, three themes, three densities' },
  { icon: Keyboard, label: 'Every shortcut can be changed', note: 'to any key' },
  { icon: Settings, label: 'Settings for all of it', note: 'and a search to find one' },
  { icon: MonitorDown, label: 'Opens files straight from the desktop' },
  { icon: WifiOff, label: 'Never needs a connection' },
];

export default function CapabilityList() {
  return (
    <section className="xn-section">
      <header className="xn-section__head rise">
        <p className="xn-section__eyebrow">And the rest</p>
        <h2 className="xn-section__title">
          Also included: {CAPABILITIES.length} more, none of which needed a
          paragraph
        </h2>
      </header>

      <ul className="xn-caps rise">
        {CAPABILITIES.map(({ icon: Icon, label, note }) => (
          <li key={label} className="xn-caps__item">
            <Icon size={14} className="xn-caps__icon" aria-hidden />
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
