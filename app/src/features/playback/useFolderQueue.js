import { useState, useEffect, useCallback, useMemo } from 'react';
import { folderPlaylist } from '../../lib/desktop';

/**
 * The other videos sitting beside the one being played.
 *
 * There is no playlist to build and none to save. The folder a file was opened
 * from is the queue, in the order the names read, which is how anybody who has
 * a season of television on a disk has already arranged it. Opening episode
 * four means episode five is next, and nothing had to be told that.
 *
 * Rebuilt whenever the folder changes rather than whenever the file does, so
 * that reaching the end of one episode and starting the next does not go back
 * to the disk to be told the same list again.
 *
 * @param {{ kind: string, path?: string } | null} source
 * @returns {{
 *   next: string | null,
 *   previous: string | null,
 *   position: { index: number, total: number } | null,
 * }}
 */
export function useFolderQueue(source) {
  const path = source?.kind === 'path' ? source.path : null;
  const folder = useMemo(() => (path ? path.slice(0, Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))) : null), [path]);

  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (!folder || !path) {
      setEntries([]);
      return undefined;
    }

    let current = true;
    void folderPlaylist(path).then((list) => {
      if (current) setEntries(list);
    });
    return () => {
      current = false;
    };
    // Keyed on the folder: walking through it must not re-read it per file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  /* Paths are compared as the shell wrote them, with the separators and the
     case left alone. Both sides of this comparison came from the same command
     on the same platform, so normalising them would only introduce a way for
     two spellings of one file to stop matching. */
  const index = path ? entries.indexOf(path) : -1;

  return {
    next: index >= 0 && index < entries.length - 1 ? entries[index + 1] : null,
    previous: index > 0 ? entries[index - 1] : null,
    // Only worth showing when there is something to be in the middle of.
    position: index >= 0 && entries.length > 1 ? { index: index + 1, total: entries.length } : null,
  };
}

/**
 * Turn the queue into the callbacks the player takes.
 *
 * Null rather than a function that does nothing when there is nowhere to go:
 * the control bar renders its skip buttons only for the handlers it was given,
 * so a film on its own gets no buttons rather than two dead ones.
 *
 * @param {{ next: string | null, previous: string | null }} queue
 * @param {(path: string) => void} play
 */
export function useQueueControls(queue, play) {
  const { next, previous } = queue;
  const onNext = useCallback(() => next && play(next), [next, play]);
  const onPrevious = useCallback(() => previous && play(previous), [previous, play]);
  return {
    onNext: next ? onNext : undefined,
    onPrevious: previous ? onPrevious : undefined,
  };
}
