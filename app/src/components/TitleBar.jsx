import { useCallback, useEffect, useState } from 'react';
import { CHROME_STROKE, Icon } from './ui/icons';
import { isDesktop } from '../lib/desktop';

/**
 * The window's own title bar, drawn by the application.
 *
 * The shell runs undecorated, so everything a title bar does has to be done
 * here: dragging the window, the three controls, and reporting which state the
 * maximise button is in. The reason to take that on is that the alternative is
 * a grey system strip sitting above a dark application, announcing that the two
 * were made by different people.
 *
 * Rendered above the player, not behind it. Someone watching a film in a window
 * still has to be able to close it, and a control that disappears under the
 * video is worse than one that costs 38px. Fullscreen is the exception and
 * needs no code: the player fullscreens its own element, so this sits outside
 * the fullscreened subtree and the compositor drops it.
 */
export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop()) return undefined;
    let unlisten = () => {};
    let cancelled = false;

    (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      setMaximized(await win.isMaximized());
      // Double-clicking the bar and dragging to the top edge both maximise
      // without going through the button, so the icon has to follow the window
      // rather than the click.
      const stop = await win.onResized(async () => {
        setMaximized(await win.isMaximized());
      });
      if (cancelled) stop();
      else unlisten = stop;
    })();

    return () => {
      cancelled = true;
      unlisten();
    };
  }, []);

  const command = useCallback(async (name) => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (name === 'minimize') await win.minimize();
    if (name === 'toggle') await win.toggleMaximize();
    if (name === 'close') await win.close();
  }, []);

  if (!isDesktop()) return null;

  return (
    <header className="titlebar" data-tauri-drag-region>
      {/* The attribute has to be on every child that should also drag, because
          a click landing on a label is still a click on the label. */}
      <span className="titlebar__brand" data-tauri-drag-region>
        Cadence
      </span>

      <div className="titlebar__controls">
        <button
          type="button"
          className="titlebar__btn"
          onClick={() => command('minimize')}
          aria-label="Minimise"
        >
          <Icon name="minimise" size={15} stroke={CHROME_STROKE} />
        </button>
        <button
          type="button"
          className="titlebar__btn"
          onClick={() => command('toggle')}
          aria-label={maximized ? 'Restore' : 'Maximise'}
        >
          <Icon name={maximized ? 'restore' : 'maximise'} size={12} stroke={CHROME_STROKE} />
        </button>
        <button
          type="button"
          className="titlebar__btn titlebar__btn--close"
          onClick={() => command('close')}
          aria-label="Close"
        >
          <Icon name="close" size={15} stroke={CHROME_STROKE} />
        </button>
      </div>
    </header>
  );
}
