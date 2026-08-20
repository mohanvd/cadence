/**
 * Core playback engine types.
 *
 * The UI layer talks *only* to the `PlaybackEngine` interface and never learns
 * which backend is actually driving the pixels. That indirection is what lets a
 * file the browser opens by itself and a file arriving from FFmpeg through
 * Media Source be swapped per-file without the React tree knowing.
 */

/**
 * How a source is being played back. Surfaced in the UI for diagnostics.
 *
 * There used to be a third, `decode`, for files whose codecs no browser could
 * handle. It existed to explain a refusal. With FFmpeg behind the media element
 * there is nothing left to refuse: a codec the browser cannot take is converted
 * to one it can, which is a slower way to play a file rather than a reason not
 * to.
 */
export type BackendKind = 'native' | 'stream';

export type MediaSourceInput =
  /** A file the shell named, which is every file opened on the desktop. */
  | { kind: 'path'; path: string; name: string }
  /** A `File` with nothing behind it. Only the browser dev server makes these. */
  | { kind: 'file'; file: File; name: string }
  | { kind: 'url'; url: string; name: string };

/** A selectable track inside the container. */
export interface MediaTrack {
  /** Stable id: the demuxer stream index, or a synthetic id for native tracks. */
  id: string;
  type: 'video' | 'audio' | 'subtitle';
  /** Codec string as reported by the demuxer, e.g. `h264`, `aac`, `ac3`. */
  codec: string;
  /** BCP-47-ish language tag from container metadata, when present. */
  language?: string;
  /** Human label from container metadata, when present. */
  label?: string;
  /** True for the track the container marks as default. */
  default?: boolean;
  /**
   * Marked forced: the handful of lines that have to be read even by someone
   * who speaks the language — a sign on a wall, a line in another tongue. A
   * viewer scanning a list of four English tracks needs this to tell which one
   * is the film and which is a dozen captions.
   */
  forced?: boolean;
  /** Marked for the hard of hearing: dialogue plus the sounds around it. */
  hearingImpaired?: boolean;
  /** Whether this specific track can be played by the active backend. */
  playable: boolean;
  /**
   * A subtitle track that is pictures rather than words — what a Blu-ray
   * carries. It plays, but by a different route and with nothing to restyle,
   * which is why it is marked rather than merely playable.
   */
  pictures?: boolean;
  /**
   * A subtitle track that is a script — ASS or SSA — carrying not only the
   * words but where they go, in what font and at what angle. Drawn by libass
   * rather than converted, which is what keeps a translated sign on the wall
   * it is written on.
   */
  script?: boolean;
  channels?: number;
  sampleRate?: number;
  width?: number;
  height?: number;
}

/** Result of inspecting a file before choosing a backend. */
export interface ProbeResult {
  container: string;
  tracks: MediaTrack[];
  durationHint: number | null;
  /** Backend chosen for this source, with the reasoning kept for the UI. */
  backend: BackendKind;
  reason: string;
  /**
   * Whether each stream reaches the browser untouched.
   *
   * Worth carrying rather than deriving, for two reasons. The viewer is told,
   * because a file that costs nothing to play and one that keeps a core busy
   * for as long as it runs are not the same thing. And the backend has to
   * declare what is in the stream before any of it arrives, which it cannot do
   * without knowing which tracks FFmpeg is about to replace.
   */
  copyVideo: boolean;
  copyAudio: boolean;
}

export interface EngineState {
  paused: boolean;
  /** Seconds. Authoritative clock, whichever backend is active. */
  currentTime: number;
  duration: number;
  /** End of the furthest contiguous buffered range, in seconds. */
  buffered: number;
  seeking: boolean;
  /** True between a load starting and the first frame being presentable. */
  loading: boolean;
  ended: boolean;
  volume: number;
  muted: boolean;
  rate: number;
}

export interface EngineEvents {
  statechange: EngineState;
  /** Fired once metadata is known and tracks are enumerable. */
  loadedmetadata: { duration: number; tracks: MediaTrack[] };
  timeupdate: { currentTime: number };
  ended: void;
  error: { message: string; fatal: boolean; cause?: unknown };
  /** Emitted when a backend falls back to another after a load failure. */
  backendchange: { from: BackendKind; to: BackendKind; reason: string };
}

export type EngineEventName = keyof EngineEvents;

export type EngineListener<K extends EngineEventName> = (
  payload: EngineEvents[K],
) => void;

/**
 * The contract every backend satisfies.
 *
 * Implementations own their own rendering surface and append it into the
 * container element handed to `attach`.
 */
export interface PlaybackEngine {
  readonly kind: BackendKind;
  readonly state: Readonly<EngineState>;
  readonly tracks: readonly MediaTrack[];

  /** Mount the rendering surface into `container`. Called once. */
  attach(container: HTMLElement): void;
  load(source: MediaSourceInput): Promise<void>;

  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;

  /**
   * @param gain 0 to 1 is the element's own volume; above 1 is amplification.
   *
   * One number rather than two, because the slider and the amplifier are not
   * two loudnesses stacked on each other: the amplifier raises the ceiling the
   * slider runs to, and this is where that arithmetic ends up.
   */
  setVolume(gain: number): void;
  setMuted(muted: boolean): void;
  setRate(rate: number): void;

  /** Select an audio or subtitle track by `MediaTrack.id`. */
  selectTrack(type: 'audio' | 'subtitle', id: string | null): void;

  /**
   * The element to use for features that need a real video element
   * (Picture-in-Picture, `captureStream`, screenshots). Null when the backend
   * renders to a canvas and no such element exists.
   */
  getVideoElement(): HTMLVideoElement | null;
  /** Surface actually showing pixels: video element or canvas. */
  getRenderSurface(): HTMLVideoElement | HTMLCanvasElement | null;

  on<K extends EngineEventName>(event: K, listener: EngineListener<K>): () => void;
  destroy(): void;
}
