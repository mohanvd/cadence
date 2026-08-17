import * as React from 'react';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useThumbnailPreview } from '@/features/playback/useThumbnailPreview';
import {
  useBuffered,
  useCurrentTime,
  useDuration,
  usePlayerActions,
} from '@/store/playerStore';

/**
 * The scrub bar.
 *
 * Built by hand rather than on a generic slider because a video timeline has
 * behaviour a slider does not: a buffered range underneath the fill, a hover
 * readout that tracks the cursor independently of the value, and, most
 * importantly, the value must stop following the store while the user drags.
 * Without that last detail the thumb fights the playhead on every frame and
 * scrubbing feels broken.
 */
export interface TimelineProps {
  /** Times, in seconds, to mark on the track. */
  markers?: readonly number[];
  /**
   * Size the bar for a finger.
   *
   * Every affordance here is currently spent on hover, the track thickens, the
   * thumb grows out of nothing, and a finger triggers none of it. On touch the
   * bar is simply drawn at its hovered size permanently, with a taller invisible
   * hit area around it, because there is no state in which it should be thinner.
   */
  touch?: boolean;
}

/** Kept in step with `THUMB_WIDTH` in `useThumbnailPreview`. */
const THUMB_WIDTH = 168;
const THUMB_HALF = THUMB_WIDTH / 2;

export function Timeline({ markers = [], touch = false }: TimelineProps) {
  const currentTime = useCurrentTime();
  const duration = useDuration();
  const buffered = useBuffered();
  const { seek, pause, play } = usePlayerActions();

  const trackRef = React.useRef<HTMLDivElement>(null);
  const [dragTime, setDragTime] = React.useState<number | null>(null);
  const [hoverTime, setHoverTime] = React.useState<number | null>(null);
  const resumeAfterDrag = React.useRef(false);
  const preview = useThumbnailPreview();

  // While dragging, the thumb follows the pointer, not the engine.
  const displayTime = dragTime ?? currentTime;
  const percent = duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  const timeFromClientX = React.useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      return Math.max(0, Math.min(1, ratio)) * duration;
    },
    [duration],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    // Pausing during the drag stops the decoder thrashing on every intermediate
    // position; playback resumes on release if it was running.
    resumeAfterDrag.current = !document.querySelector('video')?.paused;
    if (resumeAfterDrag.current) pause();

    const time = timeFromClientX(event.clientX);
    setDragTime(time);
    seek(time);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const time = timeFromClientX(event.clientX);
    setHoverTime(time);
    preview.request(time);
    if (dragTime === null) return;
    setDragTime(time);
    seek(time);
  };

  const handlePointerLeave = () => {
    setHoverTime(null);
    preview.request(null);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragTime === null) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    seek(dragTime);
    setDragTime(null);
    if (resumeAfterDrag.current) {
      resumeAfterDrag.current = false;
      play();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 60 : 5;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seek(Math.max(0, currentTime - step));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      seek(Math.min(duration, currentTime + step));
    } else if (event.key === 'Home') {
      event.preventDefault();
      seek(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      seek(duration);
    }
  };

  const readoutTime = hoverTime ?? dragTime;

  return (
    <div
      className={cn('group/timeline relative w-full select-none', touch ? 'py-3' : 'py-2')}
    >
      {readoutTime !== null && duration > 0 && (
        <div
          className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2"
          style={{
            /* Clamped so the readout never escapes the track at either end.
               The margin widens once a thumbnail is showing, because the thing
               being kept on screen is no longer just a timecode. */
            left: preview.ready
              ? `clamp(${THUMB_HALF}px, ${(readoutTime / duration) * 100}%, calc(100% - ${THUMB_HALF}px))`
              : `clamp(28px, ${(readoutTime / duration) * 100}%, calc(100% - 28px))`,
          }}
        >
          {preview.ready && (
            <div
              className="mb-1.5 overflow-hidden rounded-lg bg-black shadow-[var(--shadow-panel)] ring-1 ring-white/15"
              // Sized up front from the source's aspect ratio so the panel does
              // not jump the moment the first frame decodes.
              style={{ width: THUMB_WIDTH, height: preview.height }}
            >
              {preview.frame && (
                <img
                  src={preview.frame}
                  alt=""
                  className="size-full object-cover"
                  draggable={false}
                />
              )}
            </div>
          )}

          {/* Same face and figures as the rest of the chrome, `tabular-nums`
              already stops the digits shifting, so a mono font would only make
              this one readout look borrowed from somewhere else. */}
          <div
            className={cn(
              'rounded-md bg-black/85 px-2 py-1 text-xs font-medium tabular-nums text-white ring-1 ring-white/10',
              preview.ready
                ? 'mx-auto w-fit'
                : 'shadow-[var(--shadow-panel)]',
            )}
          >
            {formatTime(readoutTime, duration)}
          </div>
        </div>
      )}

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(displayTime)}
        aria-valuetext={`${formatTime(displayTime, duration)} of ${formatTime(duration, duration)}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative flex w-full cursor-pointer items-center rounded-full',
          // A finger needs the whole strip, and the browser must not read a
          // drag along it as a page gesture.
          touch ? 'h-6 touch-none' : 'h-4',
          // The global focus ring is a 2px outline, drawn around an element
          // this wide it reads as a box around the whole player. The track and
          // thumb below expand on focus instead, which shows the same thing
          // without the frame.
          'outline-none',
          duration <= 0 && 'pointer-events-none opacity-50',
        )}
      >
        {/* The bar thickens on hover, a bigger hit target than it looks. */}
        <div
          className={cn(
            'relative w-full overflow-hidden rounded-full bg-white/20 transition-[height] duration-150 ease-[var(--ease-out-quint)]',
            touch ? 'h-[6px]' : 'h-[4px]',
            'group-hover/timeline:h-[6px] group-focus-visible/timeline:h-[6px]',
            dragTime !== null && 'h-[6px]',
          )}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/30"
            style={{ width: `${bufferedPercent}%` }}
          />
          {/* White, not the accent colour: the bar sits on top of arbitrary
              video, and a saturated hue clashes with whatever is behind it.
              White reads cleanly against every frame. */}
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full bg-white',
              dragTime === null && 'transition-[width] duration-100 ease-linear',
            )}
            style={{ width: `${percent}%` }}
          />

          {/* Bookmarks, drawn inside the track so they are clipped by its
              rounded ends rather than floating past them. */}
          {duration > 0 &&
            markers.map((time) => (
              <span
                key={time}
                aria-hidden
                className="absolute top-1/2 size-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-1 ring-black/40"
                style={{ left: `${Math.min(100, (time / duration) * 100)}%` }}
              />
            ))}
        </div>

        <div
          className={cn(
            'pointer-events-none absolute -translate-x-1/2 rounded-full bg-white shadow-[var(--shadow-control)]',
            touch ? 'size-4 scale-100' : 'size-3.5 scale-0',
            'transition-transform duration-150 ease-[var(--ease-out-quint)]',
            'group-hover/timeline:scale-100 group-focus-visible/timeline:scale-100',
            dragTime !== null && 'scale-115',
          )}
          style={{ left: `${percent}%` }}
        />
      </div>
    </div>
  );
}
