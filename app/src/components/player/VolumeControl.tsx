import * as React from 'react';
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
 * So: the badge is the control, and it lives inside the slider's own hover
 * area. It appears at the end of the track once the volume is already as high
 * as it goes, which is the moment the need for it is discovered, and once it
 * is on it shows the figure in its place. It is not left parked in the control
 * bar: among a row of transport buttons a stray number reads as another
 * control rather than as the state of the one beside it.
 */
export function VolumeControl() {
  const { volume, muted } = useVolumeState();
  const { boost, canProcessAudio } = useAudioProcessing();
  const { setVolume, setBoost, toggleMute } = usePlayerActions();
  const menu = useExclusiveMenu('boost');

  const effective = muted ? 0 : volume;
  const level = effective === 0 ? 'volumeOff' : effective < 0.5 ? 'volumeLow' : 'volumeHigh';
  const boosted = canProcessAudio && boost > 1;
  const atMax = canProcessAudio && !muted && volume > 0.99;

  /*
   * Held open by state rather than by `:hover`.
   *
   * With the CSS variant, closing the menu swapped the class that was holding
   * the area open for one conditional on hover, and the two were resolved a
   * frame apart: the slider collapsed and reappeared, which looks like a
   * glitch because it is one. The button can also stop being offered at the
   * exact moment it is pressed, and a zero-width element cannot be hovered, so
   * the pointer would find itself outside an area it had never left.
   *
   * Tracking it here means the area closes when the pointer actually leaves
   * and at no other time.
   */
  const [pointerInside, setPointerInside] = React.useState(false);
  const [focusInside, setFocusInside] = React.useState(false);
  const open = pointerInside || focusInside || menu.open;

  /*
   * Leaving is believed only after a moment. Arriving is believed at once.
   *
   * Closing the menu produces a leave and an enter in the same instant, one
   * frame apart, and the area collapsed and reopened between them: a blink,
   * every time the menu was dismissed. Rather than hunt for which layer
   * generates the phantom pair, the area simply refuses to close on anything
   * that brief. It reads better for a real departure too, since a pointer that
   * clips the corner of the track on its way past no longer snaps it shut.
   */
  const closing = React.useRef<number | null>(null);

  const holdOpen = React.useCallback(() => {
    if (closing.current !== null) {
      window.clearTimeout(closing.current);
      closing.current = null;
    }
    setPointerInside(true);
  }, []);

  const letClose = React.useCallback(() => {
    if (closing.current !== null) window.clearTimeout(closing.current);
    closing.current = window.setTimeout(() => {
      closing.current = null;
      setPointerInside(false);
    }, 180);
  }, []);

  React.useEffect(
    () => () => {
      if (closing.current !== null) window.clearTimeout(closing.current);
    },
    [],
  );

  return (
    <div
      className="flex items-center"
      onPointerEnter={holdOpen}
      onPointerLeave={letClose}
      onFocusCapture={(event) => {
        /* Keyboard focus only.
         *
         * Closing a menu hands focus back to the button that opened it, and
         * counting that as a reason to stay open reopened the area a frame
         * after a click outside had closed it: the flicker was the area
         * obeying two rules that disagreed. Focus restored after a click is
         * not `:focus-visible`; focus arrived at by tabbing is, and that is
         * exactly the case that should hold the area open. */
        const target = event.target as Element;
        if (typeof target.matches === 'function' && target.matches(':focus-visible')) {
          setFocusInside(true);
        }
      }}
      onBlurCapture={(event) => {
        // Only when focus has left the group altogether, not while it moves
        // between the slider and the button inside it.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusInside(false);
        }
      }}
    >
      <Tooltip label={muted ? 'Unmute' : 'Mute'} shortcut="M">
        <Button variant="chrome" size="icon" onClick={toggleMute} aria-label="Mute">
          <Icon name={level} />
        </Button>
      </Tooltip>

      <div
        className={cn(
          'overflow-hidden transition-[width] duration-200 ease-[var(--ease-out-quint)]',
          open ? 'w-24' : 'w-0',
        )}
      >
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
          <SliderPrimitive.Thumb className="block size-3 rounded-full bg-white shadow-[var(--shadow-control)] focus-visible:outline-2 focus-visible:outline-accent" />
        </SliderPrimitive.Root>
      </div>

      {/* Width rather than mounting, so it slides in beside the track instead
          of making the controls to its right jump sideways.
          
          It comes and goes with the slider, on or off. A permanent badge in
          the bar was tried and is clutter: the row beside it is transport, and
          a figure parked among it reads as another control rather than as the
          state of the one it belongs to. Everything about the volume lives in
          the same place and opens when that place is reached.
          
          Off, it appears only once the slider is already at its end, which is
          the moment the offer means anything. */}
      <div
        className={cn(
          'overflow-hidden transition-[max-width,opacity] duration-200 ease-[var(--ease-out-quint)]',
          open && (boosted || atMax || menu.open)
            ? 'max-w-20 opacity-100'
            : 'max-w-0 opacity-0',
        )}
      >
        <Popover {...menu}>
          <Tooltip
            label={
              boosted
                ? `Volume runs to ${Math.round(boost * 100)}%`
                : 'Let the volume go past 100%'
            }
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Volume boost"
                className={cn(
                  'mx-1 flex h-7 items-center justify-center rounded px-1.5',
                  'text-[11px] font-semibold tabular-nums transition-colors',
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
                  <Icon name="louder" size={14} />
                )}
              </button>
            </PopoverTrigger>
          </Tooltip>

          <PopoverContent className="w-64">
            <div className="px-2.5 pt-2 pb-1 text-[12px] leading-relaxed text-fg-subtle">
              Raises the top of the volume slider, without distorting. Quiet
              recordings gain the most.
            </div>
            <MenuSlider
              label="Maximum"
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
