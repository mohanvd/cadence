import * as React from 'react';
import { useSettings, type FitMode } from '@/store/settingsStore';

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

export type { FitMode };

export interface VideoFitApi {
  mode: FitMode;
  /** True when the picture is cropped to fill the screen. */
  fills: boolean;
  toggle: () => void;
}

export function useVideoFit(): VideoFitApi {
  const mode = useSettings((s) => s.fit);

  const toggle = React.useCallback(() => {
    const { fit, set } = useSettings.getState();
    set({ fit: fit === 'contain' ? 'cover' : 'contain' });
  }, []);

  return { mode, fills: mode === 'cover', toggle };
}
