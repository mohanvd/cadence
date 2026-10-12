import { create } from 'zustand';
import { DEFAULT_SUBTITLE_STYLE, sanitizeSubtitleStyle, type SubtitleStyle } from '@/lib/subtitleStyle';

/**
 * Every preference Cadence keeps, in one place.
 *
 * These used to live in ten storage keys, each read and written by the hook
 * that used it. That worked while the only way to change a preference was the
 * player's own menu, because the hook doing the reading was the one on screen.
 * It stops working the moment there is a Settings screen: a film paused behind
 * it, or an album playing under it, would keep its own copy and ignore the
 * change. One store means one copy, and whatever is on screen reads it.
 *
 * Appearance and Discord are not here, because they were stores already and
 * the Settings screen reads them directly. Volume, speed and the like are not
 * either: they are where playback was left, not a choice about how it should
 * be, and they belong to the player.
 *
 * Saved under one key. A copy that has never saved is filled in from the old
 * keys the first time it runs, so nobody's choices are lost on update; the old
 * keys are left where they were, so an older build run afterwards still finds
 * them.
 */

export type StartScreen = 'home' | 'music';
export type Motion = 'system' | 'reduce' | 'full';
export type FitMode = 'contain' | 'cover';

export interface VideoFilters {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
}

export type { SubtitleStyle };

export interface Settings {
  /** Which tab the window opens on. */
  startScreen: StartScreen;
  /** What ← and → jump by, in seconds. */
  seekShort: number;
  /** What J and L jump by, in seconds. */
  seekLong: number;
  /** Pick a film up where it was left. */
  resume: boolean;
  /** How far into a file it has to be before it is worth resuming, in seconds. */
  resumeAfter: number;
  /** When a file ends, start the next one in its folder. */
  autoAdvance: boolean;
  /** Whether the interface animates. `system` follows Windows. */
  motion: Motion;
  fit: FitMode;
  ambient: boolean;
  musicMode: boolean;
  filters: VideoFilters;
  /** The preset the filters came from, or null once they were moved by hand. */
  filterPreset: string | null;
  eqGains: number[];
  eqPreset: string | null;
  subtitleStyle: SubtitleStyle;
  /** Shortcuts that were rebound, by binding id. Anything absent is the default. */
  keys: Record<string, string[]>;
}

export const DEFAULT_FILTERS: VideoFilters = { brightness: 100, contrast: 100, saturation: 100, hue: 0 };
export const DEFAULT_EQ_GAINS = [0, 0, 0, 0, 0];

export const DEFAULTS: Settings = {
  startScreen: 'home',
  seekShort: 10,
  seekLong: 30,
  resume: true,
  resumeAfter: 15,
  autoAdvance: true,
  motion: 'system',
  fit: 'contain',
  ambient: false,
  musicMode: false,
  filters: { ...DEFAULT_FILTERS },
  filterPreset: 'Normal',
  eqGains: [...DEFAULT_EQ_GAINS],
  eqPreset: 'Flat',
  subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE },
  keys: {},
};

/** The values the screen offers for each numeric choice. Anything else saved is ignored. */
export const CHOICES = {
  seekShort: [5, 10, 15, 30],
  seekLong: [15, 30, 60, 120],
  resumeAfter: [5, 15, 30, 60],
} as const;

