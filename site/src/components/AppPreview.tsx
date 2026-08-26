import {
  ArrowLeft,
  ArrowRight,
  Link2,
  Minus,
  Music,
  Search,
  Square,
  SquarePlay,
  X,
} from 'lucide-react';

/** The containers the drop card advertises, matching the player's own list. */
const FORMATS = ['MP4', 'MKV', 'MP3', 'FLAC'];

/** The two sections the window's own bar carries, in its order. */
const TABS = [
  { id: 'files', label: 'Files', icon: SquarePlay, active: true },
  { id: 'music', label: 'Music', icon: Music, active: false },
];

/**
 * The application's own window, rebuilt in the page.
 *
 * This was a screenshot, and a screenshot was the wrong medium for it: fixed at
 * one resolution, heavier than the markup it depicts, and quietly out of date
 * the first time the interface changes.
 *
 * The markup here is the player's, class for class, but written out rather than
 * imported. Importing the real component looked tidier and was not: it pulls in
 * the hook that owns the player's file intake, which pulls in the storage layer
 * and the shell bindings behind it, so a marketing page ended up depending on
 * the code that talks to the operating system.
 *
 * What that costs is that the drawing goes stale silently, and it had: this
 * window carried a wordmark and three controls long after the real bar grew
 * history arrows, the two sections and a search field. The bar below is
 * `app/src/components/TitleBar.jsx` as it actually stands, and that file is
 * what this is read against when the two next disagree.
 *
 * `inert` covers the whole thing. It is a picture of an interface, and every
 * control in it would otherwise be focusable, offering to do something none of
 * it can do.
 */
export default function AppPreview() {
  return (
    <div className="ld-stage">
      <div
        className="ld-window"
        role="img"
        aria-label="The Cadence window: a title bar carrying Files and Music, and the area a file is dropped onto."
      >
        <div className="ld-window__inner" inert={true}>
          <div className="ld-window__bar">
            {/* Back and forward, once, for the whole window. Drawn in their
                resting state: nothing has been opened yet, so both are dimmed
                the way the real pair is when there is nowhere to go. */}
            <span className="ld-window__history">
              <span className="ld-window__arrow ld-window__arrow--off">
                <ArrowLeft size={15} strokeWidth={1.7} />
              </span>
              <span className="ld-window__arrow ld-window__arrow--off">
                <ArrowRight size={15} strokeWidth={1.7} />
              </span>
            </span>

            <span className="ld-window__nav">
              {TABS.map(({ id, label, icon: Icon, active }) => (
                <span
                  key={id}
                  className={`ld-window__tab${active ? ' ld-window__tab--on' : ''}`}
                >
                  <Icon size={13} strokeWidth={1.7} />
                  {label}
                </span>
              ))}
            </span>

            {/* Centred in the window rather than pushed against the controls,
                which is where the real one sits and why: the bar's contents are
                different widths on the two sections, and the middle is the one
                position that is the same on both. */}
            <span className="ld-window__search">
              <Search size={14} strokeWidth={1.7} className="ld-window__search-icon" />
              <span className="ld-window__search-text">Search your music</span>
            </span>

            <span className="ld-window__controls">
              <span className="ld-window__btn">
                <Minus size={15} strokeWidth={1.7} />
              </span>
              <span className="ld-window__btn">
                <Square size={12} strokeWidth={1.7} />
              </span>
              <span className="ld-window__btn ld-window__btn--close">
                <X size={15} strokeWidth={1.7} />
              </span>
            </span>
          </div>

          <div className="ld-window__body">
            <h2 className="ld-window__title">Open a file and it plays</h2>
            <p className="ld-window__sub">
              Drop it anywhere on this window, or press the space bar once it is open.
            </p>

            <div className="xn-drop">
              <span className="xn-drop__target">
                <span className="xn-drop__icon">
                  <SquarePlay size={34} strokeWidth={1.25} />
                </span>
                <span className="xn-drop__title">Drop something to play</span>
                <span className="xn-drop__hint">
                  or <span className="xn-drop__hint-link">browse your files</span>
                </span>
                <span className="xn-drop__formats">
                  {FORMATS.map((format) => (
                    <span key={format} className="xn-chip">
                      {format}
                    </span>
                  ))}
                </span>
              </span>

              <div className="xn-drop__divider">
                <span>or paste a link</span>
              </div>

              <div className="xn-url">
                <Link2 size={15} className="xn-url__icon" aria-hidden />
                <span className="xn-url__input">https://example.com/track.mp3</span>
                <span className="xn-url__go">
                  <ArrowRight size={15} />
                </span>
              </div>
            </div>

            <p className="ld-window__version">Cadence {__APP_VERSION__}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
