import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { pickFolder } from '@/lib/desktop';
import { cn } from '@/lib/utils';
import { AlbumGrid, AlbumSheet } from '@/components/music/AlbumGrid';
import { Artwork } from '@/components/music/Artwork';
import { SongRows } from '@/components/music/SongRows';
import { AddToPlaylist, Playlists } from '@/components/music/Playlists';
import { EditDetails } from '@/components/music/EditDetails';
import { Popover, PopoverContent, PopoverTrigger, MenuItem } from '@/components/ui/popover';
import {
  ALBUM_LABELS,
  ALBUM_ORDERS,
  SONG_LABELS,
  SONG_ORDERS,
  SortMenu,
  sortAlbums,
  sortSongs,
  type AlbumOrder,
  type SongOrder,
} from '@/components/music/SortMenu';
import { usePlaylistStore } from '@/store/playlistStore';
import { search, useLibraryStore, type Album, type Song } from '@/store/libraryStore';
import { useView, useViewStore, type MusicTab } from '@/store/viewStore';

/**
 * The music on this machine.
 *
 * Deliberately not the same screen as the one for opening a file, and that is
 * the decision the rest of this follows from. A film is a file: you know which
 * one you want, you go and get it, and a player's job is to be out of the way
 * between the double-click and the picture. Music is not, the thing somebody
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

const TABS: { id: MusicTab; label: string; icon: 'album' | 'artist' | 'music' | 'queue' }[] = [
  { id: 'albums', label: 'Albums', icon: 'album' },
  { id: 'artists', label: 'Artists', icon: 'artist' },
  { id: 'songs', label: 'Songs', icon: 'music' },
  { id: 'playlists', label: 'Playlists', icon: 'queue' },
];

export interface MusicProps {
  /** What was typed in the window's search field. */
  query: string;
  /** Play a list of tracks starting at one of them, and queue the rest. */
  onPlay: (songs: Song[], index: number, label: string) => void;
  /** The same, in a random order. */
  onShuffle: (songs: Song[], label: string) => void;
  /** What is playing now, so the lists can say which row it is. */
  playing: string | null;
}

