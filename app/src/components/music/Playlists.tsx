import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogField } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/format';
import type { FolderList, Song } from '@/store/libraryStore';
import { useLibraryStore } from '@/store/libraryStore';
import { tracksOf, usePlaylistStore, type Playlist } from '@/store/playlistStore';
import { useView, useViewStore } from '@/store/viewStore';
import { Artwork } from './Artwork';
import { ListActions } from './ListActions';
import { SongRows } from './SongRows';
import { TrackMenu } from './TrackMenu';

/**
 * The lists somebody made, as opposed to the ones a folder implied.
 *
 * The whole point of a playlist is that it is *not* derived from anything: not
 * from a folder, not from a tag, not from what a machine thinks goes together.
 * So there is nothing clever here — a name, an order, and the three things you
 * do to it.
 *
 * Those three go through dialogs rather than through fields that appear in
 * place. Naming, renaming and deleting are each a decision with a moment
 * before and after it, and a text box that quietly turns into the page title
 * is a decision nobody was asked to make: it saves on every keystroke, there
 * is nothing to cancel, and a stray click leaves a record called `Fi`.
 */
export interface PlaylistsProps {
  songs: Song[];
  playing: string | null;
  onPlay: (songs: Song[], index: number, label: string) => void;
  /** Open the dialog that puts a track in a list. */
  onAdd: (song: Song) => void;
  /** Change what a track says it is. */
  onEdit?: ((song: Song) => void) | undefined;
  /** The window's Create menu asked for a new playlist. */
  making?: boolean;
  onMade?: (() => void) | undefined;
}

/** Which question is on screen, if any. */
type Asking =
  | { kind: 'create' }
  | { kind: 'rename'; list: Playlist }
  | { kind: 'delete'; list: Playlist }
  | null;

