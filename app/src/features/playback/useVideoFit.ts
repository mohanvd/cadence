import * as React from 'react';

/**
 * Letterbox or fill.
 *
 * A phone screen is 19.5:9 and almost no film is, so a correctly fitted video
 * leaves black bands down two sides, which is correct and not always what someone
 * watching on a train wants. `cover` scales until the frame fills the screen and
 * crops the overflow, which is the trade every phone player offers and none of
 * them explains: nothing is stretched, the aspect ratio is never touched, the
 * edges are simply outside the screen.
 *
 * The choice is remembered, because it is a preference about the device being
 * watched on rather than about the file being watched.
 */

export type FitMode = 'contain' | 'cover';

const STORAGE_KEY = 'cadence-video-fit';

function load(): FitMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'cover' ? 'cover' : 'contain';
  } catch {
    return 'contain';
  }
}

export interface VideoFitApi {
  mode: FitMode;
  /** True when the picture is cropped to fill the screen. */
  fills: boolean;
  toggle: () => void;
}

export function useVideoFit(): VideoFitApi {
  const [mode, setMode] = React.useState<FitMode>(load);

  const toggle = React.useCallback(() => {
    setMode((prev) => {
      const next: FitMode = prev === 'contain' ? 'cover' : 'contain';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // A blocked storage quota is not a reason to refuse the toggle.
      }
      return next;
    });
  }, []);

  return { mode, fills: mode === 'cover', toggle };
}
