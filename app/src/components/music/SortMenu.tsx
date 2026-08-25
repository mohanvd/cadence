import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import {
  MenuItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useExclusiveMenu,
} from '@/components/ui/popover';
import type { Album, Song } from '@/store/libraryStore';

/**
 * How a list is ordered, and the control that changes it.
 *
 * The default is the one the shell already produces: by album, then by disc
 * and track within it, which is the order a record is meant to be heard in and
 * the right answer for a library browsed by album. It is the wrong answer for
 * a flat list of eight thousand tracks, where nobody is looking for the fourth
 * song of something — they are looking down the titles, or for the thing they
 * added last week.
 *
 * The orders below are the ones people actually ask for. There is no "reverse"
 * toggle: half of these already read newest-first because that is the only
 * direction anybody wants them in, and a separate switch for it is a second
 * control to explain.
 */

export type SongOrder = 'natural' | 'title' | 'artist' | 'album' | 'added' | 'longest';
export type AlbumOrder = 'artist' | 'title' | 'year' | 'added';

const SONG_LABELS: Record<SongOrder, string> = {
  natural: 'Album order',
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  added: 'Recently added',
  longest: 'Longest first',
};

const ALBUM_LABELS: Record<AlbumOrder, string> = {
  artist: 'Artist',
  title: 'Title',
  year: 'Year',
  added: 'Recently added',
};

/** Compare two possibly-absent strings, putting the absent ones last. */
function byText(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/**
 * Sort tracks. Never in place: the array belongs to the store, and sorting it
 * there would reorder every other view that is reading the same one.
 */
export function sortSongs(songs: Song[], order: SongOrder): Song[] {
  if (order === 'natural') return songs;
  const out = [...songs];
  switch (order) {
    case 'title':
      out.sort((a, b) => byText(a.title, b.title));
      break;
    case 'artist':
      out.sort((a, b) => byText(a.artist, b.artist) || byText(a.title, b.title));
      break;
    case 'album':
      out.sort(
        (a, b) =>
          byText(a.album, b.album) ||
          (a.disc ?? 1) - (b.disc ?? 1) ||
          (a.track ?? 0) - (b.track ?? 0),
      );
      break;
    case 'added':
      // Newest first, which is the only direction anybody means by this.
      out.sort((a, b) => b.modified - a.modified);
      break;
    case 'longest':
      out.sort((a, b) => b.duration - a.duration);
      break;
  }
  return out;
}

export function sortAlbums(albums: Album[], order: AlbumOrder): Album[] {
  const out = [...albums];
  switch (order) {
    case 'artist':
      out.sort((a, b) => byText(a.artist, b.artist) || byText(a.title, b.title));
      break;
    case 'title':
      out.sort((a, b) => byText(a.title, b.title));
      break;
    case 'year':
      // Undated records sort last rather than to year zero.
      out.sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity) || byText(a.title, b.title));
      break;
    case 'added':
      out.sort(
        (a, b) =>
          Math.max(...b.songs.map((song) => song.modified)) -
          Math.max(...a.songs.map((song) => song.modified)),
      );
      break;
  }
  return out;
}

export interface SortMenuProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly T[];
  labels: Record<T, string>;
}

export function SortMenu<T extends string>({
  value,
  onChange,
  options,
  labels,
}: SortMenuProps<T>) {
  const { open, onOpenChange } = useExclusiveMenu('sort');

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-fg-muted">
          {labels[value]}
          <Icon name="submenu" size={13} className="rotate-90" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52">
        {options.map((option) => (
          <MenuItem
            key={option}
            active={option === value}
            onSelect={() => {
              onChange(option);
              onOpenChange(false);
            }}
          >
            {labels[option]}
          </MenuItem>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export const SONG_ORDERS = ['natural', 'title', 'artist', 'album', 'added', 'longest'] as const;
export const ALBUM_ORDERS = ['artist', 'title', 'year', 'added'] as const;
export { SONG_LABELS, ALBUM_LABELS };
