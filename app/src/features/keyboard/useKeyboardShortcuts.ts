import * as React from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { settings, useSettings, type Settings } from '@/store/settingsStore';
import { settingsOpen } from '@/store/viewStore';

/**
 * Keyboard shortcuts, defined as data.
 *
 * The previous implementation passed forty named callbacks into one hook, so
 * every new shortcut meant touching three files. Here a binding is a row in a
 * table: the handler reads the store directly through `getState()`, which also
 * means the listener is registered once and never re-registers as playback
 * state changes.
 */

export interface Binding {
  /** Stable, so a rebinding saved against it survives a relabelling. */
  id: string;
  /** `KeyboardEvent.key` values that trigger this action, lowercased. */
  keys: string[];
  /** `{short}` and `{long}` stand for the seek distances; see `labelOf`. */
  label: string;
  /** Display form for the shortcuts sheet. */
  hint: string;
  group: 'playback' | 'navigation' | 'audio' | 'view';
  run: (context: BindingContext) => void;
  /** Held-shift variant, matched before the plain binding. */
  shift?: boolean;
}

export interface BindingContext {
  toggleFullscreen: () => void;
  /** Overrides the default toggle so the UI can flash feedback. */
  togglePlay?: () => void;
  next?: (() => void) | undefined;
  previous?: (() => void) | undefined;
  toggleSubtitles?: () => void;
  toggleLoop?: () => void;
  addBookmark?: () => void;
  takeScreenshot?: () => void;
  zoomIn?: () => void;
  zoomOut?: () => void;
  resetZoom?: () => void;
  toggleAmbient?: () => void;
  toggleShortcuts?: () => void;
}

const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

function stepSpeed(direction: 1 | -1): void {
  const { rate, setRate } = usePlayerStore.getState();
  const index = SPEED_STEPS.findIndex((s) => s >= rate - 1e-6);
  const nextIndex = Math.max(
    0,
    Math.min(SPEED_STEPS.length - 1, (index === -1 ? 3 : index) + direction),
  );
  setRate(SPEED_STEPS[nextIndex]!);
}

export const BINDINGS: Binding[] = [
  {
    keys: [' ', 'k'],
    id: 'play',
    label: 'Play / pause',
    hint: 'Space',
    group: 'playback',
    run: (ctx) =>
      ctx.togglePlay ? ctx.togglePlay() : usePlayerStore.getState().togglePlay(),
  },
  {
    keys: ['arrowleft'],
    id: 'back-short',
    label: 'Back {short} seconds',
    hint: '←',
    group: 'navigation',
    run: () => usePlayerStore.getState().seekBy(-settings().seekShort),
  },
  {
    keys: ['arrowright'],
    id: 'forward-short',
    label: 'Forward {short} seconds',
    hint: '→',
    group: 'navigation',
    run: () => usePlayerStore.getState().seekBy(settings().seekShort),
  },
  {
    keys: ['j'],
    id: 'back-long',
    label: 'Back {long} seconds',
    hint: 'J',
    group: 'navigation',
    run: () => usePlayerStore.getState().seekBy(-settings().seekLong),
  },
  {
    keys: ['l'],
    id: 'forward-long',
    label: 'Forward {long} seconds',
    hint: 'L',
    group: 'navigation',
    run: () => usePlayerStore.getState().seekBy(settings().seekLong),
  },
  {
    keys: [','],
    id: 'frame-back',
    label: 'Previous frame',
    hint: ',',
    group: 'navigation',
    // ~24fps step; precise enough for finding a slide boundary.
    run: () => usePlayerStore.getState().seekBy(-1 / 24),
  },
  {
    keys: ['.'],
    id: 'frame-forward',
    label: 'Next frame',
    hint: '.',
    group: 'navigation',
    run: () => usePlayerStore.getState().seekBy(1 / 24),
  },
  {
    keys: ['home'],
    id: 'start',
    label: 'Jump to start',
    hint: 'Home',
    group: 'navigation',
    run: () => usePlayerStore.getState().seek(0),
  },
  {
    keys: ['end'],
    id: 'end',
    label: 'Jump to end',
    hint: 'End',
    group: 'navigation',
    run: () => {
      const { duration, seek } = usePlayerStore.getState();
      seek(duration);
    },
  },
  {
    keys: ['arrowup'],
    id: 'volume-up',
    label: 'Volume up',
    hint: '↑',
    group: 'audio',
    run: () => {
      const { volume, setVolume } = usePlayerStore.getState();
      setVolume(volume + 0.05);
    },
  },
  {
    keys: ['arrowdown'],
    id: 'volume-down',
    label: 'Volume down',
    hint: '↓',
    group: 'audio',
    run: () => {
      const { volume, setVolume } = usePlayerStore.getState();
      setVolume(volume - 0.05);
    },
  },
  {
    keys: ['m'],
    id: 'mute',
    label: 'Mute',
    hint: 'M',
    group: 'audio',
    run: () => usePlayerStore.getState().toggleMute(),
  },
  {
    keys: ['>'],
    id: 'speed-up',
    label: 'Speed up',
    hint: 'Shift + .',
    group: 'playback',
    shift: true,
    run: () => stepSpeed(1),
  },
  {
    keys: ['<'],
    id: 'speed-down',
    label: 'Slow down',
    hint: 'Shift + ,',
    group: 'playback',
    shift: true,
    run: () => stepSpeed(-1),
  },
  {
    keys: ['f'],
    id: 'fullscreen',
    label: 'Fullscreen',
    hint: 'F',
    group: 'view',
    run: (ctx) => ctx.toggleFullscreen(),
  },
  {
    keys: ['c'],
    id: 'subtitles',
    label: 'Toggle subtitles',
    hint: 'C',
    group: 'view',
    run: (ctx) => ctx.toggleSubtitles?.(),
  },
  {
    keys: ['r'],
    id: 'loop',
    label: 'Loop file',
    hint: 'R',
    group: 'playback',
    run: (ctx) => ctx.toggleLoop?.(),
  },
  {
    keys: ['b'],
    id: 'bookmark',
    label: 'Add bookmark',
    hint: 'B',
    group: 'navigation',
    run: (ctx) => ctx.addBookmark?.(),
  },
  {
    keys: ['s'],
    id: 'screenshot',
    label: 'Save frame as PNG',
    hint: 'S',
    group: 'view',
    run: (ctx) => ctx.takeScreenshot?.(),
  },
  {
    keys: ['z'],
    id: 'zoom-in',
    label: 'Zoom in',
    hint: 'Z',
    group: 'view',
    run: (ctx) => ctx.zoomIn?.(),
  },
  {
    keys: ['z'],
    id: 'zoom-out',
    label: 'Zoom out',
    hint: 'Shift + Z',
    group: 'view',
    shift: true,
    run: (ctx) => ctx.zoomOut?.(),
  },
  {
    keys: ['g'],
    id: 'ambient',
    label: 'Ambient glow',
    hint: 'G',
    group: 'view',
    run: (ctx) => ctx.toggleAmbient?.(),
  },
  {
    keys: ['?', '/'],
    id: 'shortcuts',
    label: 'Keyboard shortcuts',
    hint: '?',
    group: 'view',
    run: (ctx) => ctx.toggleShortcuts?.(),
  },
  {
    keys: ['n'],
    id: 'next',
    label: 'Next file',
    hint: 'N',
    group: 'navigation',
    run: (ctx) => ctx.next?.(),
  },
  {
    keys: ['p'],
    id: 'previous',
    label: 'Previous file',
    hint: 'P',
    group: 'navigation',
    run: (ctx) => ctx.previous?.(),
  },
];

