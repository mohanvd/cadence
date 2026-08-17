import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import {
  MenuItem,
  MenuSeparator,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useExclusiveMenu,
} from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { formatTime } from '@/lib/format';
import type { PlayerFeatures } from '@/features/usePlayerFeatures';
import { useDuration, usePlayerActions } from '@/store/playerStore';

interface Bookmark {
  id: string;
  time: number;
  note: string;
}

/** Saved timestamps for the current file, with jump-to and export. */
export function BookmarkMenu({ features }: { features: PlayerFeatures }) {
  const menu = useExclusiveMenu('bookmarks');
  const { bookmarks, addBookmarkAtPlayhead } = features;
  const { seek } = usePlayerActions();
  const duration = useDuration();
  const list: Bookmark[] = bookmarks.bookmarks ?? [];

  return (
    <Popover {...menu}>
      <Tooltip label="Bookmarks" shortcut="B">
        <PopoverTrigger asChild>
          <Button
            variant="chrome"
            size="icon"
            aria-label="Bookmarks"
          >
            <Icon name="bookmark" />
          </Button>
        </PopoverTrigger>
      </Tooltip>

      <PopoverContent className="w-72">
        <MenuItem onSelect={addBookmarkAtPlayhead}>Add bookmark here</MenuItem>

        {list.length > 0 && (
          <>
            <MenuSeparator />
            <div className="max-h-64 overflow-y-auto scroll-slim">
              {list.map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="group/bm flex items-center gap-1 rounded-md pr-1 hover:bg-surface-3"
                >
                  <button
                    type="button"
                    onClick={() => seek(bookmark.time)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1.5 text-left"
                  >
                    <span className="shrink-0 text-[12px] tabular-nums text-accent">
                      {formatTime(bookmark.time, duration)}
                    </span>
                    <span className="truncate text-[13px] text-fg-muted">
                      {bookmark.note || 'Bookmark'}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Delete bookmark"
                    onClick={() => bookmarks.remove(bookmark.id)}
                    // Revealed on hover so the list stays calm to scan.
                    className="shrink-0 rounded p-1.5 text-fg-subtle opacity-0 transition hover:text-danger group-hover/bm:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3.5" strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>

            <MenuSeparator />
            <MenuItem onSelect={() => bookmarks.exportAsMarkdown()}>
              Export as Markdown
            </MenuItem>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
