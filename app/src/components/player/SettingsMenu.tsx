import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { Mark } from '@/components/ui/mark';
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
import { useDiscordStore } from '@/store/discordStore';
import { discordStatus } from '@/lib/desktop';
import { cn } from '@/lib/utils';
import { useViewStore } from '@/store/viewStore';
import type { PlayerFeatures } from '@/features/usePlayerFeatures';
import type { MusicModeApi } from '@/features/playback/useMusicMode';
import type { VideoFitApi } from '@/features/playback/useVideoFit';
import { useAudioProcessing } from '@/store/playerStore';
import {
  ACCENTS,
  DENSITIES,
  THEMES,
  accentSwatch,
  useAppearanceStore,
} from '@/store/appearanceStore';

type Panel = 'root' | 'video' | 'audio' | 'timer' | 'zoom' | 'appearance' | 'discord';

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
  /**
   * Whether this file is music, in which case half of this menu is about
   * something that is not on screen.
   *
   * The rows below are not disabled for music, they are absent. A disabled
   * control is a promise that it would do something under other
   * circumstances, and "brightness" over an album is not a setting waiting for
   * the right moment, it is a setting about a different kind of file. What is
   * left is everything that is genuinely about sound, and it becomes the whole
   * menu rather than one row in a list of picture controls.
   */
  music: boolean;
}

