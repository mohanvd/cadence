import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import {
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSlider,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useExclusiveMenu,
} from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { MAX_BOOST } from '@/engine/audioChain';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PlayerFeatures } from '@/features/usePlayerFeatures';
import type { MusicModeApi } from '@/features/playback/useMusicMode';
import type { VideoFitApi } from '@/features/playback/useVideoFit';
import { useBoostState, usePlayerActions } from '@/store/playerStore';
import {
  ACCENTS,
  DENSITIES,
  THEMES,
  accentSwatch,
  useAppearanceStore,
} from '@/store/appearanceStore';

type Panel = 'root' | 'video' | 'audio' | 'boost' | 'timer' | 'zoom' | 'appearance';

/**
 * The settings popover.
 *
 * Organised as a drill-down rather than one long scroll: the root lists
 * categories, and each panel replaces it in place. That keeps the surface small
 * enough to sit over video without covering the frame the user is adjusting,
 * which matters specifically because these controls change what is on screen.
 */
export interface SettingsMenuProps {
  features: PlayerFeatures;
  ambient: { enabled: boolean; toggle: () => void };
  musicMode: MusicModeApi;
  fit: VideoFitApi;
}

export function SettingsMenu({ features, ambient, musicMode, fit }: SettingsMenuProps) {
  const { open, onOpenChange } = useExclusiveMenu('settings');
  const [panel, setPanel] = React.useState<Panel>('root');
  const { boost, canBoost } = useBoostState();
  const { setBoost } = usePlayerActions();

  // Always reopen at the top level; resuming in a nested panel is disorienting.
  React.useEffect(() => {
    if (!open) setPanel('root');
  }, [open]);

  const { filters, equalizer, sleepTimer, zoomPan, abRepeat } = features;

  /*
   * The trigger carries no badge, dot, or underline for "something in here is
   * on". Every one of those reads as a notification waiting to be opened rather
   * than as state, and the row of controls stops being a row of controls.
   *
   * Nothing is lost by dropping it: each row below already states its own value
   *: "Off", "Custom", "2.0×", a countdown, so opening the menu answers the
   * question, and that is the only moment the answer is actually needed.
   */

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip label="Settings">
        <PopoverTrigger asChild>
          <Button variant="chrome" size="icon" aria-label="Settings">
            <Icon name="settings" />
          </Button>
        </PopoverTrigger>
      </Tooltip>

      <PopoverContent className="w-72">
        {panel === 'root' && (
          <>
            <MenuItem
              onSelect={() => setPanel('video')}
              trailing={<span>{filters.isDefault ? 'Off' : filters.activePreset ?? 'Custom'}</span>}
            >
              Video adjustments
            </MenuItem>
            <MenuItem
              onSelect={() => setPanel('audio')}
              trailing={
                <span>
                  {!equalizer.isEnabled
                    ? 'Off'
                    : equalizer.isFlat
                      ? 'Flat'
                      : equalizer.activePreset ?? 'Custom'}
                </span>
              }
            >
              Equalizer
            </MenuItem>
            <MenuItem
              onSelect={() => setPanel('boost')}
              trailing={
                <span>
                  {!canBoost ? 'Unavailable' : boost > 1 ? `${Math.round(boost * 100)}%` : 'Off'}
                </span>
              }
            >
              Volume boost
            </MenuItem>
            <MenuItem
              onSelect={() => setPanel('zoom')}
              trailing={<span>{zoomPan.zoom > 1 ? `${zoomPan.zoom.toFixed(1)}×` : 'Off'}</span>}
            >
              Zoom &amp; pan
            </MenuItem>
            <MenuItem
              onSelect={() => setPanel('timer')}
              trailing={<span>{sleepTimer.display ?? 'Off'}</span>}
            >
              Sleep timer
            </MenuItem>
            <MenuItem onSelect={() => setPanel('appearance')}>Appearance</MenuItem>

            <MenuSeparator />

            <MenuItem
              active={musicMode.enabled}
              onSelect={musicMode.toggle}
              // Forced on for a file with no video track, where turning it off
              // would only reveal a black rectangle.
              disabled={musicMode.forced}
              trailing={
                <span>{musicMode.forced ? 'No video' : musicMode.enabled ? 'On' : 'Off'}</span>
              }
            >
              Music mode
            </MenuItem>
            <MenuItem
              active={ambient.enabled}
              onSelect={ambient.toggle}
              trailing={<span>{ambient.enabled ? 'On' : 'Off'}</span>}
            >
              Ambient glow
            </MenuItem>
            {/* Nothing is stretched either way: this crops to the screen's
                shape or letterboxes to the film's, and says which. */}
            <MenuItem
              active={fit.fills}
              onSelect={fit.toggle}
              disabled={musicMode.enabled}
              trailing={<span>{fit.fills ? 'Filled' : 'Fitted'}</span>}
            >
              Fill the screen
            </MenuItem>
            <MenuItem
              active={features.loop}
              onSelect={features.toggleLoop}
              trailing={<span>{features.loop ? 'On' : 'Off'}</span>}
            >
              Loop file
            </MenuItem>
            <MenuItem onSelect={features.takeScreenshot}>Save frame as PNG</MenuItem>

            <MenuSeparator />
            <MenuLabel>A–B repeat</MenuLabel>
            <ABRepeatRow features={features} />
            {abRepeat.isActive && (
              <MenuItem onSelect={abRepeat.clear}>Clear A–B loop</MenuItem>
            )}
          </>
        )}

        {panel === 'video' && (
          <PanelFrame title="Video adjustments" onBack={() => setPanel('root')}>
            <div className="grid grid-cols-3 gap-1 px-1.5 pb-1">
              {filters.presets.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => filters.applyPreset(preset)}
                  className={cn(
                    'rounded-md px-1 py-1.5 text-[11px] transition-colors',
                    filters.activePreset === preset.name
                      ? 'bg-accent text-accent-fg'
                      : 'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg',
                  )}
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <MenuSeparator />
            <MenuSlider
              label="Brightness"
              value={filters.filters.brightness}
              min={20}
              max={200}
              format={(v) => `${v}%`}
              onChange={(v) => filters.updateFilter('brightness', v)}
            />
            <MenuSlider
              label="Contrast"
              value={filters.filters.contrast}
              min={20}
              max={200}
              format={(v) => `${v}%`}
              onChange={(v) => filters.updateFilter('contrast', v)}
            />
            <MenuSlider
              label="Saturation"
              value={filters.filters.saturation}
              min={0}
              max={200}
              format={(v) => `${v}%`}
              onChange={(v) => filters.updateFilter('saturation', v)}
            />
            <MenuSlider
              label="Hue"
              value={filters.filters.hue}
              min={-180}
              max={180}
              format={(v) => `${v}°`}
              onChange={(v) => filters.updateFilter('hue', v)}
            />
            <MenuSeparator />
            <MenuItem onSelect={filters.resetFilters} disabled={filters.isDefault}>
              Reset adjustments
            </MenuItem>
          </PanelFrame>
        )}

        {panel === 'boost' && (
          <PanelFrame title="Volume boost" onBack={() => setPanel('root')}>
            {canBoost ? (
              <>
                <div className="px-2.5 pb-2 text-[12px] leading-relaxed text-fg-subtle">
                  For films mastered too quietly, or speakers that will not go
                  loud enough. Peaks are held below full scale, so this cannot
                  make the sound crackle, but a film that is already loud has no
                  room to grow and will barely change.
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
              </>
            ) : (
              <div className="px-2.5 py-2 text-[12px] leading-relaxed text-fg-subtle">
                A video played straight from a link cannot be amplified. Reading
                its audio back out is what its origin forbids, and the browser
                answers by going silent rather than by refusing, so Cadence does
                not offer it here.
              </div>
            )}
          </PanelFrame>
        )}

        {panel === 'audio' && (
          <PanelFrame title="Equalizer" onBack={() => setPanel('root')}>
            {!equalizer.isEnabled && (
              <div className="px-2.5 pb-2 text-[12px] leading-relaxed text-fg-subtle">
                {/* Web Audio needs a user gesture and permanently re-routes the
                    element's output, so it is opt-in rather than always on. */}
                Enabling routes audio through the equalizer for this session.
              </div>
            )}
            <MenuItem active={equalizer.isEnabled} onSelect={equalizer.toggleEQ}>
              {equalizer.isEnabled ? 'Equalizer on' : 'Enable equalizer'}
            </MenuItem>
            <MenuSeparator />
            <div className="grid grid-cols-3 gap-1 px-1.5 pb-1">
              {equalizer.presets.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  disabled={!equalizer.isEnabled}
                  onClick={() => equalizer.applyPreset(preset)}
                  className={cn(
                    'rounded-md px-1 py-1.5 text-[11px] transition-colors disabled:opacity-40',
                    equalizer.activePreset === preset.name
                      ? 'bg-accent text-accent-fg'
                      : 'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg',
                  )}
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <MenuSeparator />
            {equalizer.bands.map((band, index) => (
              <MenuSlider
                key={band.label}
                label={`${band.label} Hz`}
                value={equalizer.gains[index] ?? 0}
                min={-12}
                max={12}
                step={0.5}
                format={(v) => `${v > 0 ? '+' : ''}${v} dB`}
                onChange={(v) => equalizer.updateGain(index, v)}
              />
            ))}
          </PanelFrame>
        )}

        {panel === 'zoom' && (
          <PanelFrame title="Zoom & pan" onBack={() => setPanel('root')}>
            <div className="px-2.5 pb-2 text-[12px] leading-relaxed text-fg-subtle">
              Zoom in to read small text on a slide, then drag the frame to move
              around it.
            </div>
            <MenuSlider
              label="Zoom"
              value={zoomPan.zoom}
              min={1}
              max={5}
              step={0.1}
              format={(v) => `${v.toFixed(1)}×`}
              onChange={zoomPan.setZoomLevel}
            />
            <MenuItem onSelect={zoomPan.resetZoom} disabled={zoomPan.zoom <= 1}>
              Reset zoom
            </MenuItem>
          </PanelFrame>
        )}

        {panel === 'appearance' && (
          <PanelFrame title="Appearance" onBack={() => setPanel('root')}>
            <AppearancePanel />
          </PanelFrame>
        )}

        {panel === 'timer' && (
          <PanelFrame title="Sleep timer" onBack={() => setPanel('root')}>
            {sleepTimer.isActive && (
              <div className="px-2.5 pb-2 text-[12px] text-fg-muted">
                Pausing in{' '}
                <span className={cn('tabular-nums', sleepTimer.isUrgent && 'text-warning')}>
                  {sleepTimer.display}
                </span>
              </div>
            )}
            {sleepTimer.options.map((option) => (
              <MenuItem key={option.label} onSelect={() => sleepTimer.start(option.ms)}>
                {option.label}
              </MenuItem>
            ))}
            {sleepTimer.isActive && (
              <>
                <MenuSeparator />
                <MenuItem onSelect={sleepTimer.clear}>Cancel timer</MenuItem>
              </>
            )}
          </PanelFrame>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PanelFrame({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-3"
      >
        <Icon name="back" size={16} />
        {title}
      </button>
      <MenuSeparator />
      <div className="max-h-[min(60vh,26rem)] overflow-y-auto scroll-slim">{children}</div>
    </div>
  );
}

/**
 * Accent, background and control size.
 *
 * Everything here writes a CSS variable on the document root, so each change is
 * visible on the player *behind* this menu the instant it is made, which is
 * the only way to choose a colour that has to sit on top of video.
 */
function AppearancePanel() {
  const { accentId, themeId, densityId, setAccent, setTheme, setDensity, reset } =
    useAppearanceStore();

  return (
    <>
      <MenuLabel>Accent</MenuLabel>
      <div className="flex flex-wrap gap-2 px-2.5 pb-2.5">
        {ACCENTS.map((accent) => (
          <button
            key={accent.id}
            type="button"
            onClick={() => setAccent(accent.id)}
            aria-label={accent.label}
            aria-pressed={accentId === accent.id}
            className={cn(
              'size-7 rounded-full transition-transform',
              'hover:scale-110',
              // The ring is drawn outside the swatch so the colour itself is
              // never overlaid by the thing indicating it is selected.
              accentId === accent.id
                ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface-1'
                : 'ring-1 ring-white/15',
            )}
            style={{ backgroundColor: accentSwatch(accent) }}
          />
        ))}
      </div>

      <MenuSeparator />
      <MenuLabel>Background</MenuLabel>
      {THEMES.map((theme) => (
        <MenuItem
          key={theme.id}
          active={themeId === theme.id}
          onSelect={() => setTheme(theme.id)}
          trailing={<span className="text-fg-subtle">{theme.hint}</span>}
        >
          {theme.label}
        </MenuItem>
      ))}

      <MenuSeparator />
      <MenuLabel>Control size</MenuLabel>
      <div className="grid grid-cols-3 gap-1 px-1.5 pb-1">
        {DENSITIES.map((density) => (
          <button
            key={density.id}
            type="button"
            onClick={() => setDensity(density.id)}
            className={cn(
              'rounded-md px-1 py-1.5 text-[11px] transition-colors',
              densityId === density.id
                ? 'bg-accent text-accent-fg'
                : 'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg',
            )}
          >
            {density.label}
          </button>
        ))}
      </div>

      <MenuSeparator />
      <MenuItem onSelect={reset}>Reset appearance</MenuItem>
      <div className="px-2.5 pt-1 pb-1 text-[12px] leading-relaxed text-fg-subtle">
        Subtitle size and backdrop live in the subtitles menu.
      </div>
    </>
  );
}

/** A/B markers, set against the live playhead. */
function ABRepeatRow({ features }: { features: PlayerFeatures }) {
  const { abRepeat, videoRef } = features;
  const now = () => videoRef.current?.currentTime ?? 0;

  return (
    <div className="flex items-center gap-1.5 px-2.5 pb-1">
      <Button
        variant={abRepeat.pointA !== null ? 'accent' : 'secondary'}
        size="sm"
        className="flex-1 tabular-nums"
        onClick={() => abRepeat.setA(now())}
      >
        A {abRepeat.pointA !== null ? formatTime(abRepeat.pointA) : ''}
      </Button>
      <Button
        variant={abRepeat.pointB !== null ? 'accent' : 'secondary'}
        size="sm"
        className="flex-1 tabular-nums"
        disabled={abRepeat.pointA === null}
        onClick={() => abRepeat.setB(now())}
      >
        B {abRepeat.pointB !== null ? formatTime(abRepeat.pointB) : ''}
      </Button>
    </div>
  );
}
