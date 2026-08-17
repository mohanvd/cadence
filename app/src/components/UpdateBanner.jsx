import { useState } from 'react';

/**
 * Offers an update that has already been downloaded and is waiting to apply.
 *
 * Deliberately an offer and not a countdown: the update is staged on disk and
 * costs nothing to postpone, so nothing here should pull attention away from
 * what is on screen. Dismissing it lets the update land on the next launch,
 * which is the outcome most people want anyway.
 */
export default function UpdateBanner({ version, onInstall }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="update-banner" role="status">
      <span className="update-banner__text">
        Cadence {version} is ready
      </span>
      <button type="button" className="update-banner__action" onClick={onInstall}>
        Restart now
      </button>
      <button
        type="button"
        className="update-banner__dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