export function SettingsMenu({ features, ambient, musicMode, fit, music }: SettingsMenuProps) {
  const { open, onOpenChange } = useExclusiveMenu('settings');
  const [panel, setPanel] = React.useState<Panel>('root');
  const discord = useDiscordStore();
  const { canProcessAudio } = useAudioProcessing();

  // Always reopen at the top level; resuming in a nested panel is disorienting.
  React.useEffect(() => {
    if (!open) setPanel('root');
  }, [open]);

  const { filters, equalizer, sleepTimer, zoomPan } = features;

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
            {!music && (
              <MenuItem
                onSelect={() => setPanel('video')}
                trailing={
                  <span>{filters.isDefault ? 'Off' : (filters.activePreset ?? 'Custom')}</span>
                }
              >
                Video adjustments
              </MenuItem>
            )}
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
            {!music && (
              <MenuItem
                onSelect={() => setPanel('zoom')}
                trailing={<span>{zoomPan.zoom > 1 ? `${zoomPan.zoom.toFixed(1)}×` : 'Off'}</span>}
              >
                Zoom &amp; pan
              </MenuItem>
            )}
            <MenuItem
              onSelect={() => setPanel('timer')}
              trailing={<span>{sleepTimer.display ?? 'Off'}</span>}
            >
              Sleep timer
            </MenuItem>
            <MenuItem onSelect={() => setPanel('appearance')}>Appearance</MenuItem>
            <MenuItem
              onSelect={() => setPanel('discord')}
              trailing={<span>{discord.enabled ? 'On' : 'Off'}</span>}
            >
              Discord
            </MenuItem>

            <MenuSeparator />

            {/* Everything from here down is about a picture. For a file that
                has none, the separator above is the end of the menu. */}
            {!music && (
              <>
                <MenuItem
                  active={musicMode.enabled}
                  onSelect={musicMode.toggle}
                  // Forced on for a file with no video track, where turning it
                  // off would only reveal a black rectangle.
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
              </>
            )}

            <MenuItem
              active={features.loop}
              onSelect={features.toggleLoop}
              trailing={<span>{features.loop ? 'On' : 'Off'}</span>}
            >
              {music ? 'Loop this track' : 'Loop file'}
            </MenuItem>
            {!music && (
              <MenuItem onSelect={features.takeScreenshot}>Save frame as PNG</MenuItem>
            )}

            <MenuSeparator />
            {/* Everything else, and everything above, in full. */}
            <MenuItem
              onSelect={() => {
                onOpenChange(false);
                useViewStore.getState().go({ settings: true });
              }}
              trailing={<span>Ctrl+,</span>}
            >
              All settings
            </MenuItem>

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

        {panel === 'audio' && (
          <PanelFrame title="Equalizer" onBack={() => setPanel('root')}>
            {!canProcessAudio && (
              <div className="px-2.5 py-2 text-[12px] leading-relaxed text-fg-subtle">
                A video played straight from a link cannot be equalised. Reading
                its audio back out is what its origin forbids, and the browser
                answers by going silent rather than by refusing.
              </div>
            )}
            {canProcessAudio && !equalizer.isEnabled && (
              <div className="px-2.5 pb-2 text-[12px] leading-relaxed text-fg-subtle">
                {/* Web Audio needs a user gesture and permanently re-routes the
                    element's output, so it is opt-in rather than always on. */}
                Enabling routes audio through the equalizer for this session.
              </div>
            )}
            {canProcessAudio && (
              <MenuItem active={equalizer.isEnabled} onSelect={equalizer.toggleEQ}>
                {equalizer.isEnabled ? 'Equalizer on' : 'Enable equalizer'}
              </MenuItem>
            )}
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

        {panel === 'discord' && (
          <PanelFrame title="Discord" onBack={() => setPanel('root')}>
            <div className="px-2.5 pb-2 text-[12px] text-fg-muted">
              Shows what you are playing on your profile. Everyone who can see
              your profile can see it.
            </div>
            <DiscordStatusLine />
            <MenuItem
              active={discord.enabled}
              trailing={<span>{discord.enabled ? 'On' : 'Off'}</span>}
              onSelect={() => discord.setEnabled(!discord.enabled)}
            >
              Show what I am playing
            </MenuItem>
            <MenuItem
              active={discord.videoTitles}
              trailing={<span>{discord.videoTitles ? 'On' : 'Off'}</span>}
              onSelect={() => discord.setVideoTitles(!discord.videoTitles)}
            >
              Include film titles
            </MenuItem>
            <MenuItem
              active={discord.albumArt}
              trailing={<span>{discord.albumArt ? 'On' : 'Off'}</span>}
              onSelect={() => discord.setAlbumArt(!discord.albumArt)}
            >
              Show album art
            </MenuItem>
            <div className="px-2.5 pb-2 pt-1 text-[12px] text-fg-subtle">
              Films show as “Watching something” unless titles are on. Album art
              is looked up online by artist and album; your files are never
              uploaded.
            </div>
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

/**
 * What the presence is actually doing.
 *
 * Every failure in the presence is silent, because a player must not stop for
 * Discord. That is the right trade during a film and the wrong one at the
 * moment somebody is trying to work out why their profile is blank: a switch
 * that is on, a Discord that is closed and a card that was refused all look
 * the same from here. This asks, while the panel is open and not otherwise.
 */
export function DiscordStatusLine() {
  const [status, setStatus] = React.useState('off');

  React.useEffect(() => {
    let live = true;
    const ask = () => {
      void discordStatus().then((next) => {
        if (live) setStatus(next);
      });
    };
    ask();
    const timer = window.setInterval(ask, 2000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  const said: Record<string, string> = {
    off: 'Not showing anything',
    idle: 'On, waiting for something to play',
    waiting: 'Discord is not running',
    showing: 'On your profile now',
    refused: 'Discord refused the card',
  };

  return (
    <div className="px-2.5 pb-1.5 text-[12px] text-fg-subtle">
      {said[status] ?? said.off}
    </div>
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

/** What Cadence is built on, and the terms each part comes under. */
const COMPONENTS = [
  { name: 'FFmpeg', licence: 'LGPL-3.0' },
  { name: 'libass (JASSUB)', licence: 'LGPL-2.1' },
  { name: 'Tauri', licence: 'MIT, Apache-2.0' },
  { name: 'Inter, Schibsted Grotesk', licence: 'OFL-1.1' },
];

/**
 * Which Cadence this is, who made it, and what it is made of.
 *
 * The version is the first thing a bug report asks for, so it can be copied
 * rather than retyped. The components are listed because two of them are
 * LGPL, and somebody using a program built on them is owed being told so where
 * they can see it, not only in a text file beside the DLLs. The addresses are
 * text rather than links: this window cannot open a browser, and a link that
 * does nothing when pressed is worse than an address that can be read.
 */
export function AboutPanel() {
  const [copied, setCopied] = React.useState(false);

  const copyVersion = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`Cadence ${__APP_VERSION__}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // A clipboard that refuses is not worth an error over a version number.
    }
  }, []);

  return (
    <div className="px-2.5 pb-2">
      <div className="flex items-center gap-3 py-2">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-line bg-surface-2 shadow-[var(--cd-sheen-strong)]">
          <Mark size={30} cut="full" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[15px] font-bold tracking-[-0.02em] text-fg">Cadence</p>
          <p className="text-[12px] text-fg-muted">Everything plays.</p>
        </div>
      </div>

      <MenuItem
        onSelect={() => void copyVersion()}
        trailing={<span>{copied ? 'Copied' : 'Copy'}</span>}
      >
        Version {__APP_VERSION__}
      </MenuItem>

      <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">
        Made by Mohanad Tarek, part of Auva. Free to use on every machine you
        own. Updates arrive on their own and apply the next time you restart.
      </p>
      <p className="mt-2 text-[12px] text-fg-muted">cadence.auva.dev</p>
      <p className="text-[12px] text-fg-muted">github.com/mohanvd/cadence</p>

      <MenuSeparator />

      <p className="pt-1 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
        Built on
      </p>
      <ul className="space-y-1">
        {COMPONENTS.map(({ name, licence }) => (
          <li
            key={name}
            className="flex items-baseline justify-between gap-3 text-[12px] [font-variant-numeric:proportional-nums]"
          >
            <span className="truncate text-fg">{name}</span>
            <span className="shrink-0 text-fg-subtle">{licence}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px] leading-relaxed text-fg-subtle">
        FFmpeg is installed as separate libraries beside Cadence, with its
        licence, and can be replaced with a build of your own. Its source is
        at ffmpeg.org.
      </p>
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
              'size-7 rounded-full transition-shadow',
              'hover:shadow-[0_0_0_2px_var(--color-line-strong)]',
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
