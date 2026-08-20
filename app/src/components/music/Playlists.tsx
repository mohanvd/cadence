import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/format';
import type { Song } from '@/store/libraryStore';
import { tracksOf, usePlaylistStore, type Playlist } from '@/store/playlistStore';
import { SongRows } from './SongRows';

/**
 * The lists somebody made, as opposed to the ones a folder implied.
 *
 * The whole point of a playlist is that it is *not* derived from anything:
 * not from a folder, not from a tag, not from what a machine thinks goes
 * together. So there is nothing clever here — a name, an order, and the two
 * things you do to it. What matters is that it survives a rescan, which it
 * does because it is stored as paths and turned back into tracks where it is
 * drawn.
 */
export interface PlaylistsProps {
  songs: Song[];
  playing: string | null;
  onPlay: (songs: Song[], index: number, label: string) => void;
  onShuffle: (songs: Song[], label: string) => void;
  /** Open the dialog that puts a track in a list. */
  onAdd: (song: Song) => void;
}

export function Playlists({ songs, playing, onPlay, onShuffle, onAdd }: PlaylistsProps) {
  const lists = usePlaylistStore((s) => s.lists);
  const create = usePlaylistStore((s) => s.create);
  const rename = usePlaylistStore((s) => s.rename);
  const remove = usePlaylistStore((s) => s.remove);
  const removeAt = usePlaylistStore((s) => s.removeAt);

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [naming, setNaming] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const open = React.useMemo(
    () => lists.find((list) => list.id === openId) ?? null,
    [lists, openId],
  );

  const submit = React.useCallback(async () => {
    const made = await create(draft);
    setDraft('');
    setNaming(false);
    if (made) setOpenId(made.id);
  }, [create, draft]);

  if (open) {
    const tracks = tracksOf(open, songs);
    const missing = open.paths.length - tracks.length;
    const minutes = Math.round(tracks.reduce((total, song) => total + song.duration, 0) / 60);

    return (
      <div>
        <div className="mb-5 flex items-start gap-4">
          <Button variant="chrome" size="icon" onClick={() => setOpenId(null)} aria-label="Back">
            <Icon name="back" />
          </Button>

          <div className="min-w-0 flex-1">
            <input
              value={open.name}
              onChange={(event) => void rename(open.id, event.target.value)}
              aria-label="Playlist name"
              className="w-full truncate border-none bg-transparent text-2xl font-semibold tracking-[-0.02em] text-fg focus:outline-none"
            />
            <p className="mt-1 text-[12px] text-fg-subtle">
              {[
                `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`,
                minutes > 0 ? `${minutes} min` : null,
                /* Said plainly rather than hidden. A track on a disk that is
                   not plugged in has not been removed, and a count that
                   silently shrinks is a playlist quietly losing things. */
                missing > 0 ? `${missing} not found right now` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>

            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={() => onPlay(tracks, 0, open.name)} disabled={!tracks.length}>
                <Icon name="play" size={15} />
                Play
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onShuffle(tracks, open.name)}
                disabled={!tracks.length}
              >
                <Icon name="shuffle" size={15} />
                Shuffle
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void remove(open.id);
                  setOpenId(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>

        {tracks.length === 0 ? (
          <p className="pt-10 text-center text-[13px] text-fg-subtle">
            Nothing in here yet. Add tracks with the + beside them.
          </p>
        ) : (
          <SongRows
            songs={tracks}
            playing={playing}
            onPlay={(index) => onPlay(tracks, index, open.name)}
            onAdd={onAdd}
            onRemove={(index) => void removeAt(open.id, open.paths.indexOf(tracks[index]!.path))}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        {naming ? (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => !draft.trim() && setNaming(false)}
              placeholder="Name it"
              aria-label="Name the playlist"
              className="w-56 rounded-[var(--radius-control)] border border-line bg-surface-1 px-3 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none"
            />
            <Button size="sm" type="submit" disabled={!draft.trim()}>
              Create
            </Button>
          </form>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setNaming(true)}>
            <Icon name="louder" size={15} />
            New playlist
          </Button>
        )}
      </div>

      {lists.length === 0 ? (
        <p className="pt-16 text-center text-[13px] text-fg-subtle">
          No playlists yet. One is a name and an order, and nothing else.
        </p>
      ) : (
        <ul className="flex flex-col">
          {lists.map((list) => (
            <PlaylistRow key={list.id} list={list} songs={songs} onOpen={() => setOpenId(list.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlaylistRow({
  list,
  songs,
  onOpen,
}: {
  list: Playlist;
  songs: Song[];
  onOpen: () => void;
}) {
  const tracks = tracksOf(list, songs);
  const seconds = tracks.reduce((total, song) => total + song.duration, 0);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors',
          'hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none',
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-surface-2">
          <Icon name="queue" size={17} className="text-fg-subtle" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] text-fg">{list.name}</span>
          <span className="block truncate text-[12px] text-fg-subtle">
            {list.paths.length} {list.paths.length === 1 ? 'track' : 'tracks'}
          </span>
        </span>
        <span className="shrink-0 text-[12px] tabular-nums text-fg-subtle">
          {seconds > 0 ? formatTime(seconds) : ''}
        </span>
      </button>
    </li>
  );
}

/**
 * Where a track goes when you press the + beside it.
 *
 * One dialog for the whole screen rather than a popover per row: there are
 * eight thousand rows and one of these, and the alternative is eight thousand
 * popovers that each know about every playlist.
 */
export function AddToPlaylist({ song, onClose }: { song: Song; onClose: () => void }) {
  const lists = usePlaylistStore((s) => s.lists);
  const add = usePlaylistStore((s) => s.add);
  const create = usePlaylistStore((s) => s.create);
  const [draft, setDraft] = React.useState('');

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="w-80 rounded-[var(--radius-panel)] border border-line bg-surface-1 p-4 shadow-[var(--shadow-panel)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="truncate text-[14px] font-medium text-fg">Add “{song.title}” to</h2>

        {lists.length > 0 && (
          <ul className="mt-3 flex max-h-64 flex-col overflow-y-auto">
            {lists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => {
                    void add(list.id, [song.path]);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 rounded-[8px] px-2 py-2 text-left text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg"
                >
                  <Icon name="queue" size={14} className="shrink-0 text-fg-subtle" />
                  <span className="min-w-0 flex-1 truncate">{list.name}</span>
                  <span className="shrink-0 text-[11px] text-fg-subtle">{list.paths.length}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-3 flex gap-2 border-t border-line pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            void create(draft, [song.path]);
            onClose();
          }}
        >
          <input
            autoFocus={lists.length === 0}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="New playlist"
            aria-label="Name a new playlist"
            className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none"
          />
          <Button size="sm" type="submit" disabled={!draft.trim()}>
            Create
          </Button>
        </form>
      </div>
    </div>
  );
}
