import * as React from 'react';
import { Icon } from '@/components/ui/icons';
import { formatOffset } from '@/lib/format';
import { cn } from '@/lib/utils';

export type FeedbackKind = 'seek' | 'volume' | 'brightness' | 'play';

export interface FeedbackPayload {
  seek: number;
  volume: { volume: number; muted: boolean };
  brightness: number;
  play: 'play' | 'pause';
}

export interface GestureFeedbackHandle {
  trigger: <K extends FeedbackKind>(kind: K, value: FeedbackPayload[K]) => void;
}

/** Play/pause reads as a quick flash; a level needs to linger to be adjustable. */
const HOLD_MS: Record<FeedbackKind, number> = {
  play: 600,
  seek: 700,
  volume: 1000,
  brightness: 1000,
};

/**
 * Transient feedback for actions with no on-screen control behind them,
 * scroll-wheel volume, swipe seeking, clicking the picture to pause.
 *
 * Two shapes, deliberately different:
 *
 *   • **play/seek** flash once in the centre, because they are momentary events
 *     and the centre is where the eye already is.
 *   • **levels** (volume, brightness) sit against the *edge* as a vertical
 *     meter. A level is adjusted continuously over a second or two, and a panel
 *     parked in the middle of the frame during that is covering the thing being
 *     watched. Down the side it stays readable in peripheral vision and out of
 *     the way.
 *
 * Updates are imperative rather than state-driven: a scroll gesture fires far
 * faster than a render pass, and routing every intermediate value through React
 * state drops frames mid-adjustment.
 */
export const GestureFeedback = React.forwardRef<GestureFeedbackHandle>(
  function GestureFeedback(_props, ref) {
    const [state, setState] = React.useState<{
      kind: FeedbackKind;
      value: FeedbackPayload[FeedbackKind];
      key: number;
    } | null>(null);
    const timer = React.useRef<number | undefined>(undefined);
    const counter = React.useRef(0);

    React.useImperativeHandle(ref, () => ({
      trigger: (kind, value) => {
        window.clearTimeout(timer.current);
        // A level being adjusted keeps the same key so it updates in place
        // instead of restarting its entrance animation on every notch.
        const isLevel = kind === 'volume' || kind === 'brightness';
        if (!isLevel || state?.kind !== kind) counter.current += 1;
        setState({ kind, value, key: counter.current });
        timer.current = window.setTimeout(() => setState(null), HOLD_MS[kind]);
      },
    }));

    React.useEffect(() => () => window.clearTimeout(timer.current), []);

    if (!state) return null;

    const isLevel = state.kind === 'volume' || state.kind === 'brightness';
    return isLevel ? (
      <LevelMeter kind={state.kind} value={state.value} />
    ) : (
      <CenterFlash flashKey={state.key} kind={state.kind} value={state.value} />
    );
  },
);

/** Momentary events: a soft disc that fades as it expands. */
function CenterFlash({
  flashKey,
  kind,
  value,
}: {
  flashKey: number;
  kind: FeedbackKind;
  value: FeedbackPayload[FeedbackKind];
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
    >
      <div
        key={flashKey}
        className={cn(
          'flex items-center gap-2 rounded-full bg-black/55 backdrop-blur-md',
          kind === 'play' ? 'size-20 justify-center' : 'px-5 py-3',
          // Grows slightly and fades out. Reads as a ripple, not a popup.
          'animate-in fade-in-0 zoom-in-75 duration-200 ease-[var(--ease-out-quint)]',
        )}
      >
        {kind === 'play' ? (
          <Icon
            name={value === 'pause' ? 'pause' : 'play'}
            size={36}
            className="text-white"
          />
        ) : (
          <>
            <Icon
              name={(value as number) >= 0 ? 'forward' : 'rewind'}
              size={24}
              className="text-white"
            />
            <span className="text-sm font-medium tabular-nums text-white">
              {formatOffset(value as number)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** Continuous levels: a slim vertical meter pinned to the right edge. */
function LevelMeter({
  kind,
  value,
}: {
  kind: FeedbackKind;
  value: FeedbackPayload[FeedbackKind];
}) {
  const isVolume = kind === 'volume';
  const level = isVolume
    ? (value as { muted: boolean }).muted
      ? 0
      : (value as { volume: number }).volume
    : // Brightness runs 20–200%; map it onto the same 0–1 meter.
      Math.max(0, Math.min(1, ((value as number) - 20) / 180));

  const percent = Math.round(Math.max(0, level) * 100);
  /* The bar is a fixed height, so it fills at full volume and stays full while
     the number keeps climbing. Amplification is shown by the colour and the
     figure rather than by a bar that would have to shrink everything else to
     make room for it. */
  const boosted = percent > 100;
  const fill = Math.min(100, percent);

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-1/2 right-6 z-20 -translate-y-1/2',
        'flex flex-col items-center gap-3 rounded-full bg-black/55 px-2.5 py-4 backdrop-blur-md',
        'animate-in fade-in-0 slide-in-from-right-2 duration-200 ease-[var(--ease-out-quint)]',
      )}
    >
      <span
        className={cn(
          'text-[11px] font-semibold tabular-nums',
          boosted ? 'text-warning' : 'text-white/90',
        )}
      >
        {percent}
      </span>
      <div className="relative h-28 w-1 overflow-hidden rounded-full bg-white/25">
        <div
          // Only the height transitions, so dragging the level looks continuous
          // rather than stepping.
          className={cn(
            'absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-100 ease-out',
            boosted ? 'bg-warning' : 'bg-white',
          )}
          style={{ height: `${fill}%` }}
        />
      </div>
      <Icon
        name={
          isVolume
            ? level === 0
              ? 'volumeOff'
              : level < 0.5
                ? 'volumeLow'
                : 'volumeHigh'
            : 'filters'
        }
        className="size-4 text-white/90"
      />
    </div>
  );
}