/* ── Chords ──
 *
 * A chord is what a binding is matched against: a key, and `shift+` in front
 * of it when Shift was held. Only for letters and named keys, though. For a
 * symbol the Shift is already in the character: `?` cannot be typed without
 * it, and `>` is Shift and full stop. Matching those on whether Shift was down
 * is what kept `?` from ever opening the shortcuts sheet: its binding asked for
 * Shift to be up, which is the one way nobody can type a question mark.
 */

const isSymbol = (key: string): boolean => key.length === 1 && !/[a-z0-9 ]/.test(key);

/** The chord a key press makes. */
export function chordOf(event: { key: string; shiftKey: boolean }): string {
  const key = event.key.toLowerCase();
  return `${event.shiftKey && !isSymbol(key) ? 'shift+' : ''}${key}`;
}

/** The chords a binding answers to when nobody has rebound it. */
export function defaultChords(binding: Binding): string[] {
  return binding.keys.map((key) => `${binding.shift && !isSymbol(key) ? 'shift+' : ''}${key}`);
}

/** The chords a binding answers to now, rebound or not. */
export function chordsOf(binding: Binding, keys: Settings['keys']): string[] {
  return keys[binding.id] ?? defaultChords(binding);
}

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  home: 'Home',
  end: 'End',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  enter: 'Enter',
  backspace: 'Backspace',
  delete: 'Delete',
  insert: 'Insert',
  tab: 'Tab',
};

/** How a chord is written on a key cap: `Shift + Z`, `Space`, `←`. */
export function chordLabel(chord: string): string {
  const shifted = chord.startsWith('shift+');
  const key = shifted ? chord.slice('shift+'.length) : chord;
  const name = KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key[0]!.toUpperCase() + key.slice(1));
  return shifted ? `Shift + ${name}` : name;
}

/** A binding's label, with the seek distances it depends on filled in. */
export function labelOf(binding: Binding, current: Pick<Settings, 'seekShort' | 'seekLong'>): string {
  return binding.label
    .replace('{short}', String(current.seekShort))
    .replace('{long}', String(current.seekLong));
}

/** A binding's keys as the shortcuts sheet shows them. */
export function hintOf(binding: Binding, keys: Settings['keys']): string {
  return keys[binding.id] ? keys[binding.id]!.map(chordLabel).join(' / ') : binding.hint;
}

/**
 * Keys a binding may not be given: the digits jump to a percentage of the
 * film and are handled before any binding is looked at, and Escape is how
 * every panel and the Settings screen itself are closed.
 */
export function isReservedChord(chord: string): boolean {
  return /^[0-9]$/.test(chord) || chord === 'escape' || chord === 'shift+escape';
}

/** Typing in a field must never trigger a shortcut. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function useKeyboardShortcuts(context: BindingContext, enabled = true): void {
  // Kept in a ref so the listener is bound once and still sees fresh callbacks.
  const contextRef = React.useRef(context);
  contextRef.current = context;

  React.useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || settingsOpen()) return;
      // Leave browser and OS chords alone.
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key.toLowerCase();

      // Digits jump to a percentage of the duration, as every player does.
      if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        const { duration, seek } = usePlayerStore.getState();
        seek((Number(key) / 10) * duration);
        return;
      }

      // Read at the moment of the press, so a key rebound in Settings works
      // without the listener being bound again.
      const chord = chordOf(event);
      const { keys } = useSettings.getState();
      const binding = BINDINGS.find((b) => chordsOf(b, keys).includes(chord));
      if (!binding) return;

      event.preventDefault();
      binding.run(contextRef.current);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