const STORAGE_KEY = 'cadence-settings';
const VERSION = 1;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function json(key: string): unknown {
  const raw = read(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function filtersFrom(value: unknown): VideoFilters {
  const filters = { ...DEFAULT_FILTERS };
  if (!isObject(value)) return filters;
  for (const key of Object.keys(DEFAULT_FILTERS) as (keyof VideoFilters)[]) {
    const n = value[key];
    if (typeof n === 'number' && Number.isFinite(n)) filters[key] = n;
  }
  return filters;
}

function gainsFrom(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== DEFAULT_EQ_GAINS.length) return [...DEFAULT_EQ_GAINS];
  return value.map((g) => (typeof g === 'number' && Number.isFinite(g) ? Math.max(-12, Math.min(12, g)) : 0));
}

function keysFrom(value: unknown): Record<string, string[]> {
  if (!isObject(value)) return {};
  const keys: Record<string, string[]> = {};
  for (const [id, list] of Object.entries(value)) {
    // An empty list is kept: it is a shortcut whose key was given to another
    // one, and is unbound until somebody gives it a new one.
    if (Array.isArray(list) && list.every((k) => typeof k === 'string')) {
      keys[id] = list as string[];
    }
  }
  return keys;
}

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * A saved copy, value by value. Each one is checked against what the screen
 * can offer, so a value an older or newer build wrote that this one does not
 * understand falls back to its default instead of breaking the rest.
 */
function validate(saved: Record<string, unknown>): Settings {
  return {
    startScreen: oneOf(saved.startScreen, ['home', 'music'] as const, DEFAULTS.startScreen),
    seekShort: oneOf(saved.seekShort, CHOICES.seekShort, DEFAULTS.seekShort as 10),
    seekLong: oneOf(saved.seekLong, CHOICES.seekLong, DEFAULTS.seekLong as 30),
    resume: typeof saved.resume === 'boolean' ? saved.resume : DEFAULTS.resume,
    resumeAfter: oneOf(saved.resumeAfter, CHOICES.resumeAfter, DEFAULTS.resumeAfter as 15),
    autoAdvance: typeof saved.autoAdvance === 'boolean' ? saved.autoAdvance : DEFAULTS.autoAdvance,
    motion: oneOf(saved.motion, ['system', 'reduce', 'full'] as const, DEFAULTS.motion),
    fit: oneOf(saved.fit, ['contain', 'cover'] as const, DEFAULTS.fit),
    ambient: typeof saved.ambient === 'boolean' ? saved.ambient : DEFAULTS.ambient,
    musicMode: typeof saved.musicMode === 'boolean' ? saved.musicMode : DEFAULTS.musicMode,
    filters: filtersFrom(saved.filters),
    filterPreset: typeof saved.filterPreset === 'string' ? saved.filterPreset : null,
    eqGains: gainsFrom(saved.eqGains),
    eqPreset: typeof saved.eqPreset === 'string' ? saved.eqPreset : null,
    subtitleStyle: sanitizeSubtitleStyle(saved.subtitleStyle),
    keys: keysFrom(saved.keys),
  };
}

/** What 0.9.0 and earlier saved, each under its own key, gathered into one. */
function migrate(): Settings {
  const eq = json('cadence-audio-eq');
  const filters = json('cadence-video-filters');
  return validate({
    fit: read('cadence-video-fit') === 'cover' ? 'cover' : 'contain',
    ambient: read('cadence-ambient') === 'true',
    musicMode: read('cadence-music-mode') === 'true',
    filters,
    // The old hook did not keep the preset, only the values.
    filterPreset: filters ? null : 'Normal',
    eqGains: isObject(eq) ? eq.gains : undefined,
    eqPreset: isObject(eq) && typeof eq.preset === 'string' ? eq.preset : isObject(eq) ? null : 'Flat',
    subtitleStyle: json('cadence-subtitle-style'),
  });
}

function load(): Settings {
  const saved = json(STORAGE_KEY);
  if (isObject(saved) && isObject(saved.settings)) return validate(saved.settings);
  return migrate();
}

function persist(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, settings }));
  } catch {
    /* Private browsing, or a full disk: the change still applies, it just
       will not outlive the window. */
  }
}

/**
 * Motion, written onto the root so one stylesheet rule can act on it.
 *
 * `system` writes nothing, which leaves the `prefers-reduced-motion` query in
 * theme.css to decide, the way it always has.
 */
function applyMotion(motion: Motion): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (motion === 'system') delete root.dataset.motion;
  else root.dataset.motion = motion;
}

interface SettingsState extends Settings {
  /** Change some settings. Saved at once. */
  set: (patch: Partial<Settings>) => void;
  /** Put the named settings back to their defaults. */
  reset: (keys: (keyof Settings)[]) => void;
  /** Every setting back to its default. */
  resetAll: () => void;
}

const pick = (state: SettingsState): Settings => {
  const out = {} as Record<keyof Settings, unknown>;
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) out[key] = state[key];
  return out as unknown as Settings;
};

export const useSettings = create<SettingsState>((set, get) => {
  const initial = load();
  applyMotion(initial.motion);

  const commit = (patch: Partial<Settings>) => {
    set(patch);
    const next = pick(get());
    persist(next);
    if ('motion' in patch) applyMotion(next.motion);
  };

  return {
    ...initial,
    set: commit,
    reset: (keys) => {
      const patch: Partial<Settings> = {};
      for (const key of keys) {
        // Copied, so a later change to the live value cannot reach the default.
        (patch as Record<string, unknown>)[key] = structuredClone(DEFAULTS[key]);
      }
      commit(patch);
    },
    resetAll: () => commit(structuredClone(DEFAULTS)),
  };
});

/** Read the settings outside React, for listeners bound once. */
export const settings = (): Settings => pick(useSettings.getState());
