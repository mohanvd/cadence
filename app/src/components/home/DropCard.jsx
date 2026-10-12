import { Icon } from '../ui/icons';
import { Mark } from '../ui/mark';
import { HEADLINE_TYPES } from '../../hooks/useVideoIntake';

/* Four, not the fifteen Cadence actually opens. The row is there to say "your
   files, yes" at a glance, and a glance does not read fifteen chips. */
const FORMATS = HEADLINE_TYPES;

/**
 * The one thing this page asks the visitor to do.
 *
 * The picker area is a button and the URL field sits outside it. Nesting an
 * input inside a clickable region would make the field impossible to focus by
 * click without swallowing the event.
 */
export default function DropCard({
  active,
  error,
  urlInput,
  onUrlChange,
  onUrlSubmit,
  onOpenPicker,
}) {
  return (
    <div className={`xn-drop${active ? ' xn-drop--active' : ''}`}>
      <button type="button" className="xn-drop__target" onClick={onOpenPicker}>
        {/* The mark rather than a generic play icon: this card is the front
            door, and the one place on the screen the brand is the subject. */}
        <span className="xn-drop__icon">
          <Mark size={44} cut="full" />
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
      </button>

      <div className="xn-drop__divider">
        <span>or paste a link</span>
      </div>

      <form
        className="xn-url"
        onSubmit={(e) => {
          e.preventDefault();
          onUrlSubmit();
        }}
      >
        <Icon name="link" size={15} className="xn-url__icon" />
        <input
          type="url"
          value={urlInput}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://example.com/track.mp3"
          className="xn-url__input"
          aria-label="Direct link to a file"
        />
        <button
          type="submit"
          className="xn-url__go"
          disabled={!urlInput.trim()}
          aria-label="Play this URL"
        >
          <Icon name="forwardArrow" size={16} />
        </button>
      </form>

      {error && (
        <p className="xn-drop__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
