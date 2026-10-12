/**
 * The keyboard, shown rather than claimed.
 *
 * "Keyboard-first" is the one promise on this page a visitor cannot verify by
 * looking at a screenshot, so the keys are printed instead. Every row here is a
 * real binding from `features/keyboard/useKeyboardShortcuts`, and the table is
 * duplicated rather than imported because that module reaches into the player
 * store, and the landing page has no business pulling the player's state into
 * its bundle to render fifteen labels.
 *
 * Duplicated means checkable, and it had not been checked: this list advertised
 * an A–B loop on A and D, which is not a binding the player has and never was.
 * Anything printed below has to appear in `BINDINGS` with the same key.
 */

/**
 * Marks the gap between two keys as a range rather than a key of its own, so
 * `0 RANGE 9` renders as "0 to 9" instead of three keycaps.
 */
const RANGE = Symbol('range');

type Cap = string | typeof RANGE;
interface Shortcut {
  keys: Cap[];
  label: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['Space'], label: 'Play / pause' },
  { keys: ['←', '→'], label: '10 seconds' },
  { keys: ['J', 'L'], label: '30 seconds' },
  { keys: [',', '.'], label: 'Frame step' },
  { keys: ['⇧', ',', '.'], label: 'Speed' },
  { keys: ['0', RANGE, '9'], label: 'Jump to %' },
  { keys: ['N', 'P'], label: 'Next file' },
  { keys: ['F'], label: 'Fullscreen' },
  { keys: ['C'], label: 'Subtitles' },
  { keys: ['B'], label: 'Bookmark' },
  { keys: ['R'], label: 'Loop file' },
  { keys: ['Z'], label: 'Zoom' },
  { keys: ['S'], label: 'Save frame' },
  { keys: ['G'], label: 'Ambient glow' },
  { keys: ['M'], label: 'Mute' },
  { keys: ['?'], label: 'Everything else' },
];

export default function ShortcutStrip() {
  return (
    <section className="xn-section" id="keyboard">
      <header className="xn-section__head rise">
        <p className="xn-section__eyebrow">Keyboard</p>
        <h2 className="xn-section__title">
          Every control is one key away, and none of them leaves the home row for
          long
        </h2>
      </header>

      <div className="xn-keys rise">
        {SHORTCUTS.map(({ keys, label }) => (
          <div key={label} className="xn-keys__row">
            <span className="xn-keys__caps">
              {keys.map((key, index) =>
                key === RANGE ? (
                  <span key={`${label}-range`} className="xn-keys__range">
                    –
                  </span>
                ) : (
                  <kbd key={`${label}-${key}-${index}`} className="xn-key">
                    {key}
                  </kbd>
                ),
              )}
            </span>
            <span className="xn-keys__label">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
