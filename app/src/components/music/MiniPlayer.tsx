import * as React from 'react';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/format';
import type { Song } from '@/store/libraryStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useIsPaused, usePlayerActions, usePlayerStore } from '@/store/playerStore';
import { useQueueControls } from '@/store/queueStore';
import { Artwork } from './Artwork';

/**
 * The bar along the bottom while something plays and you are looking at
 * something else.
 *
 * This is the thing that makes a music player a music player rather than a
 * video player that tolerates sound. A film takes the whole screen because
 * watching it is the activity; music plays *while* you do something else, and
 * the something else here is looking for the next record. Without this, going
 * back to the library would mean either stopping the track or losing every way
 * to reach it.
 *
 * Nothing is torn down to get here. The player is still mounted with the same
 * element and the same decoder — it is only hidden — so expanding it again is
 * a style change rather than a reload, and the audio never stops for a
 * moment.
 */
export interface MiniPlayerProps {
  /** The file playing, for the sleeve and for finding its tags. */
  path: string | null;
  /** The file's name, for when there are no tags to do better. */
  title: string;
  onExpand: () => void;
  onNext?: (() => void) | undefined;
  onPrevious?: (() => void) | undefined;
}

export function MiniPlayer({ path, title, onExpand, onNext, onPrevious }: MiniPlayerProps) {
  const paused = useIsPaused();
  const { togglePlay } = usePlayerActions();
  const { shuffle, repeat, toggleShuffle, cycleRepeat } = useQueueControls();

  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);

  const songs = useLibraryStore((s) => s.songs);
  const song: Song | null = React.useMemo(
    () => (path ? (songs.find((candidate) => candidate.path === path) ?? null) : null),
    [songs, path],
  );

  const heading = song?.title ?? title.replace(/\.[^.]+$/, '');
  const byline = [song?.artist, song?.album].filter(Boolean).join(' · ');
  const progress = duration > 0 && Number.isFinite(duration) ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mini-player">
      {/* The playhead, as a hairline along the very top edge. Not a scrubber:
          a two-pixel target is not something anybody can hit on purpose, and
          the full one is a click away. This says how far in, which is the part
          you want at a glance. */}
      <div className="mini-player__progress" style={{ width: `${progress}%` }} />

      <button
        type="button"
        onClick={onExpand}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] p-1.5 text-left hover:bg-surface-2 focus-visible:outline-none"
        aria-label="Open the player"
      >
        <Artwork path={path} width={96} className="size-11 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-fg">{heading}</span>
          {byline && <span className="block truncate text-[12px] text-fg-subtle">{byline}</span>}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        <MiniButton
          label={shuffle ? 'Shuffle on' : 'Shuffle'}
          icon="shuffle"
          onClick={toggleShuffle}
          active={shuffle}
        />
        <MiniButton
          label="Previous"
          icon="previous"
          onClick={onPrevious}
          disabled={!onPrevious}
        />
        <button
          type="button"
          onClick={togglePlay}
          aria-label={paused ? 'Play' : 'Pause'}
          className="mx-1 flex size-9 items-center justify-center rounded-full bg-fg text-[color:var(--color-base)] transition-transform hover:scale-105"
        >
          <Icon name={paused ? 'play' : 'pause'} size={16} />
        </button>
        <MiniButton label="Next" icon="next" onClick={onNext} disabled={!onNext} />
        <MiniButton
          label={repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat this track'}
          icon={repeat === 'one' ? 'repeatOne' : 'repeat'}
          onClick={cycleRepeat}
          active={repeat !== 'off'}
        />

        <span className="ml-3 w-24 shrink-0 text-right text-[12px] tabular-nums text-fg-subtle">
          {formatTime(currentTime)}
          {duration > 0 && Number.isFinite(duration) ? ` / ${formatTime(duration)}` : ''}
        </span>
      </div>
    </div>
  );
}

function MiniButton({
  label,
  icon,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  icon: 'shuffle' | 'previous' | 'next' | 'repeat' | 'repeatOne';
  onClick?: (() => void) | undefined;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex size-8 items-center justify-center rounded-[8px] text-fg-muted transition-colors',
        'hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-30',
        active && 'text-accent',
      )}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
