import * as React from 'react';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { useIsPaused, usePlayerActions } from '@/store/playerStore';

/**
 * The transport, in the middle of the picture, for thumbs.
 *
 * On a phone the bottom bar is where the fiddly controls go (menus, the scrub
 * bar, the timecode) and none of them is the one control used constantly. Play
 * and ±10s are, and asking for them at the bottom edge of a 6" screen means
 * either reaching or looking. Centred, they are under the thumb of whichever
 * hand is holding the phone, which is why every mobile player puts them there.
 *
 * The row itself does not take pointer events; only the three buttons do. A tap
 * on the gap between them has to reach the picture underneath, or the gesture
 * that shows and hides the chrome would be dead across the middle of the screen.
 */

function RoundButton({
  label,
  onClick,
  large = false,
  children,
}: {
  label: string;
  onClick: () => void;
  large?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        // The picture below toggles playback on click; without this a tap on
        // "forward 10" would also pause.
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'pointer-events-auto grid place-items-center rounded-full text-white',
        'bg-black/35 backdrop-blur-sm transition-transform duration-150',
        'active:scale-90 focus-visible:outline-2 focus-visible:outline-white/70',
        large ? 'size-[72px] [&_svg]:size-9' : 'size-14 [&_svg]:size-6',
      )}
    >
      {children}
    </button>
  );
}

export interface MobileTransportProps {
  visible: boolean;
  onNext?: (() => void) | undefined;
  onPrevious?: (() => void) | undefined;
  /** Toggles playback and flashes the same feedback a tap on the picture does. */
  onTogglePlay: () => void;
}

export function MobileTransport({
  visible,
  onNext,
  onPrevious,
  onTogglePlay,
}: MobileTransportProps) {
  const paused = useIsPaused();
  const { seekBy } = usePlayerActions();

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-7',
        'transition-opacity duration-200 ease-[var(--ease-out-quint)]',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {onPrevious && (
        <RoundButton label="Previous" onClick={onPrevious}>
          <Icon name="previous" />
        </RoundButton>
      )}

      <RoundButton label="Back 10 seconds" onClick={() => seekBy(-10)}>
        <Icon name="rewind" />
      </RoundButton>

      <RoundButton label={paused ? 'Play' : 'Pause'} onClick={onTogglePlay} large>
        <Icon name={paused ? 'play' : 'pause'} filled />
      </RoundButton>

      <RoundButton label="Forward 10 seconds" onClick={() => seekBy(10)}>
        <Icon name="forward" />
      </RoundButton>

      {onNext && (
        <RoundButton label="Next" onClick={onNext}>
          <Icon name="next" />
        </RoundButton>
      )}
    </div>
  );
}
