import { create } from 'zustand';
import {
  libraryFolders,
  libraryScan,
  librarySongs,
  libraryUnwatch,
  libraryWatch,
  onLibraryScan,
  onLibraryScanned,
} from '@/lib/desktop';

/**
 * The music on this machine, as the page sees it.
 *
 * A cache of the shell's answer, not a second copy of the truth. Everything
 * here comes from one command and is replaced whole by the next one; nothing
 * is edited in place, because the disk is what changed and the disk is what
 * gets read again.
 *
 * The groupings below are derived rather than stored, and derived once per
 * change rather than once per render. Grouping eight thousand tracks into
 * albums is a fraction of a second the first time and nothing at all after,
 * which is the difference between a library that opens and one that stutters
 * every time somebody types a letter into the search field.
 */

export interface Song {
  path: string;
  file: string;
  title: string;
  artist: string | null;
  albumArtist: string | null;
  album: string | null;
  track: number | null;
  disc: number | null;
  year: number | null;
  genre: string | null;
  duration: number;
  art: boolean;
  modified: number;
  size: number;
}

export interface Album {
  /** Album and artist together: two albums called *Greatest Hits* are two. */
  id: string;
  title: string;
  artist: string;
  year: number | null;
  songs: Song[];
  /** The track whose sleeve stands for the album. */
  cover: string;
  duration: number;
}

export interface Artist {
  name: string;
  albums: Album[];
  songs: number;
}

/**
 * A subfolder of a watched folder, as a list you can play.
 *
 * People who keep music on a disk have already sorted it, and the sorting is
 * the folders: one per record, or per mix, or per year, or per whatever they
 * were thinking. Making them ask for that again by building playlists that
 * mirror what is already on the disk is asking them to do the filing twice.
 *
 * Derived rather than stored, and that is the important part. A real playlist
 * made from a folder would be a copy that goes stale the moment a file is
 * added, and two of them after the second scan. This is computed from the
 * songs every time they change, so it is never wrong and there is nothing to
 * clean up.
 *
 * The id carries a prefix because a folder and a made playlist open the same
 * page and are told apart by it.
 */
export interface FolderList {
  /** `folder:` and the folder's full path. */
  id: string;
  /** The folder's own name, which is what people called it. */
  name: string;
  /** The watched folder it sits under, for saying where it came from. */
  under: string;
  songs: Song[];
  duration: number;
  /** The track whose sleeve stands for it. */
  cover: string;
}

interface LibraryState {
  songs: Song[];
  folders: string[];
  /** False until the first read has come back, so an empty library and an
      unread one can be told apart. Showing "no music" to somebody whose
      library is still loading is a lie that lasts a second and reads as a
      bug. */
  loaded: boolean;
  scanning: boolean;
  progress: { done: number; total: number } | null;

  albums: Album[];
  artists: Artist[];
  folderLists: FolderList[];

  load: () => Promise<void>;
  scan: () => Promise<number>;
  addFolder: (folder: string) => Promise<boolean>;
  removeFolder: (folder: string) => Promise<void>;
  /** Start listening for scan progress. Returns a function that stops. */
  follow: () => Promise<() => void>;
}

const UNKNOWN_ARTIST = 'Unknown artist';
const UNKNOWN_ALBUM = 'Unknown album';

/**
 * Who an album is by.
 *
 * The album artist when the file names one, because that is the field that
 * exists precisely for this: a compilation has eighteen track artists and one
 * album artist, and grouping by the track artist turns one album into
 * eighteen one-track albums. Falling back to the track artist is right for the
 * ordinary case, where a tagger filled in one field and not the other.
 */
function albumArtistOf(song: Song): string {
  return song.albumArtist ?? song.artist ?? UNKNOWN_ARTIST;
}

/**
 * One album's identity: its name and who it is by.
 *
 * Joined on a character that cannot occur in either half, written as an escape
 * rather than typed. It had been a literal null byte in the source, invisible
 * in every editor, and the sort of thing that survives for months and then
 * breaks a diff, a grep or a copy-paste for reasons nobody can see.
 */
