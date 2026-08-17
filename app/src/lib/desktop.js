/*
 * The seam between Cadence and the desktop shell.
 *
 * Everything Tauri-specific is reached through here, and always by dynamic
 * import: the same bundle still has to build and run for the landing page,
 * where none of these modules exist to be loaded.
 */

/**
 * Whether this bundle is running inside the desktop shell.
 *
 * Tauri injects `__TAURI_INTERNALS__` before any application script runs, so
 * this is answerable synchronously and stays true for the life of the window.
 *
 * @returns {boolean}
 */
export function isDesktop() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Turn an absolute path on disk into a URL the webview will load.
 *
 * The asset protocol streams from disk and honours range requests, which is the
 * whole reason a path can be handed to a media element at all: reading the file
 * into memory first would mean holding an entire film in RAM to play it.
 *
 * @param {string} path
 * @returns {Promise<string>}
 */
export async function toPlayableUrl(path) {
  const { convertFileSrc } = await import('@tauri-apps/api/core');
  return convertFileSrc(path);
}

/**
 * The filename component of a path, for display and for recent-file records.
 *
 * @param {string} path
 * @returns {string}
 */
export function basename(path) {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/**
 * The file Cadence was launched with, if it was started by opening a video.
 *
 * Returns null on every call after the first. The shell hands the path over
 * once, so that reloading the webview does not reopen a file the user has
 * since closed.
 *
 * @returns {Promise<string | null>}
 */
export async function takeLaunchFile() {
  if (!isDesktop()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return await invoke('take_launch_file');
  } catch {
    return null;
  }
}

/**
 * Listen for videos opened while Cadence is already running.
 *
 * Double-clicking a second file does not start a second copy of the app; the
 * shell routes the path to the window that is already open, and it arrives
 * here.
 *
 * @param {(path: string) => void} onOpen
 * @returns {() => void} unsubscribe
 */
export function onOpenFile(onOpen) {
  if (!isDesktop()) return () => {};

  let dispose = () => {};
  let cancelled = false;

  import('@tauri-apps/api/event').then(({ listen }) => {
    listen('cadence://open-file', (event) => {
      if (typeof event.payload === 'string') onOpen(event.payload);
    }).then((unlisten) => {
      // The listener resolves asynchronously, so a caller that unsubscribed in
      // the meantime has to be honoured retroactively.
      if (cancelled) unlisten();
      else dispose = unlisten;
    });
  });

  return () => {
    cancelled = true;
    dispose();
  };
}

/**
 * Files dragged onto the window, delivered as paths.
 *
 * The shell intercepts the drop before the webview sees it, which is the only
 * way to learn where a dropped file actually is: an HTML drop hands over a
 * `File` and nothing else, because a web page has no business knowing the
 * layout of anyone's disk. That is correct for a web page and useless here,
 * where the path is what makes the file re-openable tomorrow.
 *
 * @param {{ onOver?: () => void, onLeave?: () => void, onDrop: (paths: string[]) => void }} handlers
 * @returns {() => void} unsubscribe
 */
export function onFileDrop({ onOver, onLeave, onDrop }) {
  if (!isDesktop()) return () => {};

  let dispose = () => {};
  let cancelled = false;

  import('@tauri-apps/api/webview').then(({ getCurrentWebview }) => {
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const { type, paths } = event.payload;
        if (type === 'over') onOver?.();
        else if (type === 'leave') onLeave?.();
        else if (type === 'drop') {
          onLeave?.();
          if (paths?.length) onDrop(paths);
        }
      })
      .then((unlisten) => {
        if (cancelled) unlisten();
        else dispose = unlisten;
      });
  });

  return () => {
    cancelled = true;
    dispose();
  };
}

/**
 * Ask the operating system for a video file, returning its path.
 *
 * The native dialog replaces `showOpenFilePicker`, which WebView2 does not
 * implement. It is also the better of the two: a path stays valid across
 * restarts, where a browser file handle needs its permission re-granted.
 *
 * @returns {Promise<string | null>}
 */
export async function pickVideoFile() {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: 'Video',
        extensions: [
          'mp4',
          'mkv',
          'webm',
          'mov',
          'avi',
          'm4v',
          'wmv',
          'flv',
          'ts',
          'm2ts',
          'mpg',
          'mpeg',
          '3gp',
          'ogv',
        ],
      },
    ],
  });
  return typeof selected === 'string' ? selected : null;
}
