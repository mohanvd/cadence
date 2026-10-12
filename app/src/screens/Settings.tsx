import * as React from 'react';
import { Icon, type IconName } from '@/components/ui/icons';
import { MenuSlider } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  ActionButton,
  ConfirmButton,
  SettingRow,
  SettingsGroup,
  Segmented,
  Switch,
  type Choice,
} from '@/components/settings/controls';
import { AboutPanel, DiscordStatusLine } from '@/components/player/SettingsMenu';
import {
  CHOICES,
  DEFAULTS,
  useSettings,
  type Settings as SettingsValues,
} from '@/store/settingsStore';
import {
  ACCENTS,
  DENSITIES,
  THEMES,
  accentSwatch,
  useAppearanceStore,
  type DensityId,
} from '@/store/appearanceStore';
import { useDiscordStore } from '@/store/discordStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useViewStore } from '@/store/viewStore';
import { EQ_BANDS } from '@/engine/audioChain';
import { EQ_PRESETS } from '@/hooks/useEqualizer';
import { FILTER_PRESETS } from '@/hooks/useVideoFilters';
import { SUBTITLE_OPTIONS, type SubtitleStyle } from '@/lib/subtitleStyle';
import {
  BINDINGS,
  chordLabel,
  chordOf,
  chordsOf,
  defaultChords,
  isReservedChord,
  labelOf,
  type Binding,
} from '@/features/keyboard/useKeyboardShortcuts';
import { isDesktop, pickFolder } from '@/lib/desktop';

/**
 * Settings: everything Cadence can be told, in one place.
 *
 * It used to be spread across the player's gear menu, which only exists while
 * something is playing, the library's folder dialog, and a dozen choices that
 * were only ever made by using the feature and could not be looked at or
 * undone. This screen is reachable from anywhere, by the gear in the window's
 * bar or Ctrl+comma, and sits over whatever is open, so a subtitle size can be
 * chosen with the film it is for paused behind it.
 *
 * The player's gear menu stays, as the quick way to change the file that is
 * playing now. Both read and write the same stores, so neither can disagree
 * with the other.
 */

type SectionId =
  | 'general'
  | 'appearance'
  | 'playback'
  | 'video'
  | 'audio'
  | 'subtitles'
  | 'library'
  | 'keyboard'
  | 'discord'
  | 'about';

const SECTIONS: { id: SectionId; label: string; icon: IconName }[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'playback', label: 'Playback', icon: 'play' },
  { id: 'video', label: 'Video', icon: 'filters' },
  { id: 'audio', label: 'Audio', icon: 'equalizer' },
  { id: 'subtitles', label: 'Subtitles', icon: 'captions' },
  { id: 'library', label: 'Music library', icon: 'music' },
  { id: 'keyboard', label: 'Keyboard', icon: 'keyboard' },
  { id: 'discord', label: 'Discord', icon: 'artist' },
  { id: 'about', label: 'About', icon: 'info' },
];

/* ── Search ──
 *
 * Every row carries the words it can be found by. While a search is running,
 * the screen shows every section at once and each row decides for itself
 * whether it matches; a group or a section with no row left in it is hidden by
 * the stylesheet, with `:has`, so nothing here has to count. */

const QueryContext = React.createContext('');

