import { Minus, Square, X, Link2, SquarePlay, ArrowRight } from 'lucide-react';

/** The containers the drop card advertises, matching the player's own list. */
const FORMATS = ['MP4', 'WEBM', 'MKV', 'MOV'];

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
 * the code that talks to the operating system. What actually keeps this honest
 * is the stylesheet, which *is* shared: change how the drop card looks and this
 * changes with it.
 *
 * `inert` covers the whole thing. It is a picture of an interface, and every
 * control in it would otherwise be focusable, offering to do something none of
 * it can do.
 */
export default function AppPreview() {
  return (
    <div
      className="ld-window"
      role="img"
      aria-label="The Cadence window, showing the area a video is dropped onto."
    >
      <div className="ld-window__inner" inert={true}>
        <div className="ld-window__bar">
          <span className="ld-window__brand">Cadence</span>
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
              <span className="xn-drop__title">Drop a video here</span>
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
              <span className="xn-url__input">https://example.com/video.mp4</span>
              <span className="xn-url__go">
                <ArrowRight size={15} />
              </span>
            </div>
          </div>

          <p className="ld-window__version">Cadence {__APP_VERSION__}</p>
        </div>
      </div>
    </div>
  );
}