export function Playlists({
  songs,
  playing,
  onPlay,
  onAdd,
  onEdit,
  making = false,
  onMade,
}: PlaylistsProps) {
  const lists = usePlaylistStore((s) => s.lists);
  /* The folders under each watched folder, as lists. Derived by the library
     from what is on the disk, so they cost nothing to keep in step. */
  const folderLists = useLibraryStore((s) => s.folderLists);
  const create = usePlaylistStore((s) => s.create);
  const rename = usePlaylistStore((s) => s.rename);
  const remove = usePlaylistStore((s) => s.remove);
  const removeAt = usePlaylistStore((s) => s.removeAt);
  const exportFile = usePlaylistStore((s) => s.exportFile);

  /* Which playlist is open is a position in the window's history, so the back
     arrow closes it like it closes everything else. */
  const openId = useView().playlist;
  const go = useViewStore((s) => s.go);
  const setOpenId = React.useCallback((id: string | null) => go({ playlist: id }), [go]);

  const [asking, setAsking] = React.useState<Asking>(null);
  const [draft, setDraft] = React.useState('');

  const ask = React.useCallback((next: Asking) => {
    setAsking(next);
    setDraft(next?.kind === 'rename' ? next.list.name : '');
  }, []);

  /* Made lists and folder lists open the same page. The prefix on the id is
     what says which kind this is, and the page only differs in what it will
     let you do to it: a folder is the disk's arrangement and cannot be
     renamed or emptied from here. */
  const open = React.useMemo(
    () => lists.find((list) => list.id === openId) ?? null,
    [lists, openId],
  );
  const openFolder = React.useMemo(
    () => (openId?.startsWith('folder:') ? (folderLists.find((f) => f.id === openId) ?? null) : null),
    [folderLists, openId],
  );

  /* The Create menu lives in the window bar and this view owns the dialog, so
     the request arrives as a prop and is acknowledged straight away. */
  React.useEffect(() => {
    if (!making) return;
    ask({ kind: 'create' });
    onMade?.();
  }, [making, ask, onMade]);

  const answer = React.useCallback(async () => {
    if (!asking) return;
    if (asking.kind === 'create') {
      const made = await create(draft);
      if (made) setOpenId(made.id);
    } else if (asking.kind === 'rename') {
      await rename(asking.list.id, draft);
    } else {
      await remove(asking.list.id);
      if (openId === asking.list.id) setOpenId(null);
    }
    setAsking(null);
    setDraft('');
  }, [asking, draft, create, rename, remove, openId, setOpenId]);

  const question = asking && (
    <Dialog
      title={
        asking.kind === 'create'
          ? 'New playlist'
          : asking.kind === 'rename'
            ? 'Rename playlist'
            : `Delete “${asking.list.name}”?`
      }
      description={
        asking.kind === 'delete'
          ? 'The playlist goes. The music itself stays exactly where it is on disk.'
          : undefined
      }
      confirm={asking.kind === 'create' ? 'Create' : asking.kind === 'rename' ? 'Rename' : 'Delete'}
      destructive={asking.kind === 'delete'}
      ready={asking.kind === 'delete' || draft.trim().length > 0}
      onConfirm={() => void answer()}
      onCancel={() => setAsking(null)}
    >
      {asking.kind !== 'delete' && (
        <DialogField
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Name"
          aria-label="Playlist name"
        />
      )}
    </Dialog>
  );

  if (openFolder) {
    return (
      <>
        {question}
        <FolderPage
          list={openFolder}
          playing={playing}
          onPlay={onPlay}
          onAdd={onAdd}
          onEdit={onEdit}
        />
      </>
    );
  }

  if (open) {
    const tracks = tracksOf(open, songs);
    const missing = open.paths.length - tracks.length;
    const minutes = Math.round(tracks.reduce((total, song) => total + song.duration, 0) / 60);

    return (
      <>
        {question}
        <div className="flex flex-1 flex-col">
          <header className="px-8 pt-14 pb-8">
            <p className="text-[11px] font-semibold tracking-[0.1em] text-white/55 uppercase">
              Playlist
            </p>
            {/* A button that looks like the title, not a text box pretending to
                be one. Renaming is a decision, so it is asked as one. */}
            <button
              type="button"
              onClick={() => ask({ kind: 'rename', list: open })}
              className="group mt-1 flex max-w-full items-center gap-3 text-left"
            >
              <span className="truncate text-[clamp(1.75rem,4.5vw,3.25rem)] leading-[1.05] font-bold tracking-[-0.03em] text-white">
                {open.name}
              </span>
              <Icon
                name="bookmark"
                size={18}
                className="shrink-0 text-white/40 opacity-0 transition-opacity group-hover:opacity-100"
              />
            </button>
            <p className="mt-4 flex flex-wrap items-center gap-x-1.5 text-[13px] text-white/45">
              <span>
                {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
              </span>
              {minutes > 0 && <span>· {minutes} min</span>}
              {/* Said plainly rather than hidden. A track on a disk that is not
                  plugged in has not been removed, and a count that silently
                  shrinks is a playlist quietly losing things. */}
              {missing > 0 && <span>· {missing} not found right now</span>}
            </p>
          </header>

          <ListActions
            songs={tracks}
            label={open.name}
            onPlay={(index) => onPlay(tracks, index, open.name)}
          >
            <IconAction
              label={`Save ${open.name} as a file`}
              icon="folder"
              onClick={() => void exportFile(open.id, open.name)}
              className="ml-auto"
            />
            <IconAction
              label={`Delete ${open.name}`}
              icon="remove"
              onClick={() => ask({ kind: 'delete', list: open })}
              className="hover:text-danger"
            />
          </ListActions>

          <div className="px-5 pt-2 pb-10">
            {tracks.length === 0 ? (
              <p className="pt-10 text-center text-[13px] text-fg-subtle">
                Nothing in here yet. Right-click a track anywhere and add it.
              </p>
            ) : (
              <SongRows
                songs={tracks}
                playing={playing}
                onPlay={(index) => onPlay(tracks, index, open.name)}
                onAdd={onAdd}
                onEdit={onEdit}
                onRemove={(index) =>
                  void removeAt(open.id, open.paths.indexOf(tracks[index]!.path))
                }
              />
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {question}

      {folderLists.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-fg-subtle uppercase">
            From your folders
          </h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-5 gap-y-7">
            {folderLists.map((list) => (
              <FolderRow
                key={list.id}
                list={list}
                onOpen={() => setOpenId(list.id)}
                onPlay={() => onPlay(list.songs, 0, list.name)}
              />
            ))}
          </ul>
        </section>
      )}

      {folderLists.length > 0 && lists.length > 0 && (
        <h2 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-fg-subtle uppercase">
          Yours
        </h2>
      )}

      {lists.length === 0 && folderLists.length === 0 ? (
        <div className="flex flex-col items-center pt-20 text-center">
          <div className="mb-5 flex size-16 items-center justify-center rounded-[20px] border border-line bg-surface-1">
            <Icon name="queue" size={26} className="text-fg-subtle" />
          </div>
          <h2 className="text-[16px] font-semibold text-fg">No playlists yet</h2>
          <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-fg-subtle">
            A playlist is a name and an order, and nothing else. Make one, then right-click any
            track to put it in.
          </p>
          <Button className="mt-5" onClick={() => ask({ kind: 'create' })}>
            <Icon name="louder" size={15} />
            New playlist
          </Button>
        </div>
      ) : lists.length === 0 ? null : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-5 gap-y-7">
          {lists.map((list) => (
            <PlaylistRow
              key={list.id}
              list={list}
              songs={songs}
              onOpen={() => setOpenId(list.id)}
              onPlay={() => onPlay(tracksOf(list, songs), 0, list.name)}
              onRename={() => ask({ kind: 'rename', list })}
              onDelete={() => ask({ kind: 'delete', list })}
              onExport={() => void exportFile(list.id, list.name)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function IconAction({
  label,
  icon,
  onClick,
  disabled = false,
  className,
}: {
  label: string;
  icon: 'shuffle' | 'remove' | 'folder';
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'flex size-11 items-center justify-center rounded-full text-fg-muted transition-colors',
        'hover:bg-white/10 hover:text-fg disabled:pointer-events-none disabled:opacity-30',
        className,
      )}
    >
      <Icon name={icon} size={22} />
    </button>
  );
}

function PlaylistRow({
  list,
  songs,
  onOpen,
  onPlay,
  onRename,
  onDelete,
  onExport,
}: {
  list: Playlist;
  songs: Song[];
  onOpen: () => void;
  onPlay: () => void;
  onRename: () => void;
  onDelete: () => void;
  onExport: () => void;
}) {
  const tracks = tracksOf(list, songs);
  const seconds = tracks.reduce((total, song) => total + song.duration, 0);
  /* The first track that actually has a sleeve stands for the list. A playlist
     has no cover of its own, and a stack of identical grey squares tells you
     nothing about which is which. */
  const cover = tracks.find((song) => song.art)?.path ?? tracks[0]?.path ?? null;

  return (
    <TrackMenu
      songs={tracks}
      label={list.name}
      onPlay={onPlay}
      onRename={onRename}
      onDelete={onDelete}
      onExport={onExport}
    >
      <li>
        <button
          type="button"
          onClick={onOpen}
          className="group flex w-full flex-col text-left focus-visible:outline-none"
        >
          <Artwork
            path={cover}
            width={400}
            className={cn(
              'aspect-square w-full border border-line/60 transition-colors duration-150',
              'group-hover:border-line-strong group-focus-visible:ring-2 group-focus-visible:ring-accent',
            )}
          />
          <span className="mt-2.5 truncate text-[13px] font-medium text-fg">{list.name}</span>
          <span className="truncate text-[12px] text-fg-subtle">
            {list.paths.length} {list.paths.length === 1 ? 'track' : 'tracks'}
            {seconds > 0 ? ` · ${formatTime(seconds)}` : ''}
          </span>
        </button>
      </li>
    </TrackMenu>
  );
}

/**
 * Where a track goes when you ask for it to be filed.
 *
 * One dialog for the whole screen rather than a popover per row: there are as
 * many rows as there is music, and one of these.
 */
export function AddToPlaylist({ song, onClose }: { song: Song; onClose: () => void }) {
  const lists = usePlaylistStore((s) => s.lists);
  const add = usePlaylistStore((s) => s.add);
  const create = usePlaylistStore((s) => s.create);
  const [draft, setDraft] = React.useState('');
  const [naming, setNaming] = React.useState(false);

  if (naming || lists.length === 0) {
    return (
      <Dialog
        title="New playlist"
        description={`“${song.title}” goes in it.`}
        confirm="Create"
        ready={draft.trim().length > 0}
        onConfirm={() => {
          void create(draft, [song.path]);
          onClose();
        }}
        onCancel={onClose}
      >
        <DialogField
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Name"
          aria-label="Playlist name"
        />
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Add to a playlist"
      description={song.title}
      confirm="New playlist"
      onConfirm={() => setNaming(true)}
      onCancel={onClose}
    >
      <ul className="-mx-1 flex max-h-72 flex-col overflow-y-auto">
        {lists.map((list) => (
          <li key={list.id}>
            <button
              type="button"
              onClick={() => {
                void add(list.id, [song.path]);
                onClose();
              }}
              className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2.5 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <Icon name="queue" size={15} className="shrink-0 text-fg-subtle" />
              <span className="min-w-0 flex-1 truncate">{list.name}</span>
              <span className="shrink-0 text-[11px] text-fg-subtle">{list.paths.length}</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/**
 * A folder from the disk, opened as a list.
 *
 * The same page as a playlist with two things missing: it cannot be renamed
 * and it cannot be emptied. Both of those belong to whoever arranged the
 * folder, and offering them here would be offering to change something this
 * page cannot actually change — the name is the folder's name, and taking a
 * track out would mean deleting a file.
 */
function FolderPage({
  list,
  playing,
  onPlay,
  onAdd,
  onEdit,
}: {
  list: FolderList;
  playing: string | null;
  onPlay: (songs: Song[], index: number, label: string) => void;
  onAdd: (song: Song) => void;
  onEdit?: ((song: Song) => void) | undefined;
}) {
  const minutes = Math.round(list.duration / 60);

  return (
    <div className="flex flex-1 flex-col">
      <header className="relative px-8 pt-14 pb-8">
        {/* The folder's own colour, from the first sleeve in it. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <Artwork
            path={list.cover}
            width={96}
            rounded={false}
            className="size-full scale-150 opacity-35 blur-[64px] saturate-150"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--bg)]/45 to-[var(--bg)]" />
        </div>

        <div className="relative">
          <p className="text-[11px] font-semibold tracking-[0.1em] text-white/55 uppercase">
            Folder
          </p>
          <h2 className="mt-1 truncate text-[clamp(1.75rem,4.5vw,3.25rem)] leading-[1.05] font-bold tracking-[-0.03em] text-white">
            {list.name}
          </h2>
          <p className="mt-4 flex flex-wrap items-center gap-x-1.5 text-[13px] text-white/45">
            <span>
              {list.songs.length} {list.songs.length === 1 ? 'track' : 'tracks'}
            </span>
            {minutes > 0 && <span>· {minutes} min</span>}
          </p>
        </div>
      </header>

      <ListActions
        songs={list.songs}
        label={list.name}
        onPlay={(index) => onPlay(list.songs, index, list.name)}
      />

      <div className="px-5 pt-2 pb-10">
        <SongRows
          songs={list.songs}
          playing={playing}
          onPlay={(index) => onPlay(list.songs, index, list.name)}
          onAdd={onAdd}
          onEdit={onEdit}
        />
      </div>
    </div>
  );
}

/** One row in the list of folders. */
export function FolderRow({
  list,
  onOpen,
  onPlay,
}: {
  list: FolderList;
  onOpen: () => void;
  onPlay: () => void;
}) {
  return (
    <TrackMenu songs={list.songs} label={list.name} onPlay={onPlay}>
      <li>
        <button
          type="button"
          onClick={onOpen}
          className="group flex w-full flex-col text-left focus-visible:outline-none"
        >
          <Artwork
            path={list.cover}
            width={400}
            className={cn(
              'aspect-square w-full border border-line/60 transition-colors duration-150',
              'group-hover:border-line-strong group-focus-visible:ring-2 group-focus-visible:ring-accent',
            )}
          />
          <span className="mt-2.5 truncate text-[13px] font-medium text-fg" dir="auto">
            {list.name}
          </span>
          <span className="truncate text-[12px] text-fg-subtle">
            {list.songs.length} {list.songs.length === 1 ? 'track' : 'tracks'}
            {list.duration > 0 ? ` · ${formatTime(list.duration)}` : ''}
          </span>
        </button>
      </li>
    </TrackMenu>
  );
}
