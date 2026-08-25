import * as React from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { revealFile } from '@/lib/desktop';
import type { Song } from '@/store/libraryStore';
import { useQueueStore } from '@/store/queueStore';

/**
 * The right-click menu on anything that is, or contains, tracks.
 *
 * One component for a row, a sleeve and a playlist, because the answer to
 * "what can I do with this" is the same in all three: play it, play it next,
 * put it at the end, file it, find it on disk. Only the label at the top and
 * the odd extra item differ, and those are arguments.
 *
 * The point of it existing at all is that without it a right-click reached
 * WebView2's own menu — Back, Refresh, Save as, Print, Inspect — which is the
 * browser underneath announcing itself. Every surface worth right-clicking is
 * wrapped in one of these, and the ones that are not suppress the browser's
 * instead (see `useNoBrowserMenu`).
 */
export interface TrackMenuProps {
  /** What the menu is about. One track, an album's worth, a playlist's worth. */
  songs: Song[];
  /** Named at the top, so it is clear what "play" is about to do. */
  label: string;
  /** Start it playing, queueing the rest behind. */
  onPlay: () => void;
  onShuffle?: (() => void) | undefined;
  /** Open the dialog that files it in a playlist. */
  onAddToPlaylist?: ((song: Song) => void) | undefined;
  /** Only inside a playlist: take it out again. */
  onRemove?: (() => void) | undefined;
  /** Only for a playlist itself. */
  onRename?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  /** Change what the file itself says: title, artist, sleeve. */
  onEdit?: (() => void) | undefined;
  /** Write the list out as an `.m3u` anything else can read. */
  onExport?: (() => void) | undefined;
  children: React.ReactNode;
}

export function TrackMenu({
  songs,
  label,
  onPlay,
  onShuffle,
  onAddToPlaylist,
  onRemove,
  onRename,
  onDelete,
  onEdit,
  onExport,
  children,
}: TrackMenuProps) {
  const playNext = useQueueStore((s) => s.playNext);
  const append = useQueueStore((s) => s.append);
  const queued = useQueueStore((s) => s.items.length > 0);

  const paths = React.useMemo(() => songs.map((song) => song.path), [songs]);
  const one = songs.length === 1 ? songs[0] : null;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>{label}</ContextMenuLabel>

        <ContextMenuItem icon="play" onSelect={onPlay}>
          Play
        </ContextMenuItem>
        {onShuffle && (
          <ContextMenuItem icon="shuffle" onSelect={onShuffle}>
            Shuffle
          </ContextMenuItem>
        )}

        {/* Only while there is a queue to put something into. Offering to
            "play next" when nothing is playing is offering to do the same
            thing as Play, under a name that says otherwise. */}
        {queued && (
          <>
            <ContextMenuItem
              icon="next"
              onSelect={() => {
                // Reversed, because each one goes immediately after the
                // current track and the last inserted ends up first.
                [...paths].reverse().forEach((path) => playNext(path));
              }}
            >
              Play next
            </ContextMenuItem>
            <ContextMenuItem icon="queue" onSelect={() => append(paths)}>
              Add to the queue
            </ContextMenuItem>
          </>
        )}

        {(onAddToPlaylist || onRemove || onRename || onDelete || onEdit || onExport) && (
          <ContextMenuSeparator />
        )}

        {onEdit && (
          <ContextMenuItem icon="settings" onSelect={onEdit}>
            Edit details…
          </ContextMenuItem>
        )}

        {onAddToPlaylist && one && (
          <ContextMenuItem icon="louder" onSelect={() => onAddToPlaylist(one)}>
            Add to a playlist…
          </ContextMenuItem>
        )}
        {onRename && (
          <ContextMenuItem icon="bookmark" onSelect={onRename}>
            Rename
          </ContextMenuItem>
        )}
        {onRemove && (
          <ContextMenuItem icon="remove" onSelect={onRemove}>
            Remove from this playlist
          </ContextMenuItem>
        )}
        {onExport && (
          <ContextMenuItem icon="folder" onSelect={onExport}>
            Save as a file…
          </ContextMenuItem>
        )}
        {onDelete && (
          <ContextMenuItem icon="remove" onSelect={onDelete}>
            Delete the playlist
          </ContextMenuItem>
        )}

        {one && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem icon="folder" onSelect={() => void revealFile(one.path)}>
              Show in Explorer
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * Stop the browser's own context menu appearing anywhere in the window.
 *
 * WebView2 offers Back, Refresh, Save as, Print and Inspect on a right-click,
 * which is the browser underneath the application introducing itself — and
 * three of those five would do something actively wrong to a media player.
 *
 * Registered once, at the document, in the bubble phase. Radix's own triggers
 * handle the same event on the element first, so a right-click on something
 * with a real menu still opens it; this only catches what is left.
 *
 * Text inputs keep theirs. Cut, copy, paste and the spell-check suggestions
 * are the operating system's, not the browser's, and replacing them with
 * nothing would be taking away the only menu on the screen that was useful.
 */
export function useNoBrowserMenu(): void {
  React.useEffect(() => {
    const swallow = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable) return;
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      }
      event.preventDefault();
    };
    document.addEventListener('contextmenu', swallow);
    return () => document.removeEventListener('contextmenu', swallow);
  }, []);
}
