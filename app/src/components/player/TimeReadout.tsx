import * as React from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  useCurrentTime,
  useDuration,
  usePlaybackRate,
} from '@/store/playerStore';
import { loadTimeDisplayMode, saveTimeDisplayMode } from '@/utils/storage';

type Mode = 'elapsed' | 'remaining';

/**
 * The timecode, split out so the 60fps `currentTime` updates re-render two text
 * nodes rather than the whole control bar.
 *
 * Clicking swaps elapsed for remaining. The remaining figure is divided by the
 * playback rate, so at 1.5× it answers the question actually being asked,
 * "how much longer do I have to sit here", rather than how much media is left.
 * That distinction is the whole point of the readout for anyone studying.
 *
 * Set in the UI sans face; `tabular-nums` already fixes the digit widths, so a
 * mono font would only make this look borrowed from another interface.
 */
export function TimeReadout() {
  const currentTime = useCurrentTime();
  const duration = useDuration();
  const rate = usePlaybackRate();
  const [mode, setMode] = React.useState<Mode>(() => loadTimeDisplayMode());

  const toggle = React.useCallback(() => {
    setMode((prev) => {
      const next: Mode = prev === 'elapsed' ? 'remaining' : 'elapsed';
      saveTimeDisplayMode(next);
      return next;
    });
  }, []);

  const remaining = Math.max(0, duration - currentTime);
  const adjusted = rate > 0 ? remaining / rate : remaining;
  const rateAdjusted = Math.abs(rate - 1) > 0.01;

  const label =
    mode === 'elapsed'
      ? 'Show time remaining'
      : rateAdjusted
        ? `Time left at ${rate}×, click for elapsed`
        : 'Show elapsed time';

  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className={cn(
          'flex items-baseline gap-1.5 rounded-md px-1.5 py-1 tabular-nums select-none',
          'transition-colors hover:bg-white/10 focus-visible:bg-white/10',
          'focus-visible:outline-none',
        )}
      >
        {mode === 'elapsed' ? (
          <>
            <span className="text-[15px] font-medium text-white">
              {formatTime(currentTime, duration)}
            </span>
            <span className="text-[13px] text-white/45">
              / {formatTime(duration, duration)}
            </span>
          </>
        ) : (
          <>
            <span className="text-[15px] font-medium text-white">
              −{formatTime(adjusted, duration)}
            </span>
            {rateAdjusted && (
              <span className="text-[13px] text-white/45">at {rate}×</span>
            )}
          </>
        )}
      </button>
    </Tooltip>
  );
}
