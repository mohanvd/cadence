import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import {
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSlider,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useExclusiveMenu,
} from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { PlayerFeatures } from '@/features/usePlayerFeatures';
import { SUBTITLE_LANGUAGES } from '@/features/subtitles/useOnlineSubtitles';

const SIZES = ['14px', '16px', '18px', '22px', '26px', '32px'];

/**
 * Subtitle track loading, timing and styling.
 *
 * The offset control is the reason this is a menu rather than a toggle:
 * downloaded subtitles are frequently out of sync with a given release, and
 * being able to nudge them while watching is what makes them usable at all.
 */
export function SubtitleMenu({ features }: { features: PlayerFeatures }) {
  const menu = useExclusiveMenu('subtitles');
  const { subtitles, loadSubtitleFile, onlineSubtitles } = features;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = React.useState(false);

  // Reopening on the search pane would hide the timing controls behind a step,
  // and timing is what the user comes back for.
  React.useEffect(() => {
    if (!menu.open) setSearchOpen(false);
  }, [menu.open]);

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await loadSubtitleFile(file);
    // Reset so picking the same file twice still fires a change event.
    event.target.value = '';
  };

  return (
    <Popover {...menu}>
      <Tooltip label="Subtitles" shortcut="C">
        <PopoverTrigger asChild>
          <Button
            variant="chrome"
            size="icon"
            aria-label="Subtitles"
          >
            <Icon name="captions" />
          </Button>
        </PopoverTrigger>
      </Tooltip>

      <PopoverContent className="w-72">
        <input
          ref={inputRef}
          type="file"
          accept=".srt,.vtt"
          hidden
          onChange={onPick}
        />

        {searchOpen ? (
          <OnlineSearch
            online={onlineSubtitles}
            onBack={() => setSearchOpen(false)}
            onLoaded={() => setSearchOpen(false)}
          />
        ) : !subtitles.hasSubtitles ? (
          <>
            <div className="px-2.5 py-2 text-[12px] leading-relaxed text-fg-subtle">
              No subtitles loaded. Search online, choose an .srt or .vtt file, or
              or just drop one onto the video.
            </div>
            <MenuItem onSelect={() => setSearchOpen(true)}>Search online…</MenuItem>
            <MenuItem onSelect={() => inputRef.current?.click()}>
              Load subtitle file…
            </MenuItem>
          </>
        ) : (
          <>
            <MenuItem active={subtitles.enabled} onSelect={subtitles.toggle}>
              {subtitles.enabled ? 'Subtitles on' : 'Subtitles off'}
            </MenuItem>
            <div className="truncate px-2.5 pb-1.5 text-[11px] text-fg-subtle">
              {subtitles.label}
            </div>
            <MenuItem onSelect={() => setSearchOpen(true)}>Search online…</MenuItem>
            <MenuItem onSelect={() => inputRef.current?.click()}>Replace file…</MenuItem>
            <MenuItem onSelect={subtitles.clear}>Remove subtitles</MenuItem>

            <MenuSeparator />
            <MenuLabel>Timing</MenuLabel>
            <div className="flex items-center gap-1.5 px-2.5 pb-1">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => subtitles.changeOffset(-0.5)}
              >
                −0.5s
              </Button>
              <span className="min-w-14 text-center text-[12px] tabular-nums text-fg">
                {subtitles.offset > 0 ? '+' : ''}
                {subtitles.offset.toFixed(1)}s
              </span>
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => subtitles.changeOffset(0.5)}
              >
                +0.5s
              </Button>
            </div>

            <MenuSeparator />
            <MenuLabel>Appearance</MenuLabel>
            <div className="flex flex-wrap gap-1 px-1.5 pb-1">
              {SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => subtitles.changeStyle('fontSize', size)}
                  className={cn(
                    'rounded-md px-2 py-1.5 text-[11px] tabular-nums transition-colors',
                    subtitles.style.fontSize === size
                      ? 'bg-accent text-accent-fg'
                      : 'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg',
                  )}
                >
                  {parseInt(size, 10)}
                </button>
              ))}
            </div>
            <MenuSlider
              label="Backdrop"
              value={Math.round(
                parseFloat(
                  subtitles.style.background.match(/[\d.]+\)$/)?.[0] ?? '0.75)',
                ) * 100,
              )}
              min={0}
              max={100}
              format={(v) => `${v}%`}
              onChange={(v) =>
                subtitles.changeStyle('background', `rgba(0, 0, 0, ${v / 100})`)
              }
            />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Search results from OpenSubtitles.
 *
 * Hash matches are labelled rather than silently sorted to the top, because
 * "this is timed to your exact copy" is the single most useful thing the list
 * can tell you, and it is the difference between picking the right row and
 * downloading three before one lines up.
 */
function OnlineSearch({
  online,
  onBack,
  onLoaded,
}: {
  online: PlayerFeatures['onlineSubtitles'];
  onBack: () => void;
  onLoaded: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-3"
      >
        <Icon name="back" className="size-4" />
        Search online
      </button>
      <MenuSeparator />

      <div className="flex gap-1.5 px-2.5 pt-1.5 pb-2">
        <input
          value={online.query}
          onChange={(event) => online.setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void online.search();
            // The menu closes on Escape; a search box needs it for its own
            // dismissal first, so stop it before the popover sees it.
            event.stopPropagation();
          }}
          placeholder="Title"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1.5 text-[12px] text-fg outline-none placeholder:text-fg-subtle focus-visible:border-accent"
        />
        <Button size="sm" onClick={() => void online.search()} disabled={online.searching}>
          {online.searching ? '…' : 'Go'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1 px-1.5 pb-2">
        {SUBTITLE_LANGUAGES.map((language) => (
          <button
            key={language.code}
            type="button"
            onClick={() => online.setLanguage(language.code)}
            className={cn(
              'rounded-md px-2 py-1 text-[11px] transition-colors',
              online.language === language.code
                ? 'bg-accent text-accent-fg'
                : 'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg',
            )}
          >
            {language.label}
          </button>
        ))}
      </div>

      {online.error && (
        <div className="px-2.5 pb-2 text-[12px] leading-relaxed text-warning">
          {online.error}
        </div>
      )}

      {online.results && online.results.length > 0 && (
        <>
          <MenuSeparator />
          <div className="max-h-64 overflow-y-auto scroll-slim" data-scrollable>
            {online.results.map((result) => (
              <button
                key={result.fileId}
                type="button"
                disabled={online.downloadingId !== null}
                onClick={async () => {
                  if (await online.pick(result)) onLoaded();
                }}
                className="flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-3 disabled:opacity-50"
              >
                <span className="line-clamp-2 text-[12px] leading-snug text-fg">
                  {result.name}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
                  {result.hashMatch && (
                    <span className="rounded bg-success/20 px-1 py-px text-success">
                      Exact match
                    </span>
                  )}
                  <span>{result.downloads.toLocaleString()} downloads</span>
                  {online.downloadingId === result.fileId && <span>· loading…</span>}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
