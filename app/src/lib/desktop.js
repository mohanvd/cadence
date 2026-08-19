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

/* ── The playback pipeline ── */

/**
 * In flight or resolved to an endpoint. Never a resolved null.
 *
 * The endpoint outlives every file played through it, so asking twice is
 * waste — but a *failure* must not be remembered the same way. The shell holds
 * this call open until the pipeline has settled, so the only way to get null
 * is a broken install or a timeout, and caching either would mean one unlucky
 * question at startup left the player crippled until it was restarted.
 */
let endpointPromise = null;

/**
 * Where FFmpeg's output is served from, and the token that admits us.
 *
 * Null when the shell could not start the pipeline, which is a real state
 * rather than an error: the binaries may be missing from a broken install. The
 * player then falls back to handing the file straight to the media element,
 * which still covers MP4 and WebM.
 *
 * @returns {Promise<{ base: string, token: string } | null>}
 */
export async function mediaEndpoint() {
  if (!isDesktop()) return null;
  endpointPromise ??= (async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      return (await invoke('media_endpoint')) ?? null;
    } catch (err) {
      console.warn('No playback pipeline:', err);
      return null;
    }
  })();

  const endpoint = await endpointPromise;
  if (!endpoint) endpointPromise = null;
  return endpoint;
}

/**
 * Everything FFmpeg can read about a file: streams, codecs, languages,
 * durations, container metadata. Shaped exactly like `ffprobe -show_streams`.
 *
 * @param {string} path
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function probeMedia(path) {
  if (!isDesktop()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return await invoke('media_probe', { path });
  } catch (err) {
    console.warn(`Could not inspect ${basename(path)}:`, err);
    return null;
  }
}

/**
 * One subtitle track from inside a file, as WebVTT.
 *
 * `index` is the demuxer's stream index, which is what `MediaTrack.id` carries
 * for every track the probe reported.
 *
 * Rejects rather than returning null, because every reason this fails is worth
 * repeating to the viewer: a track can be empty, or a picture rather than text,
 * or the file can have moved since it was opened. "No subtitles" would describe
 * all three and explain none.
 *
 * @param {string} path
 * @param {number} index
 * @returns {Promise<string>} WebVTT
 */
export async function subtitleTrack(path, index) {
  if (!isDesktop()) throw new Error('Subtitles inside a file need the desktop app');
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke('media_subtitle', { path, index });
}

/**
 * The URL that streams a file as fragmented MP4, starting at `start` seconds.
 *
 * A seek is a new URL rather than a range request on an old one. The stream is
 * produced on demand and has no length to seek within: asking for a byte offset
 * would be asking a question about a file that does not exist. What the shell
 * can do instead is start FFmpeg at a keyframe near the timestamp, which is
 * both cheaper and exact enough.
 *
 * `copyVideo` and `copyAudio` are the page's veto, not its instruction. Whether
 * a stream *can* be lifted out of the container untouched is the shell's
 * judgement; whether this browser will then decode it is the page's, and only
 * the page can answer that. So these narrow what the shell decided and never
 * widen it.
 *
 * @param {string} path
 * @param {{ start?: number, audio?: number, copyVideo?: boolean, copyAudio?: boolean }} [options]
 * @returns {Promise<string | null>}
 */
export async function streamUrl(
  path,
  { start = 0, audio, copyVideo = true, copyAudio = true } = {}
) {
  const endpoint = await mediaEndpoint();
  if (!endpoint) return null;

  const query = new URLSearchParams({ token: endpoint.token, path });
  if (start > 0) query.set('t', start.toFixed(3));
  if (audio !== undefined) query.set('audio', String(audio));
  if (!copyVideo) query.set('copyv', '0');
  if (!copyAudio) query.set('copya', '0');

  return `${endpoint.base}/stream?${query}`;
}

/**
 * A single frame from a file, as a JPEG the page can put in an `<img>`.
 *
 * FFmpeg's rather than the media element's, which is the difference between a
 * thumbnail for every file and a thumbnail for the files the browser already
 * opens by itself. Seeking to `at` before the input is what keeps it cheap: it
 * lands on the nearest keyframe rather than decoding up to the timestamp.
 *
 * @param {string} path
 * @param {{ at?: number, width?: number }} [options]
 * @returns {Promise<string | null>}
 */
export async function frameUrl(path, { at, width } = {}) {
  const endpoint = await mediaEndpoint();
  if (!endpoint) return null;

  const query = new URLSearchParams({ token: endpoint.token, path });
  if (at !== undefined) query.set('t', at.toFixed(3));
  if (width !== undefined) query.set('w', String(width));

  return `${endpoint.base}/frame?${query}`;
}
