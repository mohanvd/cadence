import { create } from 'zustand';

/**
 * User-facing appearance settings.
 *
 * These write CSS custom properties onto the document root rather than being
 * threaded through components as props. That is the whole reason the design
 * tokens in `styles/theme.css` are variables: one assignment re-colours the
 * player, the home screen and every menu at once, including the parts rendered
 * into portals that a React context would not reach.
 *
 * Values are authored in OKLCH to match the token system, where a hue rotation
 * keeps lightness and chroma constant, so every accent in the list reads with
 * the same weight against video instead of some jumping forward and others
 * disappearing.
 */

export interface AccentOption {
  id: string;
  label: string;
  /** Hue angle in OKLCH. Lightness and chroma are fixed across the set. */
  hue: number;
  chroma: number;
}

export const ACCENTS: readonly AccentOption[] = [
  /* Cadence's own, and first because it is the default. Warm because a player
     is used with the lights off; see brand/README.md. */
  { id: 'ember', label: 'Ember', hue: 45, chroma: 0.17 },
  { id: 'blue', label: 'Blue', hue: 250, chroma: 0.17 },
  { id: 'violet', label: 'Violet', hue: 292, chroma: 0.17 },
  { id: 'magenta', label: 'Magenta', hue: 340, chroma: 0.17 },
  { id: 'amber', label: 'Amber', hue: 75, chroma: 0.16 },
  { id: 'green', label: 'Green', hue: 155, chroma: 0.16 },
  { id: 'cyan', label: 'Cyan', hue: 205, chroma: 0.14 },
];

export interface ThemeOption {
  id: string;
  label: string;
  /** Lightness of the deepest surface; the ramp above it is derived. */
  base: number;
  hint: string;
}

export const THEMES: readonly ThemeOption[] = [
  { id: 'midnight', label: 'Midnight', base: 0.145, hint: 'The default near-black' },
  { id: 'black', label: 'True black', base: 0, hint: 'Saves power on OLED' },
  { id: 'slate', label: 'Slate', base: 0.205, hint: 'Lifted, easier in daylight' },
];

/** Control-bar scale. Touch screens and TVs want the roomier one. */
export const DENSITIES = [
  { id: 'comfortable', label: 'Comfortable', scale: 1 },
  { id: 'compact', label: 'Compact', scale: 0.9 },
  { id: 'large', label: 'Large', scale: 1.15 },
] as const;

export type DensityId = (typeof DENSITIES)[number]['id'];

export interface AppearanceState {
  accentId: string;
  themeId: string;
  densityId: DensityId;
  setAccent: (id: string) => void;
  setTheme: (id: string) => void;
  setDensity: (id: DensityId) => void;
  reset: () => void;
}

const STORAGE_KEY = 'cadence-appearance';

const DEFAULTS = {
  accentId: 'ember',
  themeId: 'midnight',
  densityId: 'comfortable' as DensityId,
};

function load(): typeof DEFAULTS {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<typeof DEFAULTS>;
    return {
      // Validated against the current option lists, not trusted: a value saved
      // by an older build may name an accent that no longer exists, and an
      // unknown id would otherwise render the accent variable invalid and take
      // every focus ring and playhead with it.
      accentId: ACCENTS.some((a) => a.id === parsed.accentId)
        ? parsed.accentId!
        : DEFAULTS.accentId,
      themeId: THEMES.some((t) => t.id === parsed.themeId)
        ? parsed.themeId!
        : DEFAULTS.themeId,
      densityId: DENSITIES.some((d) => d.id === parsed.densityId)
        ? (parsed.densityId as DensityId)
        : DEFAULTS.densityId,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(state: typeof DEFAULTS): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Private browsing; the choice just won't outlive the session. */
  }
}

/**
 * Push the current selection onto the document root.
 *
 * Only the variables that actually change are written. The rest of the ramp is
 * left to `theme.css`, so a token added there is picked up here for free.
 */
export function applyAppearance(state: typeof DEFAULTS): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const accent = ACCENTS.find((a) => a.id === state.accentId) ?? ACCENTS[0]!;
  root.style.setProperty('--color-accent', `oklch(0.72 ${accent.chroma} ${accent.hue})`);
  root.style.setProperty(
    '--color-accent-hover',
    `oklch(0.78 ${accent.chroma - 0.01} ${accent.hue})`,
  );

  const theme = THEMES.find((t) => t.id === state.themeId) ?? THEMES[0]!;
  const { base } = theme;
  // The brand's warm neutral: the hue and chroma of the ink ramp in
  // brand/tokens/tokens.css, at whatever lightness this theme starts from.
  const ink = (lightness: number) => `oklch(${lightness.toFixed(3)} ${lightness === 0 ? 0 : 0.004} 60)`;
  root.style.setProperty('--color-base', ink(base));
  // The ramp is relative to the base so "True black" does not end up with
  // menus floating at the same lightness as a Midnight menu would.
  root.style.setProperty('--color-surface-1', ink(base + 0.033));
  root.style.setProperty('--color-surface-2', ink(base + 0.071));
  root.style.setProperty('--color-surface-3', ink(base + 0.117));
  root.style.setProperty('--color-line', ink(base + 0.155));
  root.style.setProperty('--color-line-strong', ink(base + 0.225));
  // Body text is fixed: it has to stay legible over video regardless of how
  // dark the chrome behind it is.

  const density = DENSITIES.find((d) => d.id === state.densityId) ?? DENSITIES[0];
  root.style.setProperty('--control-scale', String(density.scale));
}

export const useAppearanceStore = create<AppearanceState>((set, get) => {
  const initial = load();
  applyAppearance(initial);

  const commit = (patch: Partial<typeof DEFAULTS>) => {
    const next = { ...pick(get()), ...patch };
    applyAppearance(next);
    persist(next);
    set(patch);
  };

  return {
    ...initial,
    setAccent: (accentId) => commit({ accentId }),
    setTheme: (themeId) => commit({ themeId }),
    setDensity: (densityId) => commit({ densityId }),
    reset: () => commit({ ...DEFAULTS }),
  };
});

function pick(state: AppearanceState): typeof DEFAULTS {
  return {
    accentId: state.accentId,
    themeId: state.themeId,
    densityId: state.densityId,
  };
}

/**
 * Apply the saved appearance before the first render.
 *
 * Called from the entry point rather than left to whichever component happens
 * to import the store first. That component is inside the player, so the home
 * screen would otherwise paint in the default theme until a file was opened.
 */
export function initAppearance(): void {
  applyAppearance(pick(useAppearanceStore.getState()));
}

/** Swatch colour for the picker, so the UI never rebuilds the OKLCH string. */
export function accentSwatch(accent: AccentOption): string {
  return `oklch(0.72 ${accent.chroma} ${accent.hue})`;
}
