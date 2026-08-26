import { useCallback, useEffect, useState } from 'react';
import { CHROME_STROKE, Icon } from './ui/icons';
import { isDesktop } from '../lib/desktop';
import { useHistory } from '../store/viewStore';

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
export default function TitleBar({ screen, onScreen, search }) {
  const [maximized, setMaximized] = useState(false);
  const history = useHistory();

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
      {/* Back and forward, once, for the whole window.
          
          The alternative was a back button on every panel that can be opened,
          which is several affordances doing one job, each in a slightly
          different place and each stealing a corner of the thing it sits on.
          These two are always in the same spot and cost nothing anywhere
          else. */}
      {/* The drag attribute has to be on every child that should also drag,
          because a click landing on a child is still a click on it. */}
      {onScreen && (
        <div className="titlebar__history" data-tauri-drag-region>
          <button
            type="button"
            className="titlebar__arrow"
            onClick={history.back}
            disabled={!history.canBack}
            aria-label="Back"
          >
            <Icon name="back" size={15} stroke={CHROME_STROKE} />
          </button>
          <button
            type="button"
            className="titlebar__arrow"
            onClick={history.forward}
            disabled={!history.canForward}
            aria-label="Forward"
          >
            <Icon name="forwardArrow" size={15} stroke={CHROME_STROKE} />
          </button>
        </div>
      )}

      {/* The application's only navigation, and it lives here because here is
          the one strip that is on screen in every state the window has,
          including while something is playing, which is exactly when somebody
          wants to go back to the library and pick the next record without
          stopping the one they are listening to. */}
      {onScreen && (
        <nav className="titlebar__nav" data-tauri-drag-region>
          {[
            { id: 'home', label: 'Files', icon: 'dropTarget' },
            { id: 'music', label: 'Music', icon: 'music' },
          ].map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className="titlebar__tab"
              data-active={screen === id ? '' : undefined}
              onClick={() => onScreen(id)}
            >
              <Icon name={icon} size={13} stroke={CHROME_STROKE} />
              {label}
            </button>
          ))}
        </nav>
      )}

      {/* The search field lives up here rather than in a second strip below,
          because a second strip below is what made this window look like a web
          page in a frame: a title bar, and then another bar under it doing the
          same job. One bar carries the window, the sections and the search. */}
      {search && <div className="titlebar__search">{search}</div>}

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
