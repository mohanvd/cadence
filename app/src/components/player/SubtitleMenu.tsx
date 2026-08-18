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
  const { subtitles, loadSubtitleFile } = features;
  const inputRef = React.useRef<HTMLInputElement>(null);

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

        {!subtitles.hasSubtitles ? (
          <>
            <div className="px-2.5 py-2 text-[12px] leading-relaxed text-fg-subtle">
              No subtitles loaded. Choose an .srt or .vtt file, or just drop one
              onto the video.
            </div>
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
