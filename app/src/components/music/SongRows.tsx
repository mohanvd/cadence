import { Icon } from '@/components/ui/icons';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Song } from '@/store/libraryStore';
import { Artwork } from './Artwork';

/**
 * A list of tracks, in the order they are meant to be played.
 *
 * Used in two places that want slightly different things from it. Inside an
 * album the tracks are numbered and the sleeve is already on screen, so
 * repeating it eighteen times would be eighteen copies of one picture. In a
 * flat list of everything there are no track numbers worth showing — the
 * fourth track of one album above the fourth track of another is a column of
 * fours — and the sleeve is the only thing that says which record a row came
 * from.
 *
 * Rows are buttons rather than divs with click handlers, which is what makes
 * the list reachable by keyboard without anything else being written for it.
 */
export interface SongRowsProps {
  songs: Song[];
  /** Play this track, and queue the rest of the list behind it. */
  onPlay: (index: number) => void;
  /** The path playing now, so the list can say which row it is. */
  playing?: string | null;
  /** Numbered rows and no sleeves: an album already shows its own. */
  numbered?: boolean;
  /** Shown under the title. Off inside an album, where it is the same name
      on every row. */
  showArtist?: boolean;
}

export function SongRows({
  songs,
  onPlay,
  playing,
  numbered = false,
  showArtist = true,
}: SongRowsProps) {
  return (
    <ol className="flex flex-col">
      {songs.map((song, index) => {
        const current = playing === song.path;
        return (
          <li key={song.path}>
            <button
              type="button"
              onClick={() => onPlay(index)}
              className={cn(
                'group flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors',
                'hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none',
                current && 'bg-surface-2',
              )}
            >
              {numbered ? (
                <span className="w-7 shrink-0 text-right text-[13px] tabular-nums text-fg-subtle">
                  {/* The playing row trades its number for a glyph. A number
                      and a state marker in the same column would be two things
                      competing for one place; the number is the one you stop
                      needing the moment the track starts. */}
                  {current ? (
                    <Icon name="play" size={13} className="ml-auto text-accent" />
                  ) : (
                    (song.track ?? index + 1)
                  )}
                </span>
              ) : (
                <Artwork path={song.path} width={96} className="size-10 shrink-0" />
              )}

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block truncate text-[14px] text-fg',
                    current && 'font-medium text-accent',
                  )}
                >
                  {song.title}
                </span>
                {showArtist && (
                  <span className="block truncate text-[12px] text-fg-subtle">
                    {[song.artist, song.album].filter(Boolean).join(' · ') || song.file}
                  </span>
                )}
              </span>

              <span className="shrink-0 text-[12px] tabular-nums text-fg-subtle">
                {song.duration > 0 ? formatTime(song.duration) : '—'}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
