import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { pickFolder } from '@/lib/desktop';
import { cn } from '@/lib/utils';
import { AlbumGrid, AlbumSheet } from '@/components/music/AlbumGrid';
import { Artwork } from '@/components/music/Artwork';
import { SongRows } from '@/components/music/SongRows';
import { AddToPlaylist, Playlists } from '@/components/music/Playlists';
import { usePlaylistStore } from '@/store/playlistStore';
import { search, useLibraryStore, type Album, type Song } from '@/store/libraryStore';

/**
 * The music on this machine.
 *
 * Deliberately not the same screen as the one for opening a file, and that is
 * the decision the rest of this follows from. A film is a file: you know which
 * one you want, you go and get it, and a player's job is to be out of the way
 * between the double-click and the picture. Music is not — the thing somebody
 * wants is "that record", and finding it means looking at what there is.
 *
 * So this is a library, with the two ways anybody actually looks: by sleeve,
 * because an album is a picture before it is a name, and by typing, because
 * once you know the name the fastest route is to write it down.
 *
 * Nothing here scans on its own. A player that walks the disk uninvited the
 * first time it opens is a player that spends a minute of somebody's machine
 * on a question they did not ask; the folders are chosen, and then it reads
 * them.
 */

type Tab = 'albums' | 'artists' | 'songs' | 'playlists';

const TABS: { id: Tab; label: string; icon: 'album' | 'artist' | 'music' | 'queue' }[] = [
  { id: 'albums', label: 'Albums', icon: 'album' },
  { id: 'artists', label: 'Artists', icon: 'artist' },
  { id: 'songs', label: 'Songs', icon: 'music' },
  { id: 'playlists', label: 'Playlists', icon: 'queue' },
];

export interface MusicProps {
  /** Play a list of tracks starting at one of them, and queue the rest. */
  onPlay: (songs: Song[], index: number, label: string) => void;
  /** The same, in a random order. */
  onShuffle: (songs: Song[], label: string) => void;
  /** What is playing now, so the lists can say which row it is. */
  playing: string | null;
}

