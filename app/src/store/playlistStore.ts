import { create } from 'zustand';
import {
  playlistCreate,
  playlistDelete,
  playlistRename,
  playlistSet,
  playlists as readPlaylists,
} from '@/lib/desktop';
import type { Song } from './libraryStore';

/**
 * The lists somebody made.
 *
 * Held as paths, like the queue and like the shell's own copy, because a
 * playlist outlives a rescan and a rescan replaces every record in the
 * library. Turning them back into songs is `tracksOf` below, done where the
 * list is drawn rather than where it is stored, so a track that was missing
 * yesterday and is back today simply reappears.
 *
 * A path with no record behind it is dropped from the *display* and kept in
 * the *list*. A disk unplugged today is plugged in tomorrow, and a playlist
 * that quietly deletes itself while a drive is disconnected is a playlist
 * nobody can trust with anything.
 */

export interface Playlist {
  id: string;
  name: string;
  paths: string[];
  created: number;
}

interface PlaylistState {
  lists: Playlist[];
  loaded: boolean;

  load: () => Promise<void>;
  create: (name: string, paths?: string[]) => Promise<Playlist | null>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Put tracks at the end, skipping any the list already holds. */
  add: (id: string, paths: string[]) => Promise<void>;
  /** Take one track out, by its position. */
  removeAt: (id: string, index: number) => Promise<void>;
}

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  lists: [],
  loaded: false,

  load: async () => {
    set({ lists: await readPlaylists(), loaded: true });
  },

  create: async (name, paths = []) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const made = await playlistCreate(trimmed, paths);
    await get().load();
    return made;
  },

  rename: async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await playlistRename(id, trimmed);
    await get().load();
  },

  remove: async (id) => {
    await playlistDelete(id);
    await get().load();
  },

  add: async (id, paths) => {
    const list = get().lists.find((candidate) => candidate.id === id);
    if (!list) return;
    /* Adding a track that is already there is almost always a misclick rather
       than a request for two copies, and an album added twice by accident is
       tedious to undo one row at a time. */
    const held = new Set(list.paths);
    const fresh = paths.filter((path) => !held.has(path));
    if (fresh.length === 0) return;
    await playlistSet(id, [...list.paths, ...fresh]);
    await get().load();
  },

  removeAt: async (id, index) => {
    const list = get().lists.find((candidate) => candidate.id === id);
    if (!list || index < 0 || index >= list.paths.length) return;
    await playlistSet(
      id,
      list.paths.filter((_, at) => at !== index),
    );
    await get().load();
  },
}));

/**
 * The records behind a playlist's paths, in the playlist's own order.
 *
 * Not the library's order. A playlist is a sequence somebody chose, and
 * sorting it by album would be discarding the only thing that makes it one.
 */
export function tracksOf(list: Playlist, songs: Song[]): Song[] {
  const byPath = new Map(songs.map((song) => [song.path, song]));
  return list.paths
    .map((path) => byPath.get(path))
    .filter((song): song is Song => song !== undefined);
}
