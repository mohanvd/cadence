import * as React from 'react';
import { usePlayerStore } from '@/store/playerStore';

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
  /** `KeyboardEvent.key` values that trigger this action, lowercased. */
  keys: string[];
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
  togglePiP?: () => void;
  addBookmark?: () => void;
  takeScreenshot?: () => void;
  setABPointA?: () => void;
  setABPointB?: () => void;
  clearAB?: () => void;
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
    label: 'Play / pause',
    hint: 'Space',
    group: 'playback',
    run: (ctx) =>
      ctx.togglePlay ? ctx.togglePlay() : usePlayerStore.getState().togglePlay(),
  },
  {
    keys: ['arrowleft'],
    label: 'Back 10 seconds',
    hint: '←',
    group: 'navigation',
    run: () => usePlayerStore.getState().seekBy(-10),
  },
  {
    keys: ['arrowright'],
    label: 'Forward 10 seconds',
    hint: '→',
    group: 'navigation',
    run: () => usePlayerStore.getState().seekBy(10),
  },
  {
    keys: ['j'],
    label: 'Back 30 seconds',
    hint: 'J',
    group: 'navigation',
    run: () => usePlayerStore.getState().seekBy(-30),
  },
  {
    keys: ['l'],
    label: 'Forward 30 seconds',
    hint: 'L',
    group: 'navigation',
    run: () => usePlayerStore.getState().seekBy(30),
  },
  {
    keys: [','],
    label: 'Previous frame',
    hint: ',',
    group: 'navigation',
    // ~24fps step; precise enough for finding a slide boundary.
    run: () => usePlayerStore.getState().seekBy(-1 / 24),
  },
  {
    keys: ['.'],
    label: 'Next frame',
    hint: '.',
    group: 'navigation',
    run: () => usePlayerStore.getState().seekBy(1 / 24),
  },
  {
    keys: ['home'],
    label: 'Jump to start',
    hint: 'Home',
    group: 'navigation',
    run: () => usePlayerStore.getState().seek(0),
  },
  {
    keys: ['end'],
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
    label: 'Mute',
    hint: 'M',
    group: 'audio',
    run: () => usePlayerStore.getState().toggleMute(),
  },
  {
    keys: ['>'],
    label: 'Speed up',
    hint: 'Shift + .',
    group: 'playback',
    shift: true,
    run: () => stepSpeed(1),
  },
  {
    keys: ['<'],
    label: 'Slow down',
    hint: 'Shift + ,',
    group: 'playback',
    shift: true,
    run: () => stepSpeed(-1),
  },
  {
    keys: ['f'],
    label: 'Fullscreen',
    hint: 'F',
    group: 'view',
    run: (ctx) => ctx.toggleFullscreen(),
  },
  {
    keys: ['c'],
    label: 'Toggle subtitles',
    hint: 'C',
    group: 'view',
    run: (ctx) => ctx.toggleSubtitles?.(),
  },
  {
    keys: ['i'],
    label: 'Mini player',
    hint: 'I',
    group: 'view',
    run: (ctx) => ctx.togglePiP?.(),
  },
  {
    keys: ['r'],
    label: 'Loop file',
    hint: 'R',
    group: 'playback',
    run: (ctx) => ctx.toggleLoop?.(),
  },
  {
    keys: ['b'],
    label: 'Add bookmark',
    hint: 'B',
    group: 'navigation',
    run: (ctx) => ctx.addBookmark?.(),
  },
  {
    keys: ['s'],
    label: 'Save frame as PNG',
    hint: 'S',
    group: 'view',
    run: (ctx) => ctx.takeScreenshot?.(),
  },
  {
    keys: ['a'],
    label: 'Set loop point A',
    hint: 'A',
    group: 'playback',
    run: (ctx) => ctx.setABPointA?.(),
  },
  {
    keys: ['d'],
    label: 'Set loop point B',
    hint: 'D',
    group: 'playback',
    run: (ctx) => ctx.setABPointB?.(),
  },
  {
    keys: ['x'],
    label: 'Clear A–B loop',
    hint: 'X',
    group: 'playback',
    run: (ctx) => ctx.clearAB?.(),
  },
  {
    keys: ['z'],
    label: 'Zoom in',
    hint: 'Z',
    group: 'view',
    run: (ctx) => ctx.zoomIn?.(),
  },
  {
    keys: ['z'],
    label: 'Zoom out',
    hint: 'Shift + Z',
    group: 'view',
    shift: true,
    run: (ctx) => ctx.zoomOut?.(),
  },
  {
    keys: ['g'],
    label: 'Ambient glow',
    hint: 'G',
    group: 'view',
    run: (ctx) => ctx.toggleAmbient?.(),
  },
  {
    keys: ['?', '/'],
    label: 'Keyboard shortcuts',
    hint: '?',
    group: 'view',
    run: (ctx) => ctx.toggleShortcuts?.(),
  },
  {
    keys: ['n'],
    label: 'Next file',
    hint: 'N',
    group: 'navigation',
    run: (ctx) => ctx.next?.(),
  },
  {
    keys: ['p'],
    label: 'Previous file',
    hint: 'P',
    group: 'navigation',
    run: (ctx) => ctx.previous?.(),
  },
];

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
      if (isTypingTarget(event.target)) return;
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

      const binding = BINDINGS.find(
        (b) => b.keys.includes(key) && Boolean(b.shift) === event.shiftKey,
      );
      if (!binding) return;

      event.preventDefault();
      binding.run(contextRef.current);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
