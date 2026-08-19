import * as SliderPrimitive from '@radix-ui/react-slider';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { Tooltip } from '@/components/ui/tooltip';
import { MAX_BOOST } from '@/engine/audioBoost';
import { cn } from '@/lib/utils';
import { usePlayerActions, useVolumeState } from '@/store/playerStore';

/**
 * Mute toggle with a slider that expands on hover.
 *
 * Collapsed by default so the control bar stays uncluttered; the slider only
 * takes horizontal space once the user shows intent.
 *
 * The track runs past full volume into amplification, because the gesture
 * people make when a film is too quiet is to drag the volume to the end and
 * keep pulling. Making that reach a real amplifier is more use than a separate
 * control somewhere else that they would have to know about first. The part
 * past full is drawn in a different colour: it is doing something to the
 * sound, and it should not look like more of the same.
 */
export function VolumeControl() {
  const { volume, muted, canBoost } = useVolumeState();
  const { setVolume, toggleMute } = usePlayerActions();

  const effective = muted ? 0 : volume;
  const level = effective === 0 ? 'volumeOff' : effective < 0.5 ? 'volumeLow' : 'volumeHigh';
  const max = canBoost ? MAX_BOOST : 1;
  const boosted = effective > 1;
  /* Where full volume sits along a track that extends past it, as a
     percentage, so the marker and the colour change agree without either
     hard-coding the maximum. */
  const fullAt = (1 / max) * 100;

  return (
    <div className="group/volume flex items-center">
      <Tooltip label={muted ? 'Unmute' : 'Mute'} shortcut="M">
        <Button variant="chrome" size="icon" onClick={toggleMute} aria-label="Mute">
          <Icon name={level} />
        </Button>
      </Tooltip>

      <div className="flex items-center overflow-hidden">
        <div className="w-0 overflow-hidden transition-[width] duration-200 ease-[var(--ease-out-quint)] group-hover/volume:w-24 group-focus-within/volume:w-24">
          <SliderPrimitive.Root
            className="relative flex h-9 w-24 touch-none items-center px-2"
            value={[effective * 100]}
            max={max * 100}
            step={1}
            aria-label="Volume"
            aria-valuetext={
              boosted
                ? `${Math.round(effective * 100)} percent, amplified`
                : `${Math.round(effective * 100)} percent`
            }
            onValueChange={([next]) => setVolume((next ?? 0) / 100)}
          >
            <SliderPrimitive.Track className="relative h-[3px] w-full grow overflow-hidden rounded-full bg-white/25">
              <SliderPrimitive.Range
                className={cn('absolute h-full', boosted ? 'bg-warning' : 'bg-white')}
              />
              {/* Full volume, marked on the track so the boundary is visible
                  before it is crossed rather than only after. */}
              {canBoost && (
                <span
                  aria-hidden
                  className="absolute top-0 h-full w-px bg-black/50"
                  style={{ left: `${fullAt}%` }}
                />
              )}
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb
              className={cn(
                'block size-3 rounded-full shadow-[var(--shadow-control)] transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-accent',
                boosted ? 'bg-warning' : 'bg-white',
              )}
            />
          </SliderPrimitive.Root>
        </div>

        {/* Only while amplifying. A percentage next to every ordinary volume
            change is noise; one that appears when the sound is being altered
            is the reason it is there. */}
        {boosted && (
          <span className="pr-1 text-[11px] font-medium tabular-nums text-warning">
            {Math.round(effective * 100)}%
          </span>
        )}
      </div>
    </div>
  );
}