export default function Music({ onPlay, onShuffle, playing }: MusicProps) {
  const { songs, folders, loaded, scanning, progress, albums, artists } = useLibraryStore();
  const load = useLibraryStore((s) => s.load);
  const scan = useLibraryStore((s) => s.scan);
  const follow = useLibraryStore((s) => s.follow);
  const addFolder = useLibraryStore((s) => s.addFolder);
  const removeFolder = useLibraryStore((s) => s.removeFolder);

  const [tab, setTab] = React.useState<Tab>('albums');
  const [query, setQuery] = React.useState('');
  const [openAlbum, setOpenAlbum] = React.useState<string | null>(null);
  const [managing, setManaging] = React.useState(false);
  /* The track waiting to be filed. One at a time and one dialog for the whole
     screen: there are as many rows as there is music, and one of these. */
  const [filing, setFiling] = React.useState<Song | null>(null);
  const loadPlaylists = usePlaylistStore((s) => s.load);

  React.useEffect(() => {
    void load();
    void loadPlaylists();
    let stop: (() => void) | null = null;
    let live = true;
    void follow().then((off) => {
      if (live) stop = off;
      else off();
    });
    return () => {
      live = false;
      stop?.();
    };
  }, [load, loadPlaylists, follow]);

  /* Searching narrows the tracks, and the albums and artists are re-derived
     from what is left. Filtering the albums by their own titles instead would
     mean typing a song's name found nothing, which is how most people look for
     the record it is on. */
  const found = React.useMemo(() => search(songs, query), [songs, query]);
  const searching = query.trim().length > 0;

  const visibleAlbums = React.useMemo(() => {
    if (!searching) return albums;
    const keep = new Set(found.map((song) => song.path));
    return albums
      .map((album) => ({ ...album, songs: album.songs.filter((song) => keep.has(song.path)) }))
      .filter((album) => album.songs.length > 0);
  }, [albums, found, searching]);

  const visibleArtists = React.useMemo(() => {
    if (!searching) return artists;
    const keep = new Set(visibleAlbums.map((album) => album.id));
    return artists
      .map((artist) => ({ ...artist, albums: artist.albums.filter((a) => keep.has(a.id)) }))
      .filter((artist) => artist.albums.length > 0);
  }, [artists, visibleAlbums, searching]);

  const album = React.useMemo(
    () => visibleAlbums.find((candidate) => candidate.id === openAlbum) ?? null,
    [visibleAlbums, openAlbum],
  );

  const pick = React.useCallback(async () => {
    const folder = await pickFolder();
    if (folder) await addFolder(folder);
  }, [addFolder]);

  const playAlbum = React.useCallback(
    (chosen: Album, index: number) => onPlay(chosen.songs, index, chosen.title),
    [onPlay],
  );

  return (
    <div className="relative flex h-full flex-col bg-base">
      <header className="flex items-center gap-3 border-b border-line px-6 py-3">
        <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Music</h1>

        <nav className="ml-3 flex gap-1">
          {TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] transition-colors',
                tab === id
                  ? 'bg-surface-2 text-fg'
                  : 'text-fg-subtle hover:bg-surface-1 hover:text-fg-muted',
              )}
            >
              <Icon name={icon} size={14} />
              {label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <label className="relative">
            <Icon
              name="search"
              size={14}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search your music"
              className="w-52 rounded-[var(--radius-control)] border border-line bg-surface-1 py-1.5 pr-3 pl-8 text-[13px] text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none"
            />
          </label>

          <Button
            variant="chrome"
            size="icon"
            onClick={() => setManaging((open) => !open)}
            aria-label="Music folders"
          >
            <Icon name="folder" />
          </Button>
        </div>
      </header>

      {/* One line, and only while it is true. A progress bar that lives on the
          screen permanently at 100% is furniture. */}
      {scanning && (
        <div className="flex items-center gap-3 border-b border-line bg-surface-1 px-6 py-2 text-[12px] text-fg-muted">
          <Icon name="loading" size={13} className="animate-spin" />
          {progress && progress.total > 0
            ? `Reading ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()}`
            : 'Looking through your folders'}
        </div>
      )}

      {managing && (
        <Folders
          folders={folders}
          onAdd={pick}
          onRemove={removeFolder}
          onRescan={() => void scan()}
          scanning={scanning}
          onClose={() => setManaging(false)}
        />
      )}

      <div className="custom-scroll relative flex-1 overflow-y-auto px-6 py-6">
        {!loaded ? null : songs.length === 0 && tab !== 'playlists' ? (
          <Empty hasFolders={folders.length > 0} onPick={pick} onRescan={() => void scan()} />
        ) : searching && found.length === 0 ? (
          <p className="pt-16 text-center text-[14px] text-fg-subtle">
            Nothing here matches “{query.trim()}”.
          </p>
        ) : tab === 'albums' ? (
          <AlbumGrid albums={visibleAlbums} onOpen={(chosen) => setOpenAlbum(chosen.id)} />
        ) : tab === 'artists' ? (
          <div className="flex flex-col gap-9">
            {visibleArtists.map((artist) => (
              <section key={artist.name}>
                <header className="mb-3 flex items-baseline gap-3">
                  <h2 className="text-[15px] font-semibold text-fg">{artist.name}</h2>
                  <span className="text-[12px] text-fg-subtle">
                    {artist.albums.length} {artist.albums.length === 1 ? 'album' : 'albums'} ·{' '}
                    {artist.songs} {artist.songs === 1 ? 'track' : 'tracks'}
                  </span>
                </header>
                <AlbumGrid albums={artist.albums} onOpen={(chosen) => setOpenAlbum(chosen.id)} />
              </section>
            ))}
          </div>
        ) : tab === 'songs' ? (
          <SongRows
            songs={found}
            playing={playing}
            onPlay={(index) => onPlay(found, index, searching ? `“${query.trim()}”` : 'Your music')}
            onAdd={setFiling}
          />
        ) : (
          <Playlists
            songs={songs}
            playing={playing}
            onPlay={onPlay}
            onShuffle={onShuffle}
            onAdd={setFiling}
          />
        )}

        {filing && <AddToPlaylist song={filing} onClose={() => setFiling(null)} />}

        {album && (
          <AlbumSheet
            album={album}
            playing={playing}
            onClose={() => setOpenAlbum(null)}
            onPlay={(index) => playAlbum(album, index)}
            onShuffle={() => onShuffle(album.songs, album.title)}
            onAdd={setFiling}
          />
        )}
      </div>
    </div>
  );
}

