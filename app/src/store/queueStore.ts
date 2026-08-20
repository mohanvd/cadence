import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

/**
 * What is playing after this, and in what order.
 *
 * Cadence has always had a queue and never had one you could see: the folder a
 * file was opened from *is* the queue, in the order the names read. That is
 * exactly right for a season of television, where somebody has already done
 * the arranging and the arrangement is the folder. It is not enough for music,
 * where the thing you want to play is "this album", "everything by them", or
 * "all of it, shuffled" — none of which is a folder.
 *
 * So there are two queues, and which one is in use is decided by how playback
 * started. Open a file and the folder answers, as it always did, with nothing
 * to set up and nothing to remember. Play something from the library and this
 * answers instead, with a list somebody chose.
 *
 * The list is held as paths rather than as records. A queue outlives a rescan,
 * and a rescan replaces every record in the library with a new one; a queue of
 * records would be a queue of stale copies within a second of the disk
 * changing. A path is the thing that stays true.
 */

export type Repeat = 'off' | 'all' | 'one';

interface QueueState {
  /** The queue in the order it is shown. Empty means the folder is in charge. */
  items: string[];
  /**
   * The order it is played in, as positions into `items`.
   *
   * Kept apart from the list itself so that shuffling does not scramble what
   * is on screen. A shuffled queue that also reorders its own display is one
   * you cannot read: the track after the one playing is somewhere else in the
   * list, and finding it means looking through the whole thing.
   */
  order: number[];
  /** Where in `order` the current track is. -1 when nothing is playing. */
  cursor: number;
  shuffle: boolean;
  repeat: Repeat;
  /** What the queue was built from, for the header above it. */
  label: string;

  /** Start a queue, playing the track at `startAt` in the given order. */
  start: (items: string[], startAt: number, label: string) => string | null;
  /** The next path, and move to it. Null when the queue is finished. */
  advance: () => string | null;
  /** The previous path, and move to it. Null at the beginning. */
  retreat: () => string | null;
  /** Jump to a track already in the queue, by its position in `items`. */
  jump: (index: number) => string | null;
  /** Put a track next, without disturbing what follows it. */
  playNext: (path: string) => void;
  /** Put tracks at the end. */
  append: (paths: string[]) => void;
  /** Take a track out. */
  remove: (index: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  clear: () => void;
}

/** The path currently pointed at, or null. */
function currentOf(state: Pick<QueueState, 'items' | 'order' | 'cursor'>): string | null {
  const position = state.order[state.cursor];
  return position === undefined ? null : (state.items[position] ?? null);
}

/**
 * A shuffled order with `first` at the front.
 *
 * Fisher–Yates, and then the chosen track swapped into position zero rather
 * than the shuffle being run until it happens to land there. Shuffling from
 * the middle of an album should start with the track you clicked and go
 * somewhere unpredictable next, not restart the album somewhere else.
 */
function shuffled(count: number, first: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const at = order.indexOf(first);
  if (at > 0) [order[0], order[at]] = [order[at]!, order[0]!];
  return order;
}

const sequential = (count: number): number[] =>
  Array.from({ length: count }, (_, index) => index);

export const useQueueStore = create<QueueState>((set, get) => ({
  items: [],
  order: [],
  cursor: -1,
  shuffle: false,
  repeat: 'off',
  label: '',

  start: (items, startAt, label) => {
    if (items.length === 0) return null;
    const from = Math.min(Math.max(startAt, 0), items.length - 1);
    const order = get().shuffle ? shuffled(items.length, from) : sequential(items.length);
    const cursor = order.indexOf(from);
    set({ items, order, cursor, label });
    return items[from] ?? null;
  },

  advance: () => {
    const { order, cursor, repeat, items } = get();
    if (order.length === 0) return null;
    /* Repeat-one does not move. The caller plays the same file again, which
       for a queue means the next track is this one and the one after it is
       still this one — that is what the setting says. */
    if (repeat === 'one') return currentOf(get());

    const next = cursor + 1;
    if (next < order.length) {
      set({ cursor: next });
      return items[order[next]!] ?? null;
    }
    if (repeat === 'all') {
      /* Reshuffled at the wrap rather than replayed in the same random order,
         which would be a fixed order that merely looks random the first time
         through. */
      const reordered = get().shuffle ? shuffled(items.length, order[0]!) : order;
      set({ order: reordered, cursor: 0 });
      return items[reordered[0]!] ?? null;
    }
    return null;
  },

  retreat: () => {
    const { order, cursor, items, repeat } = get();
    if (order.length === 0) return null;
    if (cursor > 0) {
      set({ cursor: cursor - 1 });
      return items[order[cursor - 1]!] ?? null;
    }
    if (repeat === 'all') {
      const last = order.length - 1;
      set({ cursor: last });
      return items[order[last]!] ?? null;
    }
    return null;
  },

  jump: (index) => {
    const { items, order } = get();
    if (index < 0 || index >= items.length) return null;
    const cursor = order.indexOf(index);
    if (cursor === -1) return null;
    set({ cursor });
    return items[index] ?? null;
  },

  playNext: (path) => {
    const { items, order, cursor } = get();
    if (items.length === 0) return;
    const at = (order[cursor] ?? -1) + 1;
    const next = [...items.slice(0, at), path, ...items.slice(at)];
    /* Every position at or after the insertion has moved along by one, and the
       order is positions. Rebuilding it from the list instead would lose the
       shuffle. */
    const shifted = order.map((position) => (position >= at ? position + 1 : position));
    set({ items: next, order: [...shifted.slice(0, cursor + 1), at, ...shifted.slice(cursor + 1)] });
  },

  append: (paths) => {
    const { items, order } = get();
    const at = items.length;
    set({
      items: [...items, ...paths],
      order: [...order, ...paths.map((_, index) => at + index)],
    });
  },

  remove: (index) => {
    const { items, order, cursor } = get();
    if (index < 0 || index >= items.length) return;
    // Whatever is playing stays playing; taking it out of the queue only means
    // it will not come round again.
    const playing = order[cursor];
    const next = items.filter((_, at) => at !== index);
    const reordered = order
      .filter((position) => position !== index)
      .map((position) => (position > index ? position - 1 : position));
    const moved = playing === undefined || playing === index
      ? Math.min(cursor, reordered.length - 1)
      : reordered.indexOf(playing > index ? playing - 1 : playing);
    set({ items: next, order: reordered, cursor: moved });
  },

  toggleShuffle: () => {
    const { shuffle, items, order, cursor } = get();
    const playing = order[cursor];
    if (items.length === 0) {
      set({ shuffle: !shuffle });
      return;
    }
    if (shuffle) {
      // Back to the written order, standing on the same track.
      set({
        shuffle: false,
        order: sequential(items.length),
        cursor: playing ?? 0,
      });
      return;
    }
    const reordered = shuffled(items.length, playing ?? 0);
    set({ shuffle: true, order: reordered, cursor: 0 });
  },

  cycleRepeat: () =>
    set(({ repeat }) => ({
      repeat: repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off',
    })),

  clear: () => set({ items: [], order: [], cursor: -1, label: '' }),
}));

/** What the transport needs to know, without subscribing to the whole queue. */
export const useQueueControls = () =>
  useQueueStore(
    useShallow((s) => ({
      shuffle: s.shuffle,
      repeat: s.repeat,
      toggleShuffle: s.toggleShuffle,
      cycleRepeat: s.cycleRepeat,
      active: s.items.length > 0,
    })),
  );

/** The path playing now, according to the queue. */
export const useQueueCurrent = (): string | null =>
  useQueueStore((s) => currentOf(s));