function matches(query: string, ...texts: (string | undefined)[]): boolean {
  if (!query) return true;
  const haystack = texts.filter(Boolean).join(' ').toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** A row that hides itself when a search is running and it is not what was asked for. */
function Row({
  label,
  description,
  keywords,
  ...rest
}: React.ComponentProps<typeof SettingRow> & { label: string; description?: string; keywords?: string }) {
  const query = React.useContext(QueryContext);
  if (!matches(query, label, description, keywords)) return null;
  return (
    <div data-setting-row>
      <SettingRow label={label} description={description} {...rest} />
    </div>
  );
}

/** Whether these settings differ from their defaults, for the reset button. */
function useChanged(...keys: (keyof SettingsValues)[]): boolean {
  return useSettings((s) => keys.some((key) => JSON.stringify(s[key]) !== JSON.stringify(DEFAULTS[key])));
}

/** Reset these settings, or nothing when they are already at their defaults. */
function useResetter(...keys: (keyof SettingsValues)[]): (() => void) | undefined {
  const changed = useChanged(...keys);
  const reset = useSettings((s) => s.reset);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return changed ? () => reset(keys) : undefined;
}

const seconds = (values: readonly number[]): Choice<number>[] =>
  values.map((value) => ({ value, label: value >= 60 ? `${value / 60} min` : `${value} s` }));

/* ── Sections ── */

interface UpdateInfo {
  status: string;
  version: string | null;
  progress: number | null;
  error: string;
  onInstall: () => void;
}

function GeneralSection({ updates }: { updates: UpdateInfo }) {
  const startScreen = useSettings((s) => s.startScreen);
  const set = useSettings((s) => s.set);
  const resetAll = useSettings((s) => s.resetAll);
  const resetAppearance = useAppearanceStore((s) => s.reset);

  const updateLine =
    updates.status === 'ready'
      ? `Cadence ${updates.version} is ready. It is installed when you restart.`
      : updates.status === 'downloading'
        ? `Downloading Cadence ${updates.version}${updates.progress != null ? `, ${Math.round(updates.progress * 100)}%` : ''}.`
        : updates.status === 'checking'
          ? 'Checking for a new version.'
          : updates.status === 'error'
            ? `The last check failed: ${updates.error || 'no reason given'}.`
            : `You are on the latest version, ${__APP_VERSION__}.`;

  return (
    <>
      <SettingsGroup title="Starting up">
        <Row
          label="Open on"
          description="Which tab the window shows when Cadence starts. A file opened from Explorer always goes straight to the player."
          keywords="start launch home files music tab"
          onReset={useResetter('startScreen')}
        >
          <Segmented
            label="Open on"
            value={startScreen}
            onChange={(value) => set({ startScreen: value })}
            options={[
              { value: 'home', label: 'Files' },
              { value: 'music', label: 'Music' },
            ]}
          />
        </Row>
      </SettingsGroup>

      {isDesktop() && (
        <SettingsGroup
          title="Updates"
          footnote="Cadence checks each time it starts, downloads in the background, and installs the update the next time you restart it. Never during a film."
        >
          <Row label="Version" description={updateLine} keywords="update upgrade version download">
            {updates.status === 'ready' && (
              <ActionButton tone="accent" onClick={updates.onInstall}>
                Restart now
              </ActionButton>
            )}
          </Row>
        </SettingsGroup>
      )}

      <SettingsGroup title="Start again">
        <Row
          label="Reset every setting"
          description="Puts every choice on this screen back the way Cadence ships, appearance included. Your library, playlists and bookmarks are not touched."
          keywords="reset defaults factory clear"
        >
          <ConfirmButton
            confirm="Press again to reset"
            onConfirm={() => {
              resetAll();
              resetAppearance();
            }}
          >
            Reset all
          </ConfirmButton>
        </Row>
      </SettingsGroup>
    </>
  );
}

function AppearanceSection() {
  const { accentId, themeId, densityId, setAccent, setTheme, setDensity } = useAppearanceStore();
  const motion = useSettings((s) => s.motion);
  const set = useSettings((s) => s.set);

  return (
    <>
      <SettingsGroup title="Colour">
        <Row
          label="Accent"
          description="The colour of the playhead, the switches that are on, and the one main button on a screen."
          keywords="colour color accent ember blue theme"
          stacked
        >
          <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Accent">
            {ACCENTS.map((accent) => (
              <button
                key={accent.id}
                type="button"
                role="radio"
                aria-checked={accentId === accent.id}
                onClick={() => setAccent(accent.id)}
                className={cn(
                  'flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-[12.5px] transition-colors',
                  accentId === accent.id
                    ? 'border-line-strong bg-surface-3 text-fg'
                    : 'border-line bg-surface-2 text-fg-muted hover:text-fg',
                )}
              >
                <span
                  className="size-5 rounded-full ring-1 ring-white/15"
                  style={{ backgroundColor: accentSwatch(accent) }}
                />
                {accent.label}
              </button>
            ))}
          </div>
        </Row>
        <Row
          label="Background"
          description={THEMES.find((theme) => theme.id === themeId)?.hint}
          keywords="theme dark black oled slate midnight background"
        >
          <Segmented
            label="Background"
            value={themeId}
            onChange={setTheme}
            options={THEMES.map((theme) => ({ value: theme.id, label: theme.label }))}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Size and motion">
        <Row
          label="Control size"
          description="How large the player's controls are. Large suits a touch screen or a television across the room."
          keywords="density scale size large compact touch"
        >
          <Segmented
            label="Control size"
            value={densityId}
            onChange={(value) => setDensity(value as DensityId)}
            options={DENSITIES.map((density) => ({ value: density.id, label: density.label }))}
          />
        </Row>
        <Row
          label="Motion"
          description="Whether panels and menus animate. As Windows follows the setting in Accessibility, Visual effects."
          keywords="animation motion reduce accessibility"
          onReset={useResetter('motion')}
        >
          <Segmented
            label="Motion"
            value={motion}
            onChange={(value) => set({ motion: value })}
            options={[
              { value: 'system', label: 'As Windows' },
              { value: 'reduce', label: 'Reduced' },
              { value: 'full', label: 'Full' },
            ]}
          />
        </Row>
      </SettingsGroup>
    </>
  );
}

function PlaybackSection() {
  const s = useSettings();

  return (
    <>
      <SettingsGroup title="Skipping">
        <Row
          label="Short skip"
          description="What ← and → and the skip buttons jump by."
          keywords="seek skip jump arrow forward back"
          onReset={useResetter('seekShort')}
        >
          <Segmented
            label="Short skip"
            value={s.seekShort}
            onChange={(value) => s.set({ seekShort: value })}
            options={seconds(CHOICES.seekShort)}
          />
        </Row>
        <Row
          label="Long skip"
          description="What J and L jump by."
          keywords="seek skip jump j l"
          onReset={useResetter('seekLong')}
        >
          <Segmented
            label="Long skip"
            value={s.seekLong}
            onChange={(value) => s.set({ seekLong: value })}
            options={seconds(CHOICES.seekLong)}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Picking up where you stopped">
        <Row
          label="Resume where you stopped"
          description="Reopen a film and it carries on from where you left it. Music asks first."
          keywords="resume continue position remember"
          onReset={useResetter('resume')}
        >
          <Switch label="Resume where you stopped" checked={s.resume} onChange={(value) => s.set({ resume: value })} />
        </Row>
        <Row
          label="Only after"
          description="How far into a file it has to be before it is worth resuming."
          keywords="resume threshold minimum"
          onReset={useResetter('resumeAfter')}
        >
          <Segmented
            label="Resume only after"
            value={s.resumeAfter}
            onChange={(value) => s.set({ resumeAfter: value })}
            options={seconds(CHOICES.resumeAfter)}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup
        title="When a file ends"
        footnote="A queue you started from the library always plays on. This is for the files beside the one you opened."
      >
        <Row
          label="Play the next file in the folder"
          description="The next episode, or the next track, starts by itself, in the order the names read."
          keywords="autoplay next episode folder queue advance"
          onReset={useResetter('autoAdvance')}
        >
          <Switch
            label="Play the next file in the folder"
            checked={s.autoAdvance}
            onChange={(value) => s.set({ autoAdvance: value })}
          />
        </Row>
      </SettingsGroup>
    </>
  );
}

function VideoSection() {
  const s = useSettings();
  const presetFor = (name: string) => FILTER_PRESETS.find((preset) => preset.name === name);

  return (
    <>
      <SettingsGroup title="The picture">
        <Row
          label="Fill the screen"
          description="Crops the film to the window's shape rather than leaving black bars. Nothing is stretched."
          keywords="fit fill crop letterbox aspect bars"
          onReset={useResetter('fit')}
        >
          <Switch
            label="Fill the screen"
            checked={s.fit === 'cover'}
            onChange={(value) => s.set({ fit: value ? 'cover' : 'contain' })}
          />
        </Row>
        <Row
          label="Ambient glow"
          description="Light from the edges of the picture spills onto the window around it."
          keywords="ambient glow light ambilight"
          onReset={useResetter('ambient')}
        >
          <Switch label="Ambient glow" checked={s.ambient} onChange={(value) => s.set({ ambient: value })} />
        </Row>
        <Row
          label="Music mode"
          description="Plays a video's sound with the picture switched off, which saves power through a long concert."
          keywords="music mode audio only picture off"
          onReset={useResetter('musicMode')}
        >
          <Switch label="Music mode" checked={s.musicMode} onChange={(value) => s.set({ musicMode: value })} />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Adjustments" footnote="Applied to every film until changed. The file itself is never touched.">
        <Row
          label="Preset"
          keywords="filters brightness contrast saturation preset vivid cinema"
          onReset={useResetter('filters', 'filterPreset')}
          stacked
        >
          <Segmented
            label="Picture preset"
            wrap
            value={s.filterPreset ?? 'Custom'}
            onChange={(name) => {
              const preset = presetFor(name);
              if (preset) s.set({ filters: { ...preset.values }, filterPreset: preset.name });
            }}
            options={[
              ...FILTER_PRESETS.map((preset) => ({ value: preset.name, label: preset.name })),
              ...(s.filterPreset === null ? [{ value: 'Custom', label: 'Custom' }] : []),
            ]}
          />
        </Row>
        <Row label="Brightness, contrast, colour" keywords="brightness contrast saturation hue" stacked>
          <div className="grid w-full grid-cols-1 gap-x-6 sm:grid-cols-2">
            {(
              [
                ['brightness', 'Brightness', 50, 150, '%'],
                ['contrast', 'Contrast', 50, 150, '%'],
                ['saturation', 'Saturation', 0, 200, '%'],
                ['hue', 'Hue', -180, 180, '°'],
              ] as const
            ).map(([key, label, min, max, unit]) => (
              <MenuSlider
                key={key}
                label={label}
                value={s.filters[key]}
                min={min}
                max={max}
                format={(v) => `${v}${unit}`}
                onChange={(v) => s.set({ filters: { ...s.filters, [key]: v }, filterPreset: null })}
              />
            ))}
          </div>
        </Row>
      </SettingsGroup>
    </>
  );
}

function AudioSection() {
  const s = useSettings();

  return (
    <SettingsGroup
      title="Equalizer"
      footnote="This is the curve the equalizer uses. Switch it on for a file from the player's menu, under Equalizer: it routes the sound through the mixer, which is a step taken per file."
    >
      <Row label="Preset" keywords="equalizer eq bass treble preset" onReset={useResetter('eqGains', 'eqPreset')} stacked>
        <Segmented
          label="Equalizer preset"
          wrap
          value={s.eqPreset ?? 'Custom'}
          onChange={(name) => {
            const preset = EQ_PRESETS.find((p) => p.name === name);
            if (preset) s.set({ eqGains: [...preset.gains], eqPreset: preset.name });
          }}
          options={[
            ...EQ_PRESETS.map((preset) => ({ value: preset.name, label: preset.name })),
            ...(s.eqPreset === null ? [{ value: 'Custom', label: 'Custom' }] : []),
          ]}
        />
      </Row>
      <Row label="Bands" keywords="equalizer bands frequency gain db" stacked>
        <div className="grid w-full grid-cols-1 gap-x-6 sm:grid-cols-2">
          {EQ_BANDS.map((band, index) => (
            <MenuSlider
              key={band.label}
              label={`${band.label} Hz`}
              value={s.eqGains[index] ?? 0}
              min={-12}
              max={12}
              step={0.5}
              format={(v) => `${v > 0 ? '+' : ''}${v} dB`}
              onChange={(v) => {
                const next = [...s.eqGains];
                next[index] = v;
                s.set({ eqGains: next, eqPreset: null });
              }}
            />
          ))}
        </div>
      </Row>
    </SettingsGroup>
  );
}

const STYLE_ROWS: { key: keyof SubtitleStyle; label: string }[] = [
  { key: 'family', label: 'Typeface' },
  { key: 'size', label: 'Size' },
  { key: 'color', label: 'Colour' },
  { key: 'opacity', label: 'Opacity' },
  { key: 'edge', label: 'Edge' },
  { key: 'backgroundColor', label: 'Backdrop' },
  { key: 'backgroundOpacity', label: 'Backdrop opacity' },
];

function hexAlpha(hex: string, percent: number): string {
  const alpha = Math.round((percent / 100) * 255).toString(16).padStart(2, '0');
  return `${hex}${alpha}`;
}

function SubtitlesSection() {
  const style = useSettings((s) => s.subtitleStyle);
  const set = useSettings((s) => s.set);
  const reset = useResetter('subtitleStyle');
  const change = (key: keyof SubtitleStyle, value: string | number) =>
    set({ subtitleStyle: { ...style, [key]: value } });

  const family =
    style.family === 'serif'
      ? 'Georgia, serif'
      : style.family === 'mono'
        ? 'var(--cd-font-mono)'
        : style.family === 'rounded'
          ? "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif"
          : 'var(--cd-font-text)';
  const edge =
    style.edge === 'outline'
      ? '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
      : style.edge === 'shadow'
        ? '0 2px 4px rgba(0,0,0,0.9)'
        : style.edge === 'raised'
          ? '1px 1px 0 rgba(255,255,255,0.35), 2px 2px 3px rgba(0,0,0,0.95)'
          : 'none';

  return (
    <SettingsGroup
      title="How subtitles look"
      footnote="For plain subtitles. A styled ASS script keeps the fonts and colours its author chose."
    >
      <Row label="Preview" keywords="subtitles captions preview style" onReset={reset} stacked>
        <div className="relative flex h-28 w-full items-end justify-center overflow-hidden rounded-[10px] border border-line bg-[linear-gradient(180deg,#22122a,#b44a37_70%,#2a1810)] pb-4">
          <span
            className="max-w-[90%] rounded-[4px] px-2 py-0.5 text-center leading-snug font-medium"
            style={{
              fontFamily: family,
              fontSize: `${(15 * style.size) / 100}px`,
              color: hexAlpha(style.color, style.opacity),
              backgroundColor: hexAlpha(style.backgroundColor, style.backgroundOpacity),
              textShadow: edge,
            }}
          >
            We leave when the light goes.
          </span>
        </div>
      </Row>
      {STYLE_ROWS.map(({ key, label }) => (
        <Row key={key} label={label} keywords={`subtitles captions ${key}`} stacked>
          <Segmented
            label={label}
            wrap
            value={style[key] as string | number}
            onChange={(value) => change(key, value)}
            options={SUBTITLE_OPTIONS[key]}
          />
        </Row>
      ))}
    </SettingsGroup>
  );
}

function LibrarySection() {
  const folders = useLibraryStore((s) => s.folders);
  const songs = useLibraryStore((s) => s.songs.length);
  const scanning = useLibraryStore((s) => s.scanning);
  const progress = useLibraryStore((s) => s.progress);
  const addFolder = useLibraryStore((s) => s.addFolder);
  const removeFolder = useLibraryStore((s) => s.removeFolder);
  const scan = useLibraryStore((s) => s.scan);
  const loaded = useLibraryStore((s) => s.loaded);
  const load = useLibraryStore((s) => s.load);

  // The library is read when the Music tab first opens. Settings can be
  // opened before that, and should not report an empty library that is not.
  React.useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const add = async () => {
    const folder = await pickFolder();
    if (!folder) return;
    await addFolder(folder);
    void scan();
  };

  return (
    <SettingsGroup
      title="Folders"
      footnote="Cadence reads the tags in these folders once and remembers them. Removing a folder forgets what was in it; the files themselves stay where they are."
    >
      <Row
        label="Watched folders"
        description={
          scanning
            ? `Reading${progress ? ` ${progress.done} of ${progress.total}` : ''}…`
            : `${songs} ${songs === 1 ? 'track' : 'tracks'} in ${folders.length} ${folders.length === 1 ? 'folder' : 'folders'}.`
        }
        keywords="library folders music scan watch"
        stacked
      >
        <div className="flex w-full flex-col gap-2">
          {folders.map((folder) => (
            <div
              key={folder}
              className="flex items-center gap-3 rounded-[10px] border border-line bg-surface-2 px-3 py-2"
            >
              <Icon name="folder" size={15} className="shrink-0 text-fg-subtle" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg" title={folder}>
                {folder}
              </span>
              <button
                type="button"
                onClick={() => void removeFolder(folder)}
                className="flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-3 hover:text-fg"
                aria-label={`Stop watching ${folder}`}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <ActionButton onClick={() => void add()} disabled={!isDesktop()}>
              <Icon name="folder" size={14} />
              Add a folder
            </ActionButton>
            <ActionButton onClick={() => void scan()} disabled={scanning || folders.length === 0}>
              <Icon name="refresh" size={14} />
              Scan again
            </ActionButton>
          </div>
        </div>
      </Row>
    </SettingsGroup>
  );
}

const GROUP_TITLES: Record<Binding['group'], string> = {
  playback: 'Playback',
  navigation: 'Moving around',
  audio: 'Sound',
  view: 'The picture and the window',
};

function KeyboardSection() {
  const keys = useSettings((s) => s.keys);
  const seekShort = useSettings((s) => s.seekShort);
  const seekLong = useSettings((s) => s.seekLong);
  const set = useSettings((s) => s.set);
  const [recording, setRecording] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState('');

  /* While a row is listening, the next key press is the new shortcut. Taken in
     the capture phase and stopped there, so it reaches neither the player nor
     the button that was focused; Escape gives up without changing anything. */
  React.useEffect(() => {
    if (!recording) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(null);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        setNotice('Shortcuts are single keys, with Shift if you like. Ctrl and Alt belong to Windows.');
        return;
      }
      const chord = chordOf(event);
      if (isReservedChord(chord)) {
        setNotice('The number keys jump through the film, and Escape closes things. Pick another.');
        return;
      }

      const current = useSettings.getState().keys;
      const next: Record<string, string[]> = { ...current };
      // Whoever had this key loses it, and is told so.
      const taken = BINDINGS.find((b) => b.id !== recording && chordsOf(b, current).includes(chord));
      if (taken) {
        next[taken.id] = chordsOf(taken, current).filter((c) => c !== chord);
        setNotice(`${chordLabel(chord)} was ${labelOf(taken, { seekShort, seekLong })}. That one has no key now.`);
      } else {
        setNotice('');
      }
      const binding = BINDINGS.find((b) => b.id === recording)!;
      const isDefault =
        JSON.stringify(defaultChords(binding)) === JSON.stringify([chord]);
      if (isDefault) delete next[recording];
      else next[recording] = [chord];
      set({ keys: next });
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, set, seekShort, seekLong]);

  const groups = (Object.keys(GROUP_TITLES) as Binding['group'][]).map((group) => ({
    group,
    bindings: BINDINGS.filter((b) => b.group === group),
  }));

  return (
    <>
      {notice && (
        <p className="mb-4 rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-fg-muted">
          {notice}
        </p>
      )}
      {groups.map(({ group, bindings }) => (
        <SettingsGroup key={group} title={GROUP_TITLES[group]}>
          {bindings.map((binding) => {
            const chords = chordsOf(binding, keys);
            const rebound = binding.id in keys;
            const listening = recording === binding.id;
            const label = labelOf(binding, { seekShort, seekLong });
            return (
              <Row
                key={binding.id}
                label={label}
                keywords={`shortcut key keyboard ${chords.map(chordLabel).join(' ')}`}
                onReset={
                  rebound
                    ? () => {
                        const next = { ...useSettings.getState().keys };
                        delete next[binding.id];
                        set({ keys: next });
                      }
                    : undefined
                }
              >
                <div className="flex items-center gap-1.5">
                  {chords.length === 0 && !listening && (
                    <span className="text-[12px] text-fg-subtle">No key</span>
                  )}
                  {!listening &&
                    chords.map((chord) => (
                      <kbd
                        key={chord}
                        className="inline-flex h-7 min-w-7 items-center justify-center rounded-[6px] border border-b-2 border-line-strong bg-surface-2 px-2 font-mono text-[11.5px] font-semibold text-fg shadow-[var(--cd-sheen-strong)]"
                      >
                        {chordLabel(chord)}
                      </kbd>
                    ))}
                  <button
                    type="button"
                    onClick={() => {
                      setNotice('');
                      setRecording(listening ? null : binding.id);
                    }}
                    className={cn(
                      'ml-1 h-7 rounded-[6px] px-2.5 text-[12px] font-medium transition-colors',
                      listening
                        ? 'bg-accent text-accent-fg'
                        : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                    )}
                    aria-label={listening ? 'Press a key, or Escape to cancel' : `Change the key for ${label}`}
                  >
                    {listening ? 'Press a key…' : 'Change'}
                  </button>
                </div>
              </Row>
            );
          })}
        </SettingsGroup>
      ))}
      <SettingsGroup>
        <Row label="Put every key back" keywords="reset shortcuts keys default">
          <ActionButton onClick={() => set({ keys: {} })} disabled={Object.keys(keys).length === 0}>
            Reset shortcuts
          </ActionButton>
        </Row>
      </SettingsGroup>
    </>
  );
}

function DiscordSection() {
  const discord = useDiscordStore();
  const query = React.useContext(QueryContext);
  return (
    <SettingsGroup
      title="Rich presence"
      footnote="Album art is looked up online by artist and album. Your files are never uploaded, and nothing is sent at all while this is off."
    >
      {/* Not a setting, so not a search result. */}
      {!query && (
        <div className="px-4 pt-3">
          <DiscordStatusLine />
        </div>
      )}
      <Row
        label="Show what I am playing"
        description="On your Discord profile, for everyone who can see it."
        keywords="discord presence status profile"
      >
        <Switch label="Show what I am playing" checked={discord.enabled} onChange={discord.setEnabled} />
      </Row>
      <Row
        label="Include film titles"
        description="Off, a film shows as Watching something. Music always shows its title."
        keywords="discord film video title privacy"
      >
        <Switch
          label="Include film titles"
          checked={discord.videoTitles}
          disabled={!discord.enabled}
          onChange={discord.setVideoTitles}
        />
      </Row>
      <Row label="Show album art" keywords="discord album art cover">
        <Switch
          label="Show album art"
          checked={discord.albumArt}
          disabled={!discord.enabled}
          onChange={discord.setAlbumArt}
        />
      </Row>
    </SettingsGroup>
  );
}

function AboutSection() {
  const query = React.useContext(QueryContext);
  if (!matches(query, 'about version licence license credits ffmpeg cadence')) return null;
  return (
    <div data-setting-row className="max-w-md rounded-[14px] border border-line/80 bg-surface-1 py-2 shadow-[var(--cd-sheen)]">
      <AboutPanel />
    </div>
  );
}

/* ── The screen ── */

export interface SettingsScreenProps {
  updates: UpdateInfo;
}

export default function SettingsScreen({ updates }: SettingsScreenProps) {
  const [section, setSection] = React.useState<SectionId>('general');
  const [query, setQuery] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement>(null);
  const close = React.useCallback(() => useViewStore.getState().go({ settings: false }), []);

  /* Escape clears a search first and closes the screen second, and Ctrl+F
     goes to the search box, the way it does in every other window. */
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (query) setQuery('');
        else close();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [query, close]);

  const render = (id: SectionId) => {
    switch (id) {
      case 'general':
        return <GeneralSection updates={updates} />;
      case 'appearance':
        return <AppearanceSection />;
      case 'playback':
        return <PlaybackSection />;
      case 'video':
        return <VideoSection />;
      case 'audio':
        return <AudioSection />;
      case 'subtitles':
        return <SubtitlesSection />;
      case 'library':
        return <LibrarySection />;
      case 'keyboard':
        return <KeyboardSection />;
      case 'discord':
        return <DiscordSection />;
      case 'about':
        return <AboutSection />;
    }
  };

  const searching = query.trim().length > 0;
  const shown = searching ? SECTIONS : SECTIONS.filter((s) => s.id === section);

  return (
    <div className="settings-screen" role="dialog" aria-modal="true" aria-label="Settings">
      <aside className="settings-screen__nav">
        <div className="relative mb-3">
          <Icon name="search" size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search settings"
            aria-label="Search settings"
            className="h-9 w-full rounded-[10px] border border-line bg-surface-2 pr-3 pl-8 text-[13px] text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none"
          />
        </div>
        <nav aria-label="Settings sections" className="flex flex-col gap-0.5">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setQuery('');
                setSection(item.id);
              }}
              aria-current={!searching && section === item.id ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-left text-[13px] font-medium transition-colors',
                !searching && section === item.id
                  ? 'bg-surface-2 text-fg shadow-[var(--cd-sheen)]'
                  : 'text-fg-muted hover:bg-surface-1 hover:text-fg',
              )}
            >
              <Icon
                name={item.icon}
                size={15}
                className={!searching && section === item.id ? 'text-accent' : undefined}
              />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="settings-screen__body custom-scroll">
        <QueryContext.Provider value={query.trim()}>
          <div className="settings-screen__inner">
            {shown.map((item) => (
              <div key={item.id} className="settings-screen__section">
                <h2 className="settings-screen__title">{item.label}</h2>
                {render(item.id)}
              </div>
            ))}
            {searching && (
              <p className="settings-screen__empty">
                Nothing in Settings matches “{query.trim()}”.
              </p>
            )}
          </div>
        </QueryContext.Provider>
      </div>
    </div>
  );
}
