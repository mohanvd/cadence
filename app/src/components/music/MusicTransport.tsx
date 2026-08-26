import * as React from 'react';
import { Icon } from '@/components/ui/icons';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/format';
import type { Song } from '@/store/libraryStore';
import {
  useCurrentTime,
  useDuration,
  useIsPaused,
  usePlayerActions,
  usePlayerStore,
} from '@/store/playerStore';
import { useQueueControls } from '@/store/queueStore';
import { Artwork } from './Artwork';

/**
 * The bar along the bottom while music is playing. One bar, two sizes.
 *
 * The same component whether the sleeve is filling the screen or the library
 * is, and that is the whole point of it existing rather than there being a
 * transport in the player and a second one in a mini bar. Two bars that do the
 * same job drift: the buttons end up in different orders, one grows a control
 * the other never gets, and the thing you learned in one place stops being
 * true in the other. Collapsing the player should move nothing.
 *
 * Three columns, and they are laid out by grid rather than by flex on purpose.
 * The transport is centred *in the window*, not in whatever space the title
 * happens to leave it, so a long song name does not push play out of the
 * middle, which is the difference between a row of controls and a row of
 * controls that moves while you use it.
 */
export interface MusicTransportProps {
  /** The track playing, for the sleeve. Null draws the placeholder. */
  path: string | null;
  /** The file's name, for when there are no tags to do better. */
  title: string;
  /** What the file says it is, once that has been read. */
  song: Song | null;
  /** Whether the sleeve is currently filling the screen. */
  expanded: boolean;
  onToggleExpand: () => void;
  onNext?: (() => void) | undefined;
  onPrevious?: (() => void) | undefined;
  /**
   * Controls only the expanded player can offer.
   *
   * The settings menu needs the player's own feature state, which exists only
   * while the player is mounted with a file open. Rather than have this
   * component reach for something that may not be there, whoever has it passes
   * it in.
   */
  extra?: React.ReactNode;
}