export default function Music({ query, onPlay, onShuffle, playing }: MusicProps) {
  const { songs, folders, loaded, scanning, progress, albums, artists } = useLibraryStore();
  const load = useLibraryStore((s) => s.load);
  const scan = useLibraryStore((s) => s.scan);
  const follow = useLibraryStore((s) => s.follow);
  const addFolder = useLibraryStore((s) => s.addFolder);
  const removeFolder = useLibraryStore((s) => s.removeFolder);

  /* Which section, and what is open in it, are positions in the window's
     history rather than state of this screen, that is what lets the two
     arrows in the window bar undo them. */
  const view = useView();
  const go = useViewStore((s) => s.go);
  const tab = view.tab;
  const openAlbum = view.album;
  const setTab = React.useCallback(
    (next: MusicTab) => go({ tab: next, album: null, playlist: null }),
    [go],
  );
  const setOpenAlbum = React.useCallback((id: string | null) => go({ album: id }), [go]);
  const [managing, setManaging] = React.useState(false);
  /* Set by the Create menu and cleared by the playlists view once it has put
     its own dialog on screen. A message rather than shared state: the menu
     knows what was asked for and the view knows how to ask for a name. */
  const [making, setMaking] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  /* One order per kind of list, remembered while the window is open. Two
     rather than one because "recently added" means the same thing in both and
     "album order" means nothing in a grid of albums. */
  const [songOrder, setSongOrder] = React.useState<SongOrder>('natural');
  const [albumOrder, setAlbumOrder] = React.useState<AlbumOrder>('artist');
  /* The track waiting to be filed. One at a time and one dialog for the whole
     screen: there are as many rows as there is music, and one of these. */
  const [filing, setFiling] = React.useState<Song | null>(null);
  /* What is being changed on disk, if anything. One at a time, and the scope
     decides which fields the dialog offers. */
  const [editing, setEditing] = React.useState<{ songs: Song[]; scope: 'track' | 'album' } | null>(
    null,
  );
  const loadPlaylists = usePlaylistStore((s) => s.load);
  const importFile = usePlaylistStore((s) => s.importFile);

  /* What the last import or export did, shown once and dismissed. Held here
     rather than in the store because it is a thing that happened on screen,
     not a thing the library knows. */
  const [said, setSaid] = React.useState<string | null>(null);

  const importPlaylist = React.useCallback(async () => {
    try {
      const answer = await importFile();
      if (answer) {
        setSaid(answer);
        go({ tab: 'playlists', album: null, playlist: null });
      }
    } catch (err) {
      setSaid(String(err));
    }
  }, [importFile, go]);

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
  const matched = React.useMemo(() => search(songs, query), [songs, query]);
  const found = React.useMemo(() => sortSongs(matched, songOrder), [matched, songOrder]);
  const searching = query.trim().length > 0;

  const orderedAlbums = React.useMemo(() => sortAlbums(albums, albumOrder), [albums, albumOrder]);

  const visibleAlbums = React.useMemo(() => {
    if (!searching) return orderedAlbums;
    const keep = new Set(matched.map((song) => song.path));
    return orderedAlbums
      .map((album) => ({ ...album, songs: album.songs.filter((song) => keep.has(song.path)) }))
      .filter((album) => album.songs.length > 0);
  }, [orderedAlbums, matched, searching]);

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

  /** Whether something has been opened over the library. */
  const opened = album !== null || (tab === 'playlists' && view.playlist !== null);

  const pick = React.useCallback(async () => {
    const folder = await pickFolder();
    if (folder) await addFolder(folder);
  }, [addFolder]);

  const playAlbum = React.useCallback(
    (chosen: Album, index: number) => onPlay(chosen.songs, index, chosen.title),
    [onPlay],
  );

  return (
    <div className="relative flex h-full flex-col bg-[var(--bg)]">
      {/* One line, and only while it is true. A progress bar that lives on the
          screen permanently at 100% is furniture. */}
      {scanning && (
        <div className="mx-6 mt-4 flex items-center gap-3 rounded-[10px] bg-surface-1 px-4 py-2 text-[12px] text-fg-muted">
          <Icon name="loading" size={13} className="animate-spin" />
          {progress && progress.total > 0
            ? `Reading ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()}`
            : 'Looking through your folders'}
        </div>
      )}

      {/* Gone while a record or a playlist is open.
          
          A page you have opened is the whole screen: the sections you were
          browsing a moment ago are not where you are any more, and leaving
          them stranded over an album's own colour is a strip of the previous
          screen sitting on top of this one. The back arrow in the window bar
          is how you get out, which is the same way you get out of everywhere
          else. */}
      {!opened && (
      <div className="flex items-center gap-2 px-6 pt-5">
        {/* The sections, as pills in the content rather than in a bar of their
            own. A second full-width strip under the title bar is what made
            this window look like two applications stacked. */}
        <nav className="flex gap-1">
          {TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] transition-colors',
                tab === id
                  ? 'bg-fg text-[color:var(--color-base)]'
                  : 'bg-surface-1 text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <Icon name={icon} size={14} />
              {label}
            </button>
          ))}
        </nav>

        {/* Only where there is an order to change. Artists are alphabetical
            and playlists are in the order somebody put them in; offering to
            sort either is offering to undo the point of it. */}
        {(tab === 'albums' || tab === 'songs') && (
          <div className="ml-auto">
            {tab === 'albums' ? (
              <SortMenu
                value={albumOrder}
                onChange={setAlbumOrder}
                options={ALBUM_ORDERS}
                labels={ALBUM_LABELS}
              />
            ) : (
              <SortMenu
                value={songOrder}
                onChange={setSongOrder}
                options={SONG_ORDERS}
                labels={SONG_LABELS}
              />
            )}
          </div>
        )}

        <div className={tab === 'albums' || tab === 'songs' ? '' : 'ml-auto'}>
          {/* Controlled, so choosing something closes it. An uncontrolled
              popover stays open behind whatever the choice opened, which
              leaves two menus on screen and one of them stale. */}
          <Popover open={creating} onOpenChange={setCreating}>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="sm">
                <Icon name="louder" size={15} />
                Create
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <MenuItem
                onSelect={() => {
                  setCreating(false);
                  setTab('playlists');
                  setMaking(true);
                }}
              >
                Playlist
                <span className="block text-[11px] text-fg-subtle">
                  A name and an order you choose
                </span>
              </MenuItem>
              <MenuItem
                onSelect={() => {
                  setCreating(false);
                  void importPlaylist();
                }}
              >
                Import a playlist
                <span className="block text-[11px] text-fg-subtle">
                  From an .m3u made anywhere else
                </span>
              </MenuItem>
              <MenuItem
                onSelect={() => {
                  setCreating(false);
                  void pick();
                }}
              >
                Watched folder
                <span className="block text-[11px] text-fg-subtle">
                  Somewhere Cadence reads music from
                </span>
              </MenuItem>
              <MenuItem
                onSelect={() => {
                  setCreating(false);
                  setManaging(true);
                }}
              >
                Manage folders
                <span className="block text-[11px] text-fg-subtle">
                  {folders.length} being watched
                </span>
              </MenuItem>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      )}

      {/* One line, gone when it is read. An import is a thing that happened,
          not a state the screen is in. */}
      {said && (
        <button
          type="button"
          onClick={() => setSaid(null)}
          className="mx-6 mt-4 flex items-center gap-3 rounded-[10px] border border-line bg-surface-1 px-4 py-2.5 text-left text-[12px] text-fg-muted transition-colors hover:bg-surface-2"
        >
          <Icon name="check" size={14} className="shrink-0 text-success" />
          <span className="min-w-0 flex-1">{said}</span>
          <Icon name="close" size={13} className="shrink-0 text-fg-subtle" />
        </button>
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

      <div
        className={cn(
          'custom-scroll relative flex-1 overflow-y-auto',
          opened ? 'px-0 pt-0 pb-0' : 'px-6 pt-5 pb-8',
        )}
      >
        {/* An open record replaces the library rather than covering it. A
            panel over a grid taller than the window leaves the bottom of the
            grid showing under it, which is what was hanging off the corner. */}
        {opened && tab !== 'playlists' ? null : !loaded ? null : songs.length === 0 &&
          tab !== 'playlists' ? (
          <Empty hasFolders={folders.length > 0} onPick={pick} onRescan={() => void scan()} />
        ) : searching && found.length === 0 ? (
          <p className="pt-16 text-center text-[14px] text-fg-subtle">
            Nothing here matches “{query.trim()}”.
          </p>
        ) : tab === 'albums' ? (
          <AlbumGrid
            albums={visibleAlbums}
            onOpen={(chosen) => setOpenAlbum(chosen.id)}
            onPlay={(chosen) => playAlbum(chosen, 0)}
            onShuffle={(chosen) => onShuffle(chosen.songs, chosen.title)}
            onEdit={(chosen) => setEditing({ songs: chosen.songs, scope: 'album' })}
          />
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
                <AlbumGrid
                  albums={artist.albums}
                  onOpen={(chosen) => setOpenAlbum(chosen.id)}
                  onPlay={(chosen) => playAlbum(chosen, 0)}
                  onShuffle={(chosen) => onShuffle(chosen.songs, chosen.title)}
                  onEdit={(chosen) => setEditing({ songs: chosen.songs, scope: 'album' })}
                />
              </section>
            ))}
          </div>
        ) : tab === 'songs' ? (
          <SongRows
            songs={found}
            playing={playing}
            onPlay={(index) => onPlay(found, index, searching ? `“${query.trim()}”` : 'Your music')}
            onAdd={setFiling}
            onEdit={(song) => setEditing({ songs: [song], scope: 'track' })}
            variant="flat"
          />
        ) : (
          <Playlists
            making={making}
            onMade={() => setMaking(false)}
            songs={songs}
            playing={playing}
            onPlay={onPlay}
            onAdd={setFiling}
            onEdit={(song) => setEditing({ songs: [song], scope: 'track' })}
          />
        )}

        {filing && <AddToPlaylist song={filing} onClose={() => setFiling(null)} />}
        {editing && (
          <EditDetails
            songs={editing.songs}
            scope={editing.scope}
            onClose={() => setEditing(null)}
          />
        )}

        {/* Placed outside the padded content so its colour wash reaches the
            edges of the window: an album page inset by 24px on every side is a
            card, and this is a page. */}
        {album && (
          <AlbumSheet
            album={album}
            playing={playing}
            onClose={() => setOpenAlbum(null)}
            onPlay={(index) => playAlbum(album, index)}
            onAdd={setFiling}
            onEdit={() => setEditing({ songs: album.songs, scope: 'album' })}
            onEditTrack={(song) => setEditing({ songs: [song], scope: 'track' })}
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

/**
 * The folders being watched.
 *
 * A dialog rather than a strip that unfolds inside the library, because it is
 * a settings screen and not part of browsing: it has nothing to do with what
 * is on screen behind it, and a panel that pushes the whole page down every
 * time somebody checks where their music is coming from is a page that moves
 * for no reason.
 *
 * The paths are shown as the folder's own name with its parent under it,
 * rather than as one long string that runs off the side. Nobody reads a path
 * left to right looking for the folder; they look for the name.
 */
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
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/65 p-6 animate-in fade-in-0 duration-150"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Music folders"
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[32rem] w-[34rem] max-w-full flex-col rounded-[var(--radius-panel)] border border-line bg-surface-1 shadow-[var(--shadow-panel)] animate-in fade-in-0 zoom-in-95 duration-150"
      >
        <div className="px-6 pt-6">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-fg">Music folders</h2>
          <p className="mt-1.5 text-[12px] leading-relaxed text-fg-subtle">
            Cadence reads the tags in these once and remembers them. It looks nowhere else.
          </p>
        </div>

        <div className="custom-scroll mt-4 min-h-0 flex-1 overflow-y-auto px-4">
          {folders.length === 0 ? (
            <p className="px-2 py-8 text-center text-[13px] text-fg-subtle">
              None yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {folders.map((folder) => {
                const cut = Math.max(folder.lastIndexOf('\\'), folder.lastIndexOf('/'));
                const name = cut === -1 ? folder : folder.slice(cut + 1);
                const parent = cut === -1 ? '' : folder.slice(0, cut);
                return (
                  <li
                    key={folder}
                    className="group flex items-center gap-3 rounded-[8px] px-2 py-2 transition-colors hover:bg-surface-2"
                  >
                    <Icon name="folder" size={16} className="shrink-0 text-fg-subtle" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-fg" dir="auto">
                        {name}
                      </span>
                      {parent && (
                        <span className="block truncate text-[11px] text-fg-subtle" dir="auto">
                          {parent}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => void onRemove(folder)}
                      className="shrink-0 rounded-[7px] p-1.5 text-fg-subtle opacity-0 transition-opacity hover:bg-surface-3 hover:text-danger group-hover:opacity-100 group-focus-within:opacity-100"
                      aria-label={`Stop watching ${name}`}
                    >
                      <Icon name="remove" size={15} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" size="sm" onClick={onRescan} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan again'}
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button size="sm" onClick={onAdd}>
              <Icon name="folder" size={15} />
              Add a folder
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Re-exported so the screen and the player agree on what a sleeve looks like. */
export { Artwork };
