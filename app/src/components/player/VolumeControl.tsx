import * as SliderPrimitive from '@radix-ui/react-slider';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { Tooltip } from '@/components/ui/tooltip';
import { usePlayerActions, useVolumeState } from '@/store/playerStore';

/**
 * Mute toggle with a slider that expands on hover.
 *
 * Collapsed by default so the control bar stays uncluttered; the slider only
 * takes horizontal space once the user shows intent.
 *
 * The track is full volume end to end, and amplification is not on it. Putting
 * both on one slider was tried and is wrong: it squeezes the range used
 * constantly into the first third of the track to make room for one that is
 * set once, so every ordinary volume change pays for a rare one. The
 * amplification lives in the settings menu; all that appears here is a badge
 * saying it is on, because a sound being altered should never be invisible
 * from the place the sound is controlled.
 */
export function VolumeControl() {
  const { volume, muted, boost } = useVolumeState();
  const { setVolume, toggleMute } = usePlayerActions();

  const effective = muted ? 0 : volume;
  const level = effective === 0 ? 'volumeOff' : effective < 0.5 ? 'volumeLow' : 'volumeHigh';

  return (
    <div className="group/volume flex items-center">
      <Tooltip label={muted ? 'Unmute' : 'Mute'} shortcut="M">
        <Button variant="chrome" size="icon" onClick={toggleMute} aria-label="Mute">
          <Icon name={level} />
        </Button>
      </Tooltip>

      <div className="w-0 overflow-hidden transition-[width] duration-200 ease-[var(--ease-out-quint)] group-hover/volume:w-24 group-focus-within/volume:w-24">
        <SliderPrimitive.Root
          className="relative flex h-9 w-24 touch-none items-center px-2"
          value={[effective * 100]}
          max={100}
          step={1}
          aria-label="Volume"
          onValueChange={([next]) => setVolume((next ?? 0) / 100)}
        >
          <SliderPrimitive.Track className="relative h-[3px] w-full grow overflow-hidden rounded-full bg-white/25">
            <SliderPrimitive.Range className="absolute h-full bg-white" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="block size-3 rounded-full bg-white shadow-[var(--shadow-control)] transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-accent" />
        </SliderPrimitive.Root>
      </div>

      {boost > 1 && (
        <span
          className="ml-0.5 rounded px-1 text-[10px] font-semibold tabular-nums text-warning"
          title={`Volume boosted to ${Math.round(boost * 100)}%`}
        >
          {boost.toFixed(boost % 1 === 0 ? 0 : 1)}×
        </span>
      )}
    </div>
  );
}
