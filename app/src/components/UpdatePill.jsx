import { Icon } from './ui/icons';

/**
 * The update, told in two quiet states.
 *
 * A download can take a while on a slow line, and the version before this one
 * said nothing at all until it had finished: from the outside that is
 * indistinguishable from an update channel that is broken. So the download is
 * shown, and shown truthfully, with the real fraction rather than a spinner
 * that turns at the same speed whatever is happening.
 *
 * There is no dismiss. The staged update costs nothing to postpone and applies
 * on the next launch either way, so the pill is not asking for a decision, and
 * a control to close something that was never demanding anything is one more
 * thing on screen than the situation deserves.
 */
export default function UpdatePill({ status, version, progress, onInstall }) {
  if (status === 'downloading') {
    return (
      <div className="update-pill update-pill--working" role="status">
        <Ring value={progress} />
        <span className="update-pill__label">Downloading update…</span>
      </div>
    );
  }

  if (status !== 'ready') return null;

  return (
    <button type="button" className="update-pill" onClick={onInstall}>
      <span className="update-pill__stack">
        <span className="update-pill__title">Relaunch to update</span>
        <span className="update-pill__version">v{version}</span>
      </span>
      <Icon name="forwardArrow" size={16} className="update-pill__go" />
    </button>
  );
}

const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The download, as a ring.
 *
 * `contentLength` is absent from some servers, and a bar that cannot know how
 * full it is has no honest position to sit at. When the total is unknown the
 * ring gives up on precision and simply turns, which at least says the right
 * thing: something is happening, and nobody knows how much longer.
 */
function Ring({ value }) {
  const known = typeof value === 'number' && value > 0;

  return (
    <svg
      className={`update-ring${known ? '' : ' update-ring--unknown'}`}
      viewBox="0 0 18 18"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <circle className="update-ring__track" cx="9" cy="9" r={RADIUS} />
      <circle
        className="update-ring__fill"
        cx="9"
        cy="9"
        r={RADIUS}
        strokeDasharray={known ? CIRCUMFERENCE : CIRCUMFERENCE * 0.25}
        strokeDashoffset={known ? CIRCUMFERENCE * (1 - Math.min(1, value)) : 0}
      />
    </svg>
  );
}
