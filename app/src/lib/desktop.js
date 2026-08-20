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
 * Every video in the same folder as `path`, in the order they should play.
 *
 * The folder is the playlist. Nothing is assembled by hand and nothing is
 * remembered between launches, because a season of television is already
 * arranged on disk and asking someone to arrange it a second time inside a
 * player is asking for work they have done.
 *
 * @param {string} path
 * @returns {Promise<string[]>} Empty when there is no folder to read.
 */
export async function folderPlaylist(path) {
  if (!isDesktop()) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return await invoke('folder_playlist', { path });
  } catch {
    return [];
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
 * Every font on this machine, by name, each pointing at where to fetch it.
 *
 * A script names the faces it wants and expects the machine to have them, which
 * every player before a browser-based one could simply assume. libass here runs
 * inside the webview, and a webview may not read the fonts on the computer it
 * is running on without asking permission first — a question nobody can answer
 * usefully, asked in the middle of a film. The shell has no such restriction,
 * so it reads them and this is the list of what it found.
 *
 * Names rather than bytes. A machine carries hundreds of faces and a subtitle
 * wants two or three; the renderer fetches the ones it turns out to need.
 *
 * Read once. Fonts are installed by a person at a keyboard, which does not
 * happen while a film is playing.
 *
 * @type {Promise<Record<string, string>> | null}
 */
let fontsPromise = null;

export async function installedFonts() {
  fontsPromise ??= (async () => {
    const endpoint = await mediaEndpoint();
    if (!endpoint) return {};
    const { invoke } = await import('@tauri-apps/api/core');
    const names = await invoke('media_font_names');

    return Object.fromEntries(
      names.map((name) => [
        name,
        `${endpoint.base}/font?${new URLSearchParams({ token: endpoint.token, name })}`,
      ]),
    );
  })();

  try {
    return await fontsPromise;
  } catch {
    // A machine whose fonts could not be read still plays films. What it
    // cannot do is render a script in a face it does not have, and the
    // renderer already knows what to do about that.
    fontsPromise = null;
    return {};
  }
}

/**
 * @typedef {object} SubtitleScript
 * @property {string} text The ASS document itself.
 * @property {string[]} fonts URLs of the fonts the film carries for it.
 * @property {Record<string, string>} installed Every font on this machine, by
 *   name, for the faces the film does not carry and assumes are already here.
 */

/**
 * A subtitle track as the script it already is, with the fonts it asks for.
 *
 * The difference from `subtitleTrack` is everything except the sentences. ASS
 * says where a line sits, in what face, at what angle, in what colour and how
 * it moves; converting it to WebVTT keeps the words and discards all of that,
 * which turns a sign painted on a wall into a caption underneath the picture.
 *
 * The fonts come as URLs rather than bytes because some of them are not small
 * — a CJK face runs to megabytes — and the webview fetches and caches them
 * perfectly well on its own.
 *
 * @param {string} path
 * @param {number} index
 * @returns {Promise<SubtitleScript>}
 */
export async function scriptSubtitleTrack(path, index) {
  if (!isDesktop()) throw new Error('Subtitles inside a file need the desktop app');
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke('media_script', { path, index });

  const endpoint = await mediaEndpoint();
  const fonts = endpoint
    ? result.fonts.map(
        (attachment) =>
          `${endpoint.base}/attachment?${new URLSearchParams({
            token: endpoint.token,
            path,
            index: String(attachment),
          })}`,
      )
    : [];

  return { text: result.script, fonts, installed: await installedFonts() };
}

/**
 * @typedef {object} PictureCue
 * @property {number} start Seconds into the film.
 * @property {number} end
 * @property {number} x Left edge, on the authoring canvas.
 * @property {number} y Top edge, on the authoring canvas.
 * @property {number} width
 * @property {number} height
 * @property {string} url The picture itself.
 */

/**
 * @typedef {object} PictureTrack
 * @property {number} width The canvas the coordinates are measured against.
 * @property {number} height
 * @property {PictureCue[]} cues
 */

/**
 * A subtitle track that is pictures rather than words — what a Blu-ray carries.
 *
 * These come back as a table of times and places, with a URL for each picture
 * rather than the picture itself. A film holds around a thousand of them, and
 * the ones that matter are the handful on screen; fetching each as it comes due
 * costs one small request and lets the webview keep what it has already read,
 * which is what makes seeking back over a scene free.
 *
 * The coordinates are on the canvas the disc was authored against, not on the
 * window. Only the page knows how large the video is actually being drawn, so
 * only the page can scale them.
 *
 * @param {string} path
 * @param {number} index
 * @returns {Promise<PictureTrack>}
 */
export async function pictureSubtitleTrack(path, index) {
  if (!isDesktop()) throw new Error('Subtitles inside a file need the desktop app');
  const { invoke } = await import('@tauri-apps/api/core');
  const track = await invoke('media_pictures', { path, index });

  const endpoint = await mediaEndpoint();
  if (!endpoint) throw new Error('playback support is not available');

  return {
    width: track.width,
    height: track.height,
    cues: track.cues.map((cue, number) => ({
      ...cue,
      url: `${endpoint.base}/subtitle-image?${new URLSearchParams({
        token: endpoint.token,
        path,
        index: String(index),
        cue: String(number),
      })}`,
    })),
  };
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
