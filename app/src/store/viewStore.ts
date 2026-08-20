import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

/**
 * Where you are, and where you have been.
 *
 * The alternative was a back button on every panel that can be opened — one on
 * the album sheet, one on the playlist, one wherever the next thing lands —
 * and that is four affordances doing one job, each of them in a slightly
 * different place, each of them stealing a corner of the thing it sits on.
 * Two arrows in the window bar do all of it and cost nothing anywhere else.
 *
 * A view is a whole position rather than a step, so going back is restoring
 * one rather than undoing the last thing that happened. That matters for the
 * case people actually hit: open an album, open another, change to Artists,
 * press back twice and land exactly where you were, with the right album open
 * on the right tab.
 *
 * Deliberately not the browser's history. This is a window, not a page, and
 * `popstate` would also answer to a mouse's fourth button pressed over a
 * webview that has its own idea of what Back means.
 */

export type Screen = 'home' | 'music';
export type MusicTab = 'albums' | 'artists' | 'songs' | 'playlists';

export interface View {
  screen: Screen;
  /** Which section of the library. Meaningless on the file screen, and kept
      anyway, so that leaving and coming back lands where you left. */
  tab: MusicTab;
  /** The album whose sheet is open, by id. */
  album: string | null;
  /** The playlist that is open, by id. */
  playlist: string | null;
  /**
   * Whether the player is filling the window.
   *
   * A position rather than a flag on the side, so that the back arrow in the
   * window bar closes it — which is what stops the player needing a back arrow
   * of its own, sitting a few pixels from the one that already exists.
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

/** How many positions back you can go. Beyond this nobody is retracing. */
const DEPTH = 50;

interface ViewState {
  history: View[];
  at: number;
  /** Move to a new position, described by what changed about this one. */
  go: (patch: Partial<View>) => void;
  back: () => void;
  forward: () => void;
}

function same(a: View, b: View): boolean {
  return (
    a.screen === b.screen &&
    a.tab === b.tab &&
    a.album === b.album &&
    a.playlist === b.playlist &&
    a.player === b.player
  );
}

export const useViewStore = create<ViewState>((set, get) => ({
  history: [START],
  at: 0,

  go: (patch) => {
    const { history, at } = get();
    const next: View = { ...history[at]!, ...patch };
    if (same(next, history[at]!)) return;

    /* Anything ahead is discarded, which is what every back button in the
       world does: going somewhere new from the middle of a history makes the
       part you had gone back from unreachable, and pretending otherwise would
       leave a forward arrow that goes somewhere you never chose. */
    const kept = [...history.slice(0, at + 1), next].slice(-DEPTH);
    set({ history: kept, at: kept.length - 1 });
  },

  back: () => set(({ at }) => ({ at: Math.max(0, at - 1) })),
  forward: () => set(({ history, at }) => ({ at: Math.min(history.length - 1, at + 1) })),
}));

/** Where you are now. */
export const useView = (): View => useViewStore((s) => s.history[s.at]!);

/** What the two arrows need: whether they do anything, and what they do. */
export const useHistory = () =>
  useViewStore(
    useShallow((s) => ({
      canBack: s.at > 0,
      canForward: s.at < s.history.length - 1,
      back: s.back,
      forward: s.forward,
    })),
  );
