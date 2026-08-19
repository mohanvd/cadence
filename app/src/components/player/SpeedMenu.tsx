import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import {
  MenuLabel,
  MenuItem,
  MenuSeparator,
  MenuSlider,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useExclusiveMenu,
} from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { formatSpeed } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePlaybackRate, usePlayerActions } from '@/store/playerStore';

const PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

/**
 * Playback speed: an icon at normal speed, the figure at any other.
 *
 * No icon communicates "1.5×" as directly as the number, so the number is what
 * is shown while the speed is doing something. At 1× it is saying nothing, and
 * a permanent "1×" among a row of icons reads as a setting that is on. The
 * amplifier beside the volume behaves the same way, which is what makes the
 * two look like one idea rather than two.
 */
export function SpeedMenu() {
  const menu = useExclusiveMenu('speed');
  const rate = usePlaybackRate();
  const { setRate } = usePlayerActions();
  const isDefault = Math.abs(rate - 1) < 0.01;

  return (
    <Popover {...menu}>
      <Tooltip label="Playback speed" shortcut="Shift + .">
        <PopoverTrigger asChild>
          <Button
            variant="chrome"
            size={isDefault ? 'icon' : 'chip'}
            // No colour: "2.5×" already says the speed. Tinting it as well is
            // saying the same thing twice, louder.
            className={cn(!isDefault && 'tabular-nums font-bold text-white')}
            aria-label="Playback speed"
          >
            {isDefault ? <Icon name="speed" /> : formatSpeed(rate)}
          </Button>
        </PopoverTrigger>
      </Tooltip>

      <PopoverContent className="w-52">
        <MenuLabel>Speed</MenuLabel>
        {PRESETS.map((preset) => (
          <MenuItem
            key={preset}
            active={Math.abs(rate - preset) < 0.01}
            onSelect={() => setRate(preset)}
          >
            {preset === 1 ? 'Normal' : formatSpeed(preset)}
          </MenuItem>
        ))}
        <MenuSeparator />
        {/* Fine control for the gaps between presets: some lecturers sit
            right between 1.5 and 1.75. */}
        <MenuSlider
          label="Fine"
          value={rate}
          min={0.25}
          max={4}
          step={0.05}
          format={formatSpeed}
          onChange={setRate}
        />
      </PopoverContent>
    </Popover>
  );
}