function albumKey(song: Song): string {
  return `${(song.album ?? UNKNOWN_ALBUM).toLowerCase()}\u0000${albumArtistOf(song).toLowerCase()}`;
}

/** Group tracks into albums, in the order they should be read. */
function group(songs: Song[]): { albums: Album[]; artists: Artist[] } {
  const byAlbum = new Map<string, Album>();
  /* Whether an album's chosen sleeve came from a track that actually has one.
     Held beside the album rather than on it, because it is scaffolding for
     building the list and not a fact anybody reading the list needs. */
  const settled = new Set<string>();

  for (const song of songs) {
    const id = albumKey(song);
    let album = byAlbum.get(id);
    if (!album) {
      album = {
        id,
        title: song.album ?? UNKNOWN_ALBUM,
        artist: albumArtistOf(song),
        year: song.year,
        songs: [],
        cover: song.path,
        duration: 0,
      };
      byAlbum.set(id, album);
    }
    album.songs.push(song);
    album.duration += song.duration;
    // The sleeve comes from a track that has one embedded, if any does.
    // Otherwise the first track stands for it, and the shell will look beside
    // the file for a cover the tagger left in the folder.
    if (song.art && !settled.has(id)) {
      album.cover = song.path;
      settled.add(id);
    }
    // The earliest year any track claims. A rip where one track was tagged
    // with the reissue date should not date the album to the reissue.
    if (song.year !== null && (album.year === null || song.year < album.year)) {
      album.year = song.year;
    }
  }

  const albums = [...byAlbum.values()].sort(
    (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title),
  );

  const byArtist = new Map<string, Artist>();
  for (const album of albums) {
    let artist = byArtist.get(album.artist.toLowerCase());
    if (!artist) {
      artist = { name: album.artist, albums: [], songs: 0 };
      byArtist.set(album.artist.toLowerCase(), artist);
    }
    artist.albums.push(album);
    artist.songs += album.songs.length;
  }

  const artists = [...byArtist.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const artist of artists) {
    // Newest first within an artist, which is how anybody looks for a record
    // they half-remember. Undated ones sort last rather than to year zero.
    artist.albums.sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || a.title.localeCompare(b.title));
  }

  return { albums, artists };
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  songs: [],
  folders: [],
  loaded: false,
  scanning: false,
  progress: null,
  albums: [],
  artists: [],
  folderLists: [],

  load: async () => {
    const [songs, folders] = await Promise.all([librarySongs(), libraryFolders()]);
    set({
      songs,
      folders,
      loaded: true,
      ...group(songs),
      folderLists: foldersOf(songs, folders),
    });
  },

  scan: async () => {
    if (get().scanning) return 0;
    set({ scanning: true, progress: { done: 0, total: 0 } });
    try {
      const found = await libraryScan();
      await get().load();
      return found;
    } finally {
      set({ scanning: false, progress: null });
    }
  },

  addFolder: async (folder) => {
    const added = await libraryWatch(folder);
    set({ folders: await libraryFolders() });
    // Only worth walking when there is something new to walk. Adding a folder
    // already covered by another would otherwise re-read the whole library to
    // arrive back where it started.
    if (added) await get().scan();
    return added;
  },

  removeFolder: async (folder) => {
    await libraryUnwatch(folder);
    await get().load();
  },

  follow: async () => {
    const [progress, finished] = await Promise.all([
      onLibraryScan((update) => {
        // Ignored once the scan is over: a last event can arrive after the
        // command has resolved, and it would put the bar back on screen.
        if (get().scanning) set({ progress: update });
      }),
      /* Whoever started it. The store reloads after its own scans anyway, so
         this is for the ones it did not start, and it costs one read of a
         list that is already in the shell's memory. */
      onLibraryScanned(() => {
        void get().load();
      }),
    ]);
    return () => {
      progress();
      finished();
    };
  },
}));

