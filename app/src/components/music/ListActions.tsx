import * as React from 'react';
import { Icon } from '@/components/ui/icons';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Song } from '@/store/libraryStore';
import { useIsPaused, usePlayerActions, usePlayerStore } from '@/store/playerStore';
import { useQueueStore } from '@/store/queueStore';

/**
 * The play and shuffle controls at the head of a record or a playlist.
 *
 * Two buttons that were doing the wrong jobs. Shuffle was an action, press it
 * and the list plays shuffled once, which meant the setting it was really
 * changing was invisible, and the transport's own shuffle button said
 * something different from the one you had just pressed. It is a toggle now,
 * showing the same state the transport shows, because there is only one
 * shuffle in the application and two controls for it should not disagree.
 *
 * And play was frozen. It said "play" over a list that was already playing,
 * which is the page disagreeing with the sound coming out of it. It follows
 * the transport now: pause while this list is playing, play while it is not.
 *
 * What "this list is playing" means is the simplest thing that is true: the
 * track playing right now is one of these. Comparing whole queues would say no
 * the moment somebody put one other song next, which is not what anybody
 * looking at the page would say.
 */
export interface ListActionsProps {
  songs: Song[];
  /** Named in the labels, so a screen reader hears which list. */
  label: string;
  /** Start the list at a track. Called with a random one when shuffling. */
  onPlay: (index: number) => void;
  /** Anything else that belongs on this row, pushed to the far end. */
  children?: React.ReactNode;
}

export function ListActions({ songs, label, onPlay, children }: ListActionsProps) {
  const paused = useIsPaused();
  const { togglePlay } = usePlayerActions();
  const shuffle = useQueueStore((s) => s.shuffle);
  const toggleShuffle = useQueueStore((s) => s.toggleShuffle);

  const playingPath = usePlayerStore((s) => s.source?.kind === 'path' ? s.source.path : null);

  const mine = React.useMemo(
    () => playingPath !== null && songs.some((song) => song.path === playingPath),
    [songs, playingPath],
  );
  const sounding = mine && !paused;

  const start = React.useCallback(() => {
    if (mine) {
      togglePlay();
      return;
    }
    /* Shuffled means starting somewhere unpredictable. Starting at track one
       and shuffling what follows would open every shuffled record with the
       same song, which is the one thing shuffle is supposed to prevent. */
    onPlay(shuffle && songs.length > 1 ? Math.floor(Math.random() * songs.length) : 0);
  }, [mine, togglePlay, onPlay, shuffle, songs.length]);

  const empty = songs.length === 0;

  return (
    <div className="flex items-center gap-5 px-8 pb-7">
      <Tooltip label={sounding ? 'Pause' : 'Play'}>
        <button
          type="button"
          onClick={start}
          disabled={empty}
          aria-label={sounding ? `Pause ${label}` : `Play ${label}`}
          className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-[0_8px_24px_-6px_rgba(0,0,0,0.7)] transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-40"
        >
          <Icon
            key={sounding ? 'pause' : 'play'}
            name={sounding ? 'pause' : 'play'}
            size={22}
            className="animate-in fade-in-0 zoom-in-75 duration-150"
          />
        </button>
      </Tooltip>

      <Tooltip label={shuffle ? 'Shuffle is on' : 'Shuffle is off'}>
        <button
          type="button"
          onClick={toggleShuffle}
          aria-label="Shuffle"
          aria-pressed={shuffle}
          className={cn(
            'flex size-11 items-center justify-center rounded-full transition-colors',
            shuffle ? 'text-accent' : 'text-fg-muted hover:bg-white/10 hover:text-fg',
          )}
        >
          <Icon name="shuffle" size={22} />
        </button>
      </Tooltip>

      {children}
    </div>
  );
}
