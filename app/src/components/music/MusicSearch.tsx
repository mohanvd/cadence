import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

/**
 * The search field in the window's own bar.
 *
 * Up there rather than in the library's content because there is only one bar
 * now, and because searching is the fastest route to a record you can already
 * name — it should be in the same place whatever section you happen to be
 * looking at.
 */
export interface MusicSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function MusicSearch({ value, onChange }: MusicSearchProps) {
  return (
    <label className="group relative flex items-center">
      <Icon
        name="search"
        size={15}
        className="pointer-events-none absolute left-3 text-fg-subtle transition-colors group-focus-within:text-fg"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search your music"
        aria-label="Search your music"
        /* Left-aligned, like every field anybody has ever typed into. The
           icon is at the left edge and the caret starts beside it; a centred
           placeholder with a left-hand icon reads as two unrelated things
           sharing a box. */
        className={cn(
          'h-8 w-[22rem] rounded-full border border-line bg-surface-1 pr-9 pl-9',
          'text-[13px] text-fg placeholder:text-fg-subtle',
          'transition-colors hover:border-line-strong hover:bg-surface-2',
          'focus:border-line-strong focus:bg-surface-2 focus:outline-none',
          // Chromium draws its own clear button on a search field, at a size
          // and colour that belong to the browser rather than to this.
          '[&::-webkit-search-cancel-button]:hidden',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear the search"
          className="absolute right-2.5 flex size-5 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-white/10 hover:text-fg"
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </label>
  );
}