/**
 * The path separator, spelled out rather than typed.
 *
 * Windows paths are full of backslashes and every one of them has to survive
 * being a string literal, a template literal and a regular expression on the
 * way through this file. Naming it once removes the whole class of mistake.
 */
const SEP = String.fromCharCode(92);
/** Either separator, for splitting a path that came from anywhere. */
const SEPARATORS = new RegExp(`[${SEP}${SEP}/]`);
/** The same, anchored, for trimming a trailing one. */
const TRAILING = new RegExp(`[${SEP}${SEP}/]+$`);

function trimSeparator(path: string): string {
  return path.replace(TRAILING, '');
}

/** Where a path's folder ends, whichever separator the platform used. */
function parentOf(path: string): string {
  const cut = Math.max(path.lastIndexOf(SEP), path.lastIndexOf('/'));
  return cut === -1 ? '' : path.slice(0, cut);
}

/**
 * Group tracks by the folder they sit in, under each watched folder.
 *
 * The *immediate* subfolder rather than the deepest one: somebody who keeps
 * `Music/Rock/Album/01.flac` filed it under Rock, and a list per album would
 * be the album list again under a different name. Tracks lying loose in the
 * watched folder itself belong to no subfolder and are left out, a list
 * called "Music" containing everything is the library.
 *
 * Compared case-insensitively because Windows paths are, and a watched folder
 * typed as `D:\Music` has to match a file walked up as `D:\music\...`.
 */
export function foldersOf(songs: Song[], watched: string[]): FolderList[] {
  if (watched.length === 0) return [];
  const roots = watched.map((root) => ({ root, lower: trimSeparator(root.toLowerCase()) }));

  const byFolder = new Map<string, FolderList>();
  const settled = new Set<string>();

  for (const song of songs) {
    const folder = parentOf(song.path);
    if (!folder) continue;
    const lower = folder.toLowerCase();

    /* The deepest watched folder that contains this one, so nesting a watched
       folder inside another still files the track under the nearer of the
       two. */
    let best: { root: string; lower: string } | null = null;
    for (const candidate of roots) {
      if (lower === candidate.lower) continue;
      const inside =
        lower.startsWith(candidate.lower + SEP) || lower.startsWith(`${candidate.lower}/`);
      if (!inside) continue;
      if (!best || candidate.lower.length > best.lower.length) best = candidate;
    }
    if (!best) continue;

    // The first segment below the watched folder, and everything under it.
    const rest = folder.slice(best.lower.length + 1);
    const cut = rest.search(SEPARATORS);
    const top = cut === -1 ? rest : rest.slice(0, cut);
    if (!top) continue;

    const path = trimSeparator(best.root) + SEP + top;
    const id = `folder:${path}`;
    let list = byFolder.get(id);
    if (!list) {
      list = {
        id,
        name: top,
        under: best.root,
        songs: [],
        duration: 0,
        cover: song.path,
      };
      byFolder.set(id, list);
    }
    list.songs.push(song);
    list.duration += song.duration;
    /* The first track that actually has a sleeve stands for the folder. The
       flag is kept beside the list rather than re-derived from it: searching
       the tracks already added, once per track, is quadratic, and a folder
       with a few thousand files in it is exactly where that stops being
       free. */
    if (song.art && !settled.has(id)) {
      list.cover = song.path;
      settled.add(id);
    }
  }

  return [...byFolder.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The tracks matching what somebody typed, or all of them for an empty box.
 *
 * Every word has to match something, and it may match a different field each
 * time: "auva light" finds *First Light* by Auva without either word being in
 * both fields. Matching the whole phrase against each field instead is what
 * makes a search box that only works if you already know what you are looking
 * for.
 */
export function search(songs: Song[], query: string): Song[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return songs;
  return songs.filter((song) => {
    const haystack = [song.title, song.artist, song.albumArtist, song.album, song.genre]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
