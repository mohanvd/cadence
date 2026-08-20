import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import type { Album } from '@/store/libraryStore';
import { Artwork } from './Artwork';
import { SongRows } from './SongRows';

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
}

export function AlbumGrid({ albums, onOpen }: AlbumGridProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-5 gap-y-7">
      {albums.map((album) => (
        <button
          key={album.id}
          type="button"
          onClick={() => onOpen(album)}
          className="group flex flex-col text-left focus-visible:outline-none"
        >
          <Artwork
            path={album.cover}
            width={400}
            className={cn(
              'aspect-square w-full border border-line/60 transition-transform duration-200',
              'group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-accent',
            )}
          />
          <span className="mt-2.5 truncate text-[13px] font-medium text-fg">{album.title}</span>
          <span className="truncate text-[12px] text-fg-subtle">{album.artist}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * One album, opened.
 *
 * A panel over the grid rather than a page of its own. Opening a record and
 * closing it again is something people do half a dozen times looking for one
 * track, and each of those should not be a place they have to navigate back
 * from.
 */
export interface AlbumSheetProps {
  album: Album;
  playing: string | null;
  onClose: () => void;
  /** Play the album from a track, queueing the rest behind it. */
  onPlay: (index: number) => void;
  onShuffle: () => void;
  /** Put one of its tracks in a playlist. */
  onAdd?: ((song: import('@/store/libraryStore').Song) => void) | undefined;
}

export function AlbumSheet({
  album,
  playing,
  onClose,
  onPlay,
  onShuffle,
  onAdd,
}: AlbumSheetProps) {
  // Escape closes it, which is the key everybody presses at a panel.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const minutes = Math.round(album.duration / 60);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-base/95 backdrop-blur-xl">
      <div className="flex items-start gap-6 border-b border-line px-8 pt-7 pb-6">
        <Artwork
          path={album.cover}
          width={480}
          className="size-40 shrink-0 border border-line/60"
        />

        <div className="min-w-0 flex-1 pt-1">
          <h2 className="truncate text-2xl font-semibold tracking-[-0.02em] text-fg">
            {album.title}
          </h2>
          <p className="mt-1 truncate text-[14px] text-fg-muted">{album.artist}</p>
          <p className="mt-1 text-[12px] text-fg-subtle">
            {[
              album.year !== null ? String(album.year) : null,
              `${album.songs.length} ${album.songs.length === 1 ? 'track' : 'tracks'}`,
              minutes > 0 ? `${minutes} min` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>

          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => onPlay(0)}>
              <Icon name="play" size={15} />
              Play
            </Button>
            <Button variant="secondary" size="sm" onClick={onShuffle}>
              <Icon name="shuffle" size={15} />
              Shuffle
            </Button>
          </div>
        </div>

        <Button variant="chrome" size="icon" onClick={onClose} aria-label="Close album">
          <Icon name="close" />
        </Button>
      </div>

      <div className="custom-scroll flex-1 overflow-y-auto px-5 py-4">
        <SongRows
          songs={album.songs}
          onPlay={onPlay}
          playing={playing}
          numbered
          showArtist={false}
          onAdd={onAdd}
        />
      </div>
    </div>
  );
}
