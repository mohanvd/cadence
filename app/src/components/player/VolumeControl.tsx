import * as SliderPrimitive from '@radix-ui/react-slider';
import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { usePlayerActions, useVolumeState } from '@/store/playerStore';

/**
 * Mute toggle with a slider that expands on hover.
 *
 * Collapsed by default so the control bar stays uncluttered; the slider only
 * takes horizontal space once the user shows intent.
 */
export function VolumeControl() {
  const { volume, muted } = useVolumeState();
  const { setVolume, toggleMute } = usePlayerActions();

  const effective = muted ? 0 : volume;
  const Icon = effective === 0 ? VolumeX : effective < 0.5 ? Volume1 : Volume2;

  return (
    <div className="group/volume flex items-center">
      <Tooltip label={muted ? 'Unmute' : 'Mute'} shortcut="M">
        <Button variant="chrome" size="icon" onClick={toggleMute} aria-label="Mute">
          <Icon />
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
    </div>
  );
}
