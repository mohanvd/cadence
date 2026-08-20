import * as React from 'react';
import { musicTags } from '@/lib/desktop';
import type { Song } from '@/store/libraryStore';
import { useLibraryStore } from '@/store/libraryStore';
import type { MediaSourceInput } from '@/engine/types';

/**
 * What the track playing right now calls itself.
 *
 * The library first, because it has already read every file it watches and
 * asking again would be a process spawned to learn something already known.
 * The shell second, for the tracks the library has never seen — one opened by
 * double-clicking it in Explorer, or dropped on the window, which is how most
 * music arrives the first time somebody tries this.
 *
 * Null while the answer is still coming and for anything that is not a path.
 * The caller falls back to the file name, which is what it had before this
 * existed and is never wrong, only thin.
 */
export function useNowPlaying(source: MediaSourceInput, isMusic: boolean): Song | null {
  const path = source.kind === 'path' ? source.path : null;
  const songs = useLibraryStore((s) => s.songs);

  const known = React.useMemo(
    () => (path ? (songs.find((song) => song.path === path) ?? null) : null),
    [songs, path],
  );

  const [read, setRead] = React.useState<Song | null>(null);

  React.useEffect(() => {
    // Nothing to ask about, or the library already answered.
    if (!path || !isMusic || known) {
      setRead(null);
      return undefined;
    }
    let live = true;
    void musicTags(path).then((song) => {
      if (live) setRead(song);
    });
    return () => {
      live = false;
    };
  }, [path, isMusic, known]);

  return known ?? read;
}
