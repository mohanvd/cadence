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
import { describeTrack } from '@/lib/format';
import { useTrackState } from '@/store/playerStore';
import type { PlayerFeatures } from '@/features/usePlayerFeatures';
import type { MediaTrack } from '@/engine/types';

const SIZES = ['14px', '16px', '18px', '22px', '26px', '32px'];

/**
 * Subtitle track selection, loading, timing and styling.
 *
 * The offset control is the reason this is a menu rather than a toggle:
 * downloaded subtitles are frequently out of sync with a given release, and
 * being able to nudge them while watching is what makes them usable at all.
 *
 * The tracks inside the file are listed above the file picker, because that is
 * the order in which they should be tried. A film that was subtitled arrives
 * subtitled, and going looking on disk for something the file already holds is
 * what this menu used to require of everybody.
 */
export function SubtitleMenu({ features }: { features: PlayerFeatures }) {
  const menu = useExclusiveMenu('subtitles');
  const { subtitles, loadSubtitleFile, selectSubtitleTrack } = features;
  const { tracks } = useTrackState();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const embedded = tracks.filter((track) => track.type === 'subtitle');

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await loadSubtitleFile(file);
    // Reset so picking the same file twice still fires a change event.
    event.target.value = '';
  };

  /**
   * Choosing a track that is already loaded turns it back on rather than
   * extracting it again. Switching off and on is how anyone checks a line they
   * misread, and paying seconds of a pass over the container for it would make
   * the menu feel broken.
   */
  const pick = (track: (typeof embedded)[number]) => {
    if (subtitles.sourceId === track.id) {
      if (!subtitles.enabled) subtitles.toggle();
      return;
    }
    void selectSubtitleTrack(track);
  };

  const showing = subtitles.enabled && subtitles.hasSubtitles;

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

        <MenuLabel>Subtitles</MenuLabel>

        <MenuItem
          active={!showing}
          onSelect={() => {
            if (subtitles.enabled) subtitles.toggle();
          }}
        >
          Off
        </MenuItem>

        {embedded.map((track) => (
          <MenuItem
            key={track.id}
            active={showing && subtitles.sourceId === track.id}
            // A bitmap track is listed and cannot be chosen. Hiding it would
            // say the film has no subtitles; this says it has some Cadence
            // cannot read, which is the truth and is also what tells someone
            // to go looking for a file.
            disabled={!track.playable || subtitles.loading}
            onSelect={() => pick(track)}
            trailing={<Badges track={track} pendingId={subtitles.pendingId} />}
          >
            {describeTrack(track)}
          </MenuItem>
        ))}

        {subtitles.sourceId === 'file' && (
          <MenuItem
            active={showing}
            onSelect={() => {
              if (!subtitles.enabled) subtitles.toggle();
            }}
          >
            <span className="block max-w-[15rem] truncate">{subtitles.label}</span>
          </MenuItem>
        )}

        <MenuSeparator />

        <MenuItem onSelect={() => inputRef.current?.click()}>
          {subtitles.sourceId === 'file' ? 'Choose a different file…' : 'Load from a file…'}
        </MenuItem>

        {embedded.length === 0 && (
          <div className="px-2.5 pt-0.5 pb-1.5 text-[11px] leading-relaxed text-fg-subtle">
            This file carries no subtitles of its own. Drop an .srt or .vtt onto
            the video, or choose one above.
          </div>
        )}

        {subtitles.hasSubtitles && (
          <>
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
 * What a track is, beyond its name.
 *
 * A film routinely carries several tracks in one language, and the name alone
 * does not tell them apart: "English", "English" and "English" are a full
 * translation, the signs, and the version written for someone who cannot hear
 * the room. The container says which is which, and this is where it gets said.
 */
function Badges({ track, pendingId }: { track: MediaTrack; pendingId: string | null }) {
  // Only the row being read says so. A spinner on every row would suggest the
  // whole list was busy, when one track is.
  if (pendingId === track.id) {
    return <Icon name="loading" size={13} className="shrink-0 animate-spin text-fg-subtle" />;
  }

  const marks: string[] = [];
  if (track.hearingImpaired) marks.push('CC');
  if (track.forced) marks.push('Forced');
  // Why this one cannot be chosen, in the place the eye is already looking.
  if (!track.playable) marks.push('Image');

  if (marks.length === 0) return null;

  return (
    <span className="flex shrink-0 items-center gap-1">
      {marks.map((mark) => (
        <span
          key={mark}
          className="rounded border border-line px-1 py-px text-[10px] leading-none font-medium tracking-wide text-fg-subtle uppercase"
        >
          {mark}
        </span>
      ))}
    </span>
  );
}
