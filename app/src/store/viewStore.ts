import * as React from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

/**
 * Where you are, and the one step above it.
 *
 * Back means *up*, not *before*. That is the whole design of this file, and it
 * is a deliberate departure from what a browser does.
 *
 * A browser's back button walks a list of everything you looked at, which
 * works there because a browser has one place to be, a page, and every move
 * is the same kind of move. This window has two places to be, chosen by two
 * tabs sitting side by side, and inside one of them a stack of things that
 * open on top of each other: a record, a playlist, the player. Walking a flat
 * list across all of that produces the thing that made this worth rewriting,
 * put a record on, glance at the file screen, come back to the library, press
 * back, and land on the file screen. Nothing about that is what "back" meant
 * to the person pressing it. They were in the player and wanted to be in the
 * library.
 *
 * So back closes what is open, in the order it was opened over: the player
 * first, then the record or playlist under it. It never crosses between the
 * two tabs, because those are peers and picking one is not a step you take
 * *into* anything, it is the same move as picking the other, and undoing it
 * is what the other tab is for.
 *
 * Forward undoes the last back and nothing else. It is not a second history;
 * it is the way out of a mistaken press, which is the only thing anybody ever
 * uses forward for.
 */

export type Screen = 'home' | 'music';
export type MusicTab = 'albums' | 'artists' | 'songs' | 'playlists';

export interface View {
  screen: Screen;
  /** Which section of the library. Meaningless on the file screen, and kept
      anyway, so that leaving and coming back lands where you left. */
  tab: MusicTab;
  /** The album whose page is open, by id. */
  album: string | null;
  /**
   * The playlist that is open.
   *
   * Either a made playlist's id, or a folder's path with the `folder:` prefix
   * the library uses for the lists it derives from the disk. One field for
   * both because they open the same page and back closes them the same way.
   */
  playlist: string | null;
  /**
   * Whether the player is filling the window.
   *
   * The topmost thing that can be open, so the first thing back closes.
   */
  player: boolean;
}

const START: View = {
  screen: 'home',
  tab: 'albums',
  album: null,
  playlist: null,
  player: false,
};

/**
 * What closing the topmost open thing looks like, or null at the top level.
 *
 * The order is the order things stack: the player sits over a record, a record
 * sits over the library. Nothing here ever changes `screen`.
 */
function upFrom(view: View): Partial<View> | null {
  if (view.player) return { player: false };
  if (view.album !== null) return { album: null };
  if (view.playlist !== null) return { playlist: null };
  return null;
}

interface ViewState {
  view: View;
  /** What the last back closed, so forward can put it back. */
  undone: View | null;
  /** Move somewhere, described by what changed about where you are. */
  go: (patch: Partial<View>) => void;
  back: () => void;
  forward: () => void;
}

export const useViewStore = create<ViewState>((set, get) => ({
  view: START,
  undone: null,

  go: (patch) => {
    const { view } = get();
    const next: View = { ...view, ...patch };
    /* A move that changes nothing is not a move. Without this, clicking the
       tab you are already on would count as navigation and clear the forward
       arrow for no reason. */
    if (
      next.screen === view.screen &&
      next.tab === view.tab &&
      next.album === view.album &&
      next.playlist === view.playlist &&
      next.player === view.player
    ) {
      return;
    }
    // Going somewhere new makes the thing forward would have restored
    // unreachable, which is what every forward button in the world does.
    set({ view: next, undone: null });
  },

  back: () => {
    const { view } = get();
    const up = upFrom(view);
    if (!up) return;
    set({ view: { ...view, ...up }, undone: view });
  },

  forward: () => {
    const { undone } = get();
    if (!undone) return;
    set({ view: undone, undone: null });
  },
}));

/** Where you are now. */
export const useView = (): View => useViewStore((s) => s.view);

/** What the two arrows need: whether they do anything, and what they do. */
export const useHistory = () =>
  useViewStore(
    useShallow((s) => ({
      canBack: upFrom(s.view) !== null,
      canForward: s.undone !== null,
      back: s.back,
      forward: s.forward,
    })),
  );

/**
 * The two extra buttons on a mouse.
 *
 * Every mouse with more than three buttons has had these two doing back and
 * forward for twenty years, and the hand reaches for them without asking the
 * eye first, which is exactly why an application that ignores them feels
 * broken rather than merely plain. WebView2 does not act on them by itself,
 * because nothing here is a page it could navigate.
 *
 * `mouseup` rather than `mousedown`: pressing and dragging away is how anybody
 * takes back a press, and a navigation that has already happened by then
 * cannot be taken back. `mousedown` is cancelled all the same, because leaving
 * it alone lets the button start a text selection or an autoscroll.
 */
export function useMouseNavigation(): void {
  const back = useViewStore((s) => s.back);
  const forward = useViewStore((s) => s.forward);

  React.useEffect(() => {
    const swallow = (event: MouseEvent) => {
      if (event.button === 3 || event.button === 4) event.preventDefault();
    };
    const act = (event: MouseEvent) => {
      if (event.button === 3) {
        event.preventDefault();
        back();
      } else if (event.button === 4) {
        event.preventDefault();
        forward();
      }
    };
    window.addEventListener('mousedown', swallow);
    window.addEventListener('mouseup', act);
    // Chromium also raises this for the extra buttons, and a page that only
    // listens for one of the three can be beaten to it by the other two.
    window.addEventListener('auxclick', swallow);
    return () => {
      window.removeEventListener('mousedown', swallow);
      window.removeEventListener('mouseup', act);
      window.removeEventListener('auxclick', swallow);
    };
  }, [back, forward]);
}
