import { useCallback, useEffect, useRef, useState } from 'react';
import { isDesktop } from '../lib/desktop';

/**
 * @typedef {'idle' | 'checking' | 'downloading' | 'ready' | 'error'} UpdateStatus
 */

/**
 * Keeps Cadence up to date without ever interrupting playback.
 *
 * The update is fetched and staged in the background, and then stops. Nothing
 * is installed until the user asks for it, because installing means restarting,
 * and restarting in the middle of a film to apply a version the user never
 * asked about is the single rudest thing a player can do. The staged update
 * costs nothing to sit on: it applies on the next launch either way.
 */
export function useAppUpdates() {
  const [status, setStatus] = useState(/** @type {UpdateStatus} */ ('idle'));
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const staged = useRef(null);

  useEffect(() => {
    if (!isDesktop()) return undefined;

    let cancelled = false;

    (async () => {
      try {
        setStatus('checking');
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();

        if (cancelled) return;
        if (!update) {
          setStatus('idle');
          return;
        }

        setVersion(update.version);
        setStatus('downloading');

        // `contentLength` arrives with the Started event and is absent for
        // servers that do not send one, so the bar is only driven when the
        // total is actually known.
        let downloaded = 0;
        let total = 0;

        await update.download((event) => {
          if (event.event === 'Started') {
            total = event.data.contentLength ?? 0;
          } else if (event.event === 'Progress') {
            downloaded += event.data.chunkLength;
            if (total > 0) setProgress(Math.min(1, downloaded / total));
          }
        });

        if (cancelled) return;
        staged.current = update;
        setStatus('ready');
      } catch (err) {
        /* Reported rather than swallowed.
         *
         * This used to log to a console nobody can open in a shipped build and
         * set a status nothing rendered, which meant an update channel could
         * be dead for months and look identical to one with nothing to
         * deliver. Silence is the one thing it must never do: an application
         * that updates itself is making a promise, and a broken promise that
         * cannot be observed is worse than no promise. */
        console.warn('Update check failed:', err);
        if (!cancelled) {
          setError(String(err?.message ?? err));
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Apply the staged update and restart into it. */
  const installAndRestart = useCallback(async () => {
    if (!staged.current) return;
    try {
      await staged.current.install();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      console.warn('Update install failed:', err);
      setError(String(err?.message ?? err));
      setStatus('error');
    }
  }, []);

  return {
    /** @type {UpdateStatus} */ status,
    version,
    progress,
    error,
    updateReady: status === 'ready',
    installAndRestart,
  };
}
