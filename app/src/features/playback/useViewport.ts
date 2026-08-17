import * as React from 'react';

/**
 * What shape of player this device is asking for.
 *
 * Asked as a media query rather than by sniffing the user agent, and split into
 * three separate questions because they genuinely come apart: a tablet is touch
 * but roomy, a narrow desktop window is neither touch nor short of height, and a
 * phone held sideways is touch, wide, and only 375px tall. A single `isMobile`
 * boolean would answer all three wrongly for at least one of them.
 *
 * `compact` is the one that decides the layout: the pointer is coarse, so
 * targets have to be finger-sized, or the window is simply too narrow for a
 * dozen controls in one row. `landscape` matters because a phone on its side has
 * width to spare and almost no height, which is the opposite of the constraint
 * portrait imposes.
 */

/** Coarse pointer at any tablet-ish size, or any window too narrow for the full bar. */
const COMPACT = '(max-width: 640px), (pointer: coarse) and (max-width: 1024px)';
const LANDSCAPE = '(orientation: landscape)';
const TOUCH = '(pointer: coarse)';

function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // Server snapshot. Never reached in this app, but `useSyncExternalStore`
    // requires it and defaulting to the desktop layout is the safer guess.
    () => false,
  );
}

export interface Viewport {
  /** Finger-sized targets and a stacked layout. */
  compact: boolean;
  /** Wide and short: a phone on its side. */
  landscape: boolean;
  /** The pointer is a finger, so hover affordances are never seen. */
  touch: boolean;
}

export function useViewport(): Viewport {
  return {
    compact: useMediaQuery(COMPACT),
    landscape: useMediaQuery(LANDSCAPE),
    touch: useMediaQuery(TOUCH),
  };
}