export function MusicTransport({
  path,
  title,
  song,
  expanded,
  onToggleExpand,
  onNext,
  onPrevious,
  extra,
}: MusicTransportProps) {
  const paused = useIsPaused();
  const { togglePlay } = usePlayerActions();
  const { shuffle, repeat, toggleShuffle, cycleRepeat } = useQueueControls();

  const heading = song?.title ?? title.replace(/\.[^.]+$/, '');
  const byline = [song?.artist, song?.album].filter(Boolean).join(' · ');

  const repeatLabel =
    repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat this track';

  return (
    <div className="music-bar">
      {/* What is playing. The click target is the whole block, because after
          the play button this is the thing people aim at most, and a chevron
          on its own is a four-millimetre target for the commonest action. */}
      <button
        type="button"
        onClick={onToggleExpand}
        aria-label={expanded ? 'Put the player away' : 'Open the player'}
        className="group flex min-w-0 items-center gap-3 rounded-[10px] p-1.5 text-left hover:bg-white/5 focus-visible:outline-none"
      >
        <Artwork path={path} width={128} className="size-12 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-fg">{heading}</span>
          {byline && <span className="block truncate text-[12px] text-fg-subtle">{byline}</span>}
        </span>
        <Icon
          name={expanded ? 'forwardArrow' : 'back'}
          size={14}
          className={cn(
            'ml-1 shrink-0 rotate-90 text-fg-subtle opacity-0 transition-opacity',
            'group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
        />
      </button>

      {/* The transport, centred in the window. */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1">
          <BarButton
            label={shuffle ? 'Shuffle on' : 'Shuffle'}
            icon="shuffle"
            onClick={toggleShuffle}
            active={shuffle}
          />
          <BarButton label="Previous" icon="previous" onClick={onPrevious} />
          <Tooltip label={paused ? 'Play' : 'Pause'} shortcut="Space">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={paused ? 'Play' : 'Pause'}
              className="mx-1.5 flex size-9 items-center justify-center rounded-full bg-fg text-[color:var(--color-base)] transition-colors duration-150 hover:bg-white"
            >
              {/* Keyed so the glyph is replaced rather than reused, which is
                  what lets it animate in on every toggle. */}
              <Icon
                key={paused ? 'play' : 'pause'}
                name={paused ? 'play' : 'pause'}
                size={16}
                className="animate-in fade-in-0 zoom-in-75 duration-150"
              />
            </button>
          </Tooltip>
          <BarButton label="Next" icon="next" onClick={onNext} />
          <BarButton
            label={repeatLabel}
            icon={repeat === 'one' ? 'repeatOne' : 'repeat'}
            onClick={cycleRepeat}
            active={repeat !== 'off'}
          />
        </div>

        <SeekBar />
      </div>

      <div className="flex items-center justify-end gap-1">
        {extra}
        <VolumeSlider />
        <Tooltip label={expanded ? 'Put the player away' : 'Open the player'}>
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? 'Put the player away' : 'Open the player'}
            className="flex size-8 items-center justify-center rounded-[8px] text-fg-muted transition-colors hover:bg-white/8 hover:text-fg"
          >
            <Icon name={expanded ? 'exitFullscreen' : 'fullscreen'} size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

/**
 * The scrub bar for a track.
 *
 * Its own rather than the film timeline, which carries a thumbnail preview, a
 * buffered range and bookmark markers, three things that mean nothing over
 * audio and one of which starts an FFmpeg process per hover. What is left is
 * the part that matters: where you are, how long it is, and the ability to go
 * somewhere else.
 */
function SeekBar() {
  const currentTime = useCurrentTime();
  const duration = useDuration();
  const { seek, pause, play } = usePlayerActions();

  const trackRef = React.useRef<HTMLDivElement>(null);
  const [dragTime, setDragTime] = React.useState<number | null>(null);
  const resume = React.useRef(false);

  const shown = dragTime ?? currentTime;
  const percent = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0;

  const timeAt = React.useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
    },
    [duration],
  );

  return (
    <div className="flex w-full items-center gap-2.5">
      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-fg-subtle">
        {formatTime(shown, duration)}
      </span>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={`${formatTime(shown, duration)} of ${formatTime(duration, duration)}`}
        onPointerDown={(event) => {
          if (duration <= 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          // Pausing through the drag stops the decoder chasing every
          // intermediate position; it resumes on release if it was running.
          resume.current = !usePlayerStore.getState().paused;
          if (resume.current) pause();
          const time = timeAt(event.clientX);
          setDragTime(time);
          seek(time);
        }}
        onPointerMove={(event) => {
          if (dragTime === null || duration <= 0) return;
          const time = timeAt(event.clientX);
          setDragTime(time);
          seek(time);
        }}
        onPointerUp={(event) => {
          if (dragTime === null) return;
          event.currentTarget.releasePointerCapture(event.pointerId);
          seek(dragTime);
          setDragTime(null);
          if (resume.current) {
            resume.current = false;
            play();
          }
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 30 : 5;
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            seek(Math.max(0, currentTime - step));
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            seek(Math.min(duration, currentTime + step));
          }
        }}
        className={cn(
          'group/seek relative flex h-3 w-full max-w-[36rem] min-w-0 flex-1 cursor-pointer items-center outline-none',
          duration <= 0 && 'pointer-events-none opacity-40',
        )}
      >
        <div className="relative h-[3px] w-full overflow-visible rounded-full bg-white/15">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-fg transition-[width] duration-100 ease-linear group-hover/seek:bg-accent group-focus-visible/seek:bg-accent"
            style={{ width: `${percent}%` }}
          />
          {/* The handle appears on hover and while dragging. A dot that is
              always there reads as decoration on a bar this thin. */}
          <div
            className={cn(
              'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg opacity-0 transition-opacity',
              'group-hover/seek:opacity-100 group-focus-visible/seek:opacity-100',
              dragTime !== null && 'opacity-100',
            )}
            style={{ left: `${percent}%` }}
          />
        </div>
      </div>

      <span className="w-10 shrink-0 text-[11px] tabular-nums text-fg-subtle">
        {duration > 0 && Number.isFinite(duration) ? formatTime(duration, duration) : '--:--'}
      </span>
    </div>
  );
}

function BarButton({
  label,
  icon,
  onClick,
  active = false,
}: {
  label: string;
  icon: 'shuffle' | 'previous' | 'next' | 'repeat' | 'repeatOne';
  onClick?: (() => void) | undefined;
  active?: boolean;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          'flex size-8 items-center justify-center rounded-[8px] text-fg-muted transition-colors',
          'hover:bg-white/8 hover:text-fg disabled:pointer-events-none disabled:opacity-25',
          active && 'text-accent hover:text-accent',
        )}
      >
        <Icon name={icon} size={16} />
      </button>
    </Tooltip>
  );
}

/**
 * Volume, along the bar rather than out of it.
 *
 * The flyout this replaces was a second surface to open, aim at and dismiss
 * for a control that is one number. Laid flat beside the other controls it is
 * always visible, always says where it is, and takes one drag.
 *
 * The mute button is the same control at its two ends: pressing it goes to
 * silence and back to where the slider was, which is what everybody expects
 * from a speaker glyph and what a slider dragged to zero cannot offer.
 */
function VolumeSlider() {
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);

  const shown = muted ? 0 : volume;
  const percent = Math.round(shown * 100);

  const trackRef = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const levelAt = React.useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const glyph = muted || volume === 0 ? 'volumeOff' : volume < 0.5 ? 'volumeLow' : 'volumeHigh';

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip label={muted ? 'Unmute' : 'Mute'} shortcut="M">
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="flex size-8 items-center justify-center rounded-[8px] text-fg-muted transition-colors hover:bg-white/8 hover:text-fg"
        >
          <Icon name={glyph} size={16} />
        </button>
      </Tooltip>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}%`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          setVolume(levelAt(event.clientX));
        }}
        onPointerMove={(event) => {
          if (dragging) setVolume(levelAt(event.clientX));
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          setDragging(false);
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.1 : 0.05;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault();
            setVolume(shown - step);
          } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault();
            setVolume(shown + step);
          }
        }}
        className="group/vol flex h-6 w-24 cursor-pointer items-center outline-none"
      >
        <div className="relative h-[3px] w-full rounded-full bg-white/15">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-fg group-hover/vol:bg-accent group-focus-visible/vol:bg-accent"
            style={{ width: `${percent}%` }}
          />
          <div
            className={cn(
              'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg opacity-0 transition-opacity',
              'group-hover/vol:opacity-100 group-focus-visible/vol:opacity-100',
              dragging && 'opacity-100',
            )}
            style={{ left: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
