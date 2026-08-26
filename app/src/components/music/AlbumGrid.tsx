import * as React from 'react';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import type { Album } from '@/store/libraryStore';
import { Artwork } from './Artwork';
import { ListActions } from './ListActions';
import { SongRows } from './SongRows';
import { TrackMenu } from './TrackMenu';

/**
 * Albums as sleeves.
 *
 * A grid rather than a list, and that is the whole argument for this view
 * existing: an album is a picture before it is a name, and a wall of sleeves
 * is something you find a record in by recognising it rather than by reading.
 * The list views are for when you already know what you are looking for.
 */
export interface AlbumGridProps {
  albums: Album[];
  onOpen: (album: Album) => void;
  /** Play the whole record, from the tile, without opening it. */
  onPlay?: ((album: Album) => void) | undefined;
  onShuffle?: ((album: Album) => void) | undefined;
  /** Change what the record's tracks say they are. */
  onEdit?: ((album: Album) => void) | undefined;
}

export function AlbumGrid({ albums, onOpen, onPlay, onShuffle, onEdit }: AlbumGridProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-5 gap-y-7">
      {albums.map((album) => (
        <TrackMenu
          key={album.id}
          songs={album.songs}
          label={`${album.title}, ${album.artist}`}
          onPlay={() => (onPlay ? onPlay(album) : onOpen(album))}
          onShuffle={onShuffle ? () => onShuffle(album) : undefined}
          onEdit={onEdit ? () => onEdit(album) : undefined}
        >
        <button
          type="button"
          onClick={() => onOpen(album)}
          className="group flex flex-col text-left focus-visible:outline-none"
        >
          <Artwork
            path={album.cover}
            width={400}
            className={cn(
              'aspect-square w-full border border-line/60 transition-colors duration-150',
              'group-hover:border-line-strong group-focus-visible:ring-2 group-focus-visible:ring-accent',
            )}
          />
          <span className="mt-2.5 truncate text-[13px] font-medium text-fg">{album.title}</span>
          <span className="truncate text-[12px] text-fg-subtle">{album.artist}</span>
        </button>
        </TrackMenu>
      ))}
    </div>
  );
}

/**
 * One album, opened.
 *
 * A page rather than a list with a caption. What makes it one is the header:
 * the sleeve at a size worth looking at, the title at the size of the thing
 * you came here for, and behind both of them the record's own colour, taken
 * from the sleeve itself, blurred past recognition, so the page belongs to the
 * album instead of every album looking identically black.
 *
 * A panel over the grid rather than a route of its own, because opening a
 * record and closing it again is something people do half a dozen times
 * looking for one track, and each of those should not be somewhere to navigate
 * back from.
 */
export interface AlbumSheetProps {
  album: Album;
  playing: string | null;
  onClose: () => void;
  /** Play the album from a track, queueing the rest behind it. */
  onPlay: (index: number) => void;
  /** Put one of its tracks in a playlist. */
  onAdd?: ((song: import('@/store/libraryStore').Song) => void) | undefined;
  /** Change what the whole record says it is. */
  onEdit?: (() => void) | undefined;
  /** Change what one of its tracks says it is. */
  onEditTrack?: ((song: import('@/store/libraryStore').Song) => void) | undefined;
}

export function AlbumSheet({
  album,
  playing,
  onClose,
  onPlay,
  onAdd,
  onEdit,
  onEditTrack,
}: AlbumSheetProps) {
  /* Escape closes it, which is the key everybody presses at a panel. There is
     no button beside it: the window bar's back arrow does the same thing from
     the same place it does everything else, and a close control in every panel
     is the clutter that argues for. */
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const minutes = Math.round(album.duration / 60);

  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-[var(--bg)]">
      <div className="custom-scroll flex-1 overflow-y-auto">
        <header className="relative">
          {/* The record's colour. The sleeve at thumbnail size, blurred to
              nothing and faded into the page, no palette extraction, no
              second request, and it cannot pick a colour the sleeve does not
              have. */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <Artwork
              path={album.cover}
              width={96}
              rounded={false}
              className="size-full scale-150 opacity-45 blur-[64px] saturate-150"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--bg)]/45 to-[var(--bg)]" />
          </div>

          <div className="relative flex items-end gap-7 px-8 pt-14 pb-8">
            <Artwork
              path={album.cover}
              width={560}
              className="size-56 shrink-0 rounded-[8px] border border-white/10 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.8)]"
            />

            <div className="min-w-0 flex-1 pb-2">
              <p className="text-[11px] font-semibold tracking-[0.1em] text-white/70 uppercase">
                Album
              </p>
              {/* Sized to the window rather than to a number: a title is the
                  thing you came here for, and one that wraps to three lines on
                  a narrow window is worse than one that shrinks. */}
              <h2 className="mt-1 text-balance text-[clamp(1.75rem,4.5vw,3.25rem)] leading-[1.05] font-bold tracking-[-0.03em] text-white">
                {album.title}
              </h2>
              <p className="mt-4 flex flex-wrap items-center gap-x-1.5 text-[13px] text-white/80">
                <span className="font-medium text-white">{album.artist}</span>
                {album.year !== null && <span className="text-white/45">· {album.year}</span>}
                <span className="text-white/45">
                  · {album.songs.length} {album.songs.length === 1 ? 'track' : 'tracks'}
                </span>
                {minutes > 0 && <span className="text-white/45">· {minutes} min</span>}
              </p>
            </div>
          </div>

          {/* The actions, on their own line under the header rather than
              tucked beside the title. Play is the largest thing on the page
              after the sleeve, because it is what the page is for. */}
          <div className="relative">
            <ListActions songs={album.songs} label={album.title} onPlay={onPlay}>
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  aria-label={`Edit ${album.title}`}
                  className="ml-auto flex size-11 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-white/10 hover:text-fg"
                >
                  <Icon name="settings" size={20} />
                </button>
              )}
            </ListActions>
          </div>
        </header>

        <div className="px-5 pt-2 pb-10">
          <SongRows
            songs={album.songs}
            onPlay={onPlay}
            playing={playing}
            variant="album"
            onAdd={onAdd}
            onEdit={onEditTrack}
          />
        </div>
      </div>
    </div>
  );
}