/**
 * What the screen says before there is anything on it.
 *
 * Two different nothings, and telling them apart is the entire job here. No
 * folders chosen yet is somebody who has not been asked; folders chosen and no
 * music found is somebody who has been asked and whose answer did not work,
 * and pointing them at the same button again would be no help at all.
 */
function Empty({
  hasFolders,
  onPick,
  onRescan,
}: {
  hasFolders: boolean;
  onPick: () => void;
  onRescan: () => void;
}) {
  return (
    <div className="flex flex-col items-center pt-24 text-center">
      <div className="mb-6 flex size-20 items-center justify-center rounded-[24px] border border-line bg-surface-1">
        <Icon name="music" size={32} className="text-fg-subtle" />
      </div>
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-fg">
        {hasFolders ? 'No music in those folders' : 'Point Cadence at your music'}
      </h2>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-fg-subtle">
        {hasFolders
          ? 'Nothing Cadence can play turned up under the folders it is watching. Add another, or scan again if the files arrived since.'
          : 'Choose the folder your music lives in. Cadence reads the tags once and remembers them, so this happens now rather than every time you open it.'}
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={onPick}>
          <Icon name="folder" size={15} />
          Choose a folder
        </Button>
        {hasFolders && (
          <Button variant="secondary" onClick={onRescan}>
            Scan again
          </Button>
        )}
      </div>
    </div>
  );
}

/** The folders being watched, and the two things you can do to that list. */
function Folders({
  folders,
  onAdd,
  onRemove,
  onRescan,
  scanning,
  onClose,
}: {
  folders: string[];
  onAdd: () => void;
  onRemove: (folder: string) => Promise<void>;
  onRescan: () => void;
  scanning: boolean;
  onClose: () => void;
}) {
  return (
    <div className="border-b border-line bg-surface-1 px-6 py-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-medium text-fg">Folders</h2>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={onAdd}>
            Add a folder
          </Button>
          <Button variant="secondary" size="sm" onClick={onRescan} disabled={scanning}>
            {scanning ? 'Scanning' : 'Scan again'}
          </Button>
          <Button variant="chrome" size="icon" onClick={onClose} aria-label="Close folders">
            <Icon name="close" />
          </Button>
        </div>
      </div>

      {folders.length === 0 ? (
        <p className="mt-3 text-[12px] text-fg-subtle">
          None yet. Cadence looks nowhere until it is told where.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {folders.map((folder) => (
            <li
              key={folder}
              className="flex items-center gap-3 rounded-[10px] px-2 py-1.5 hover:bg-surface-2"
            >
              <Icon name="folder" size={14} className="shrink-0 text-fg-subtle" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-fg-muted">{folder}</span>
              <button
                type="button"
                onClick={() => void onRemove(folder)}
                className="shrink-0 rounded-[6px] p-1 text-fg-subtle hover:bg-surface-3 hover:text-danger"
                aria-label={`Stop watching ${folder}`}
              >
                <Icon name="remove" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Re-exported so the screen and the player agree on what a sleeve looks like. */
export { Artwork };
