import * as React from 'react';
import { useVideoEl } from '@/store/playerStore';

/**
 * Document Picture-in-Picture.
 *
 * The element is **moved** into the PiP window and moved back on close, rather
 * than cloned. Cloning gives you two `<video>` elements pointed at the same
 * file: two decoders, two audio streams, and a drift between them that grows
 * the longer the window stays open. Moving keeps one of everything.
 *
 * Moving is also the only option that works at all for remuxed sources, because their
 * `src` is a MediaSource object URL bound to the original element, so a copy of
 * that URL attaches to nothing.
 */
export interface MiniPlayerApi {
  isActive: boolean;
  isSupported: boolean;
  toggle: () => Promise<void>;
}

interface DocumentPiP {
  requestWindow: (options: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
  }) => Promise<Window>;
  window: Window | null;
}

/**
 * Module-level so `addEventListener` and `removeEventListener` are handed the
 * same reference: a fresh arrow function per call would never detach.
 */
function blockNativeMenu(event: Event) {
  event.preventDefault();
}

function getDocumentPiP(): DocumentPiP | null {
  return (
    (window as Window & { documentPictureInPicture?: DocumentPiP })
      .documentPictureInPicture ?? null
  );
}

export function useMiniPlayer(onToast?: (message: string) => void): MiniPlayerApi {
  const videoEl = useVideoEl();
  const [isActive, setIsActive] = React.useState(false);

  // Where the element came from, so it can be put back exactly.
  const origin = React.useRef<{ parent: Node; before: Node | null } | null>(null);
  const pipWindow = React.useRef<Window | null>(null);
  const toastRef = React.useRef(onToast);
  toastRef.current = onToast;

  const restore = React.useCallback(() => {
    const video = videoEl;
    const home = origin.current;
    if (video && home?.parent) {
      // Back in the main document the app's own right-click menu takes over, so
      // the blocker has to come off. Left on, it would suppress that menu too.
      video.removeEventListener('contextmenu', blockNativeMenu);
      // `insertBefore` with a null marker appends, which is the right
      // behaviour when the video was the last child.
      home.parent.insertBefore(video, home.before);
      video.style.width = '';
      video.style.height = '';
      video.style.objectFit = '';
    }
    origin.current = null;
    pipWindow.current = null;
    setIsActive(false);
  }, [videoEl]);

  const close = React.useCallback(() => {
    const win = pipWindow.current;
    // Closing fires `pagehide`, which restores the element.
    if (win && !win.closed) win.close();
    else restore();
  }, [restore]);

  const toggle = React.useCallback(async () => {
    const video = videoEl;
    if (!video) return;

    if (pipWindow.current && !pipWindow.current.closed) {
      close();
      return;
    }

    const api = getDocumentPiP();

    // Fall back to the classic video-only PiP, which also moves rather than
    // copies the stream and so has the same single-decoder property.
    if (!api) {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await video.requestPictureInPicture();
      } catch {
        toastRef.current?.('Mini player is not available in this browser.');
      }
      return;
    }

    try {
      const ratio = video.videoWidth && video.videoHeight
        ? video.videoHeight / video.videoWidth
        : 9 / 16;
      const width = 480;
      const win = await api.requestWindow({
        width,
        height: Math.round(width * ratio),
        disallowReturnToOpener: false,
      });
      pipWindow.current = win;

      const doc = win.document;
      doc.documentElement.style.cssText = 'margin:0;background:#000;height:100%';
      doc.body.style.cssText =
        'margin:0;background:#000;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden';

      origin.current = { parent: video.parentNode!, before: video.nextSibling };
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'contain';
      // This window is a separate document that the app's React tree does not
      // render into, so it is the one place the browser's own video menu, with
      // "Save video as…" still on it, would appear.
      video.addEventListener('contextmenu', blockNativeMenu);
      doc.body.append(video);

      // Fires when the user closes the window or it is closed programmatically.
      win.addEventListener('pagehide', restore, { once: true });
      setIsActive(true);
    } catch {
      toastRef.current?.('Could not open the mini player.');
      restore();
    }
  }, [videoEl, close, restore]);

  /** Track the legacy PiP mode, which the browser can also exit on its own. */
  React.useEffect(() => {
    if (!videoEl) return;
    const onEnter = () => setIsActive(true);
    const onLeave = () => {
      if (!pipWindow.current) setIsActive(false);
    };
    videoEl.addEventListener('enterpictureinpicture', onEnter);
    videoEl.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      videoEl.removeEventListener('enterpictureinpicture', onEnter);
      videoEl.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, [videoEl]);

  // Never leave the element orphaned in a window the player no longer owns.
  React.useEffect(() => () => {
    const win = pipWindow.current;
    if (win && !win.closed) win.close();
  }, []);

  return {
    isActive,
    isSupported: Boolean(getDocumentPiP()) || 'requestPictureInPicture' in HTMLVideoElement.prototype,
    toggle,
  };
}
