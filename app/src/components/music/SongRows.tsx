import type * as React from 'react';
import { Icon } from '@/components/ui/icons';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Song } from '@/store/libraryStore';
import { useIsPaused, usePlayerActions } from '@/store/playerStore';
import { Artwork } from './Artwork';
import { TrackMenu } from './TrackMenu';

/**
 * A list of tracks, as a table.
 *
 * A table rather than a stack of labels, because a track list is columnar data
 * and reading it means scanning one column at a time: the numbers to find
 * where you are, the titles to find the song, the times to find the long one.
 * Laid out as rows of free-flowing text the eye has nothing to run down, and
 * the whole middle of a wide window is empty.
 *
 * Two shapes, because the two places this appears know different amounts.
 * Inside a record the sleeve and the artist are the same on every row and
 * already printed above, so what is left is the number and the name. In a flat
 * list of everything there is no context at all, so each row carries its own
 * sleeve and says which record it came from.
 */
export interface SongRowsProps {
  songs: Song[];
  /** Play this track, and queue the rest of the list behind it. */
  onPlay: (index: number) => void;
  /** The path playing now, so the list can say which row it is. */
  playing?: string | null;
  /**
   * `album` for a list that already has a sleeve and an artist above it;
   * `flat` for one that has neither.
   */
  variant?: 'album' | 'flat';
  /** Put this track in a playlist. */
  onAdd?: ((song: Song) => void) | undefined;
  /** Take this row out of the list it is in. Only inside a playlist. */
  onRemove?: ((index: number) => void) | undefined;
  /** Change what the file says it is. */
  onEdit?: ((song: Song) => void) | undefined;
}

/* The two column rulers. Written once and used by the heading and every row,
   so a column cannot be one width in the heading and another in the data. */
const COLUMNS = {
  album: 'grid-cols-[2rem_minmax(0,1fr)_5.5rem]',
  flat: 'grid-cols-[2rem_minmax(0,2fr)_minmax(0,1.3fr)_5.5rem]',
} as const;

export function SongRows({
  songs,
  onPlay,
  playing,
  variant = 'flat',
  onAdd,
  onRemove,
  onEdit,
}: SongRowsProps) {
  const numbered = variant === 'album';
  const paused = useIsPaused();
  const { togglePlay } = usePlayerActions();

  return (
    <div>
      {/* The ruler: one line of small capitals over a hairline, which is all a
          heading has to do here, name the columns and get out of the way. */}
      <div
        className={cn(
          'grid items-center gap-4 border-b border-line px-4 pb-2 text-[11px] font-medium tracking-[0.08em] text-fg-subtle uppercase',
          COLUMNS[variant],
        )}
      >
        <span className="text-center">#</span>
        <span>Title</span>
        {!numbered && <span>Album</span>}
        <span className="flex justify-end pr-1">
          <Icon name="clock" size={13} />
        </span>
      </div>

      <ol className="mt-1 flex flex-col">
        {songs.map((song, index) => {
          const current = playing === song.path;
          return (
            <TrackMenu
              key={`${song.path}-${index}`}
              songs={[song]}
              label={song.title}
              onPlay={() => onPlay(index)}
              onAddToPlaylist={onAdd}
              onRemove={onRemove ? () => onRemove(index) : undefined}
              onEdit={onEdit ? () => onEdit(song) : undefined}
            >
              <li
                onDoubleClick={() => onPlay(index)}
                className={cn(
                  'group relative grid items-center gap-4 rounded-[6px] px-4 py-2 transition-colors',
                  'hover:bg-white/[0.07]',
                  current && 'bg-white/[0.07]',
                  COLUMNS[variant],
                )}
              >
                {/* The number, which becomes the play button under the
                    pointer: one column doing two jobs at two moments, rather
                    than a button that appears and shoves the row along. */}
                <button
                  type="button"
                  /* The row that is playing toggles; every other row starts.
                     A play glyph on a track that is already playing is the
                     list disagreeing with the sound coming out of it. */
                  onClick={() => (current ? togglePlay() : onPlay(index))}
                  aria-label={
                    current ? (paused ? `Play ${song.title}` : `Pause ${song.title}`) : `Play ${song.title}`
                  }
                  className="flex items-center justify-center focus-visible:outline-none"
                >
                  {current ? (
                    <Icon name={paused ? 'play' : 'pause'} size={13} className="text-accent" />
                  ) : (
                    <>
                      <span className="text-[13px] tabular-nums text-fg-subtle group-hover:hidden">
                        {numbered ? (song.track ?? index + 1) : index + 1}
                      </span>
                      <Icon name="play" size={13} className="hidden text-fg group-hover:block" />
                    </>
                  )}
                </button>

                <span className="flex min-w-0 items-center gap-3">
                  {!numbered && (
                    <Artwork path={song.path} width={96} className="size-10 shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'block truncate text-[14px]',
                        current ? 'font-medium text-accent' : 'text-fg',
                      )}
                    >
                      {song.title}
                    </span>
                    {song.artist && (
                      <span className="block truncate text-[12px] text-fg-subtle">
                        {song.artist}
                      </span>
                    )}
                  </span>
                </span>

                {!numbered && (
                  <span className="truncate text-[13px] text-fg-subtle">{song.album ?? ', '}</span>
                )}

                <span className="flex items-center justify-end gap-1">
                  {/* The row's own controls, only under the pointer. A column
                      of icons repeated down eight thousand rows is a texture,
                      not a set of controls. */}
                  <span className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    {onAdd && (
                      <RowButton
                        label={`Add ${song.title} to a playlist`}
                        onClick={() => onAdd(song)}
                      >
                        <Icon name="louder" size={14} />
                      </RowButton>
                    )}
                    {onRemove && (
                      <RowButton
                        label={`Take ${song.title} out of this playlist`}
                        onClick={() => onRemove(index)}
                      >
                        <Icon name="remove" size={14} />
                      </RowButton>
                    )}
                  </span>
                  <span className="text-[13px] tabular-nums text-fg-subtle">
                    {song.duration > 0 ? formatTime(song.duration) : ', '}
                  </span>
                </span>
              </li>
            </TrackMenu>
          );
        })}
      </ol>
    </div>
  );
}

function RowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-[7px] text-fg-subtle hover:bg-white/10 hover:text-fg"
    >
      {children}
    </button>
  );
}
