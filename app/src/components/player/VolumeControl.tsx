import * as SliderPrimitive from '@radix-ui/react-slider';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import {
  MenuSlider,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useExclusiveMenu,
} from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { MAX_BOOST } from '@/engine/audioChain';
import { cn } from '@/lib/utils';
import { useAudioProcessing, usePlayerActions, useVolumeState } from '@/store/playerStore';

/**
 * Mute toggle, volume, and the amplifier that lives at the end of it.
 *
 * Volume and boost look like one thing and are not. Volume is adjusted
 * constantly; boost is a property of a quiet film or a laptop that will not go
 * loud enough, set once and left alone. Two earlier attempts got this wrong in
 * opposite directions, and both are worth recording because the failures are
 * what the shape below is made of.
 *
 * Running the slider to 300% put them on one scale, which squeezed the range
 * used constantly into the first third of the track: every ordinary volume
 * change paid for a rare one. It is also wrong in principle, because lowering
 * the volume would then switch the amplifier off, and someone who needs it
 * needs it for every film.
 *
 * Moving the amplifier to the settings menu and leaving a badge here split the
 * indicator from the control: the badge said something was happening and did
 * nothing when pressed, and the thing it described was two menus away.
 *
 * So: the badge is the control. It appears at the end of the volume slider at
 * the moment the need is discovered, which is the moment the volume is already
 * as high as it goes and the film is still too quiet, and it stays visible
 * while it is on, because a sound being altered should never be silent about
 * it.
 */
export function VolumeControl() {
  const { volume, muted } = useVolumeState();
  const { boost, canProcessAudio } = useAudioProcessing();
  const { setVolume, setBoost, toggleMute } = usePlayerActions();
  const menu = useExclusiveMenu('boost');

  const effective = muted ? 0 : volume;
  const level = effective === 0 ? 'volumeOff' : effective < 0.5 ? 'volumeLow' : 'volumeHigh';
  const boosted = canProcessAudio && boost > 1;
  /* Offered at the top of the range and whenever it is already on. Anywhere
     else it is an answer to a question nobody is asking. */
  const offered = canProcessAudio && (boosted || (!muted && volume > 0.99));

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

      {/* Width rather than mounting, so it slides in beside the track instead
          of making the controls to its right jump sideways. */}
      <div
        className={cn(
          'overflow-hidden transition-[width,opacity] duration-200 ease-[var(--ease-out-quint)]',
          offered ? 'w-9 opacity-100' : 'w-0 opacity-0',
        )}
      >
        <Popover {...menu}>
          <Tooltip label={boosted ? `Boosted to ${Math.round(boost * 100)}%` : 'Louder than 100%'}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Volume boost"
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums transition-colors',
                  boosted
                    ? 'text-warning hover:bg-white/10'
                    : 'text-fg-subtle hover:bg-white/10 hover:text-fg',
                )}
              >
                {/* A drawn plus rather than a typed one: every other mark on
                    this bar is a Lucide glyph on the same grid and stroke, and
                    a text character next to them reads as a different set. */}
                {boosted ? (
                  `${boost.toFixed(boost % 1 === 0 ? 0 : 1)}×`
                ) : (
                  <Icon name="louder" size={14} className="mx-auto" />
                )}
              </button>
            </PopoverTrigger>
          </Tooltip>

          <PopoverContent className="w-64">
            <div className="px-2.5 pt-2 pb-1 text-[12px] leading-relaxed text-fg-subtle">
              Louder than the system allows, without distorting. Quiet
              recordings gain the most.
            </div>
            <MenuSlider
              label="Boost"
              value={Math.round(boost * 100)}
              min={100}
              max={MAX_BOOST * 100}
              step={10}
              format={(v) => (v === 100 ? 'Off' : `${v}%`)}
              onChange={(v) => setBoost(v / 100)}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
