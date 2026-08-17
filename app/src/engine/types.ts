/**
 * Core playback engine types.
 *
 * The UI layer talks *only* to the `PlaybackEngine` interface and never learns
 * which backend is actually driving the pixels. That indirection is what lets a
 * native `<video>` element, an MSE remux pipeline, and a full WebCodecs decoder
 * be swapped per-file without the React tree knowing.
 */

/** How a source is being played back. Surfaced in the UI for diagnostics. */
export type BackendKind = 'native' | 'remux' | 'decode';

export type MediaSourceInput =
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
  /** Whether this specific track can be played by the active backend. */
  playable: boolean;
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

  setVolume(volume: number): void;
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
