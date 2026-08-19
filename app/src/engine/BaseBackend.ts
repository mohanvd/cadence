import type {
  BackendKind,
  EngineEventName,
  EngineEvents,
  EngineListener,
  EngineState,
  MediaSourceInput,
  MediaTrack,
  PlaybackEngine,
} from './types';

const INITIAL_STATE: EngineState = {
  paused: true,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  seeking: false,
  loading: true,
  ended: false,
  volume: 1,
  muted: false,
  rate: 1,
};

/**
 * Shared event emitter and state bookkeeping for every backend.
 *
 * State updates are coalesced: `statechange` fires at most once per animation
 * frame no matter how many fields were touched, so a backend that updates
 * `currentTime` on every decoded frame does not flood React with renders.
 */
export abstract class BaseBackend implements PlaybackEngine {
  abstract readonly kind: BackendKind;

  protected _state: EngineState = { ...INITIAL_STATE };
  protected _tracks: MediaTrack[] = [];
  protected container: HTMLElement | null = null;
  protected destroyed = false;

  private listeners = new Map<EngineEventName, Set<(payload: never) => void>>();
  private pendingStateFlush: number | null = null;

  get state(): Readonly<EngineState> {
    return this._state;
  }

  get tracks(): readonly MediaTrack[] {
    return this._tracks;
  }

  attach(container: HTMLElement): void {
    this.container = container;
    this.onAttach(container);
  }

  protected abstract onAttach(container: HTMLElement): void;

  abstract load(source: MediaSourceInput): Promise<void>;
  abstract play(): Promise<void>;
  abstract pause(): void;
  abstract seek(seconds: number): void;
  abstract setVolume(gain: number): void;
  abstract setMuted(muted: boolean): void;
  abstract setRate(rate: number): void;
  abstract selectTrack(type: 'audio' | 'subtitle', id: string | null): void;
  abstract getVideoElement(): HTMLVideoElement | null;
  abstract getRenderSurface(): HTMLVideoElement | HTMLCanvasElement | null;

  on<K extends EngineEventName>(event: K, listener: EngineListener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (payload: never) => void);
    return () => {
      set.delete(listener as (payload: never) => void);
    };
  }

  protected emit<K extends EngineEventName>(event: K, payload: EngineEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        (listener as EngineListener<K>)(payload);
      } catch (err) {
        // A throwing listener must not stop the others or wedge the engine.
        console.error(`[engine] listener for "${event}" threw`, err);
      }
    }
  }

  /**
   * Merge a partial state update and schedule a coalesced `statechange`.
   * `immediate` bypasses the frame batching for transitions the UI must not
   * lag behind, such as play/pause.
   */
  protected setState(patch: Partial<EngineState>, immediate = false): void {
    if (this.destroyed) return;

    let changed = false;
    for (const [key, value] of Object.entries(patch)) {
      if (this._state[key as keyof EngineState] !== value) {
        changed = true;
        break;
      }
    }
    if (!changed) return;

    this._state = { ...this._state, ...patch };

    if (immediate) {
      if (this.pendingStateFlush !== null) {
        this.cancelFlush(this.pendingStateFlush);
        this.pendingStateFlush = null;
      }
      this.emit('statechange', this._state);
      return;
    }

    if (this.pendingStateFlush !== null) return;
    this.pendingStateFlush = this.scheduleFlush(() => {
      this.pendingStateFlush = null;
      if (this.destroyed) return;
      this.emit('statechange', this._state);
    });
  }

  /**
   * Schedule a coalesced flush.
   *
   * `requestAnimationFrame` never fires in a hidden or non-compositing tab, so
   * relying on it alone freezes every state update the moment the window is
   * backgrounded (position saving and playlist advancement included) both of
   * which must keep working while audio plays in the background. A timer
   * fallback keeps the engine alive at a much lower rate when frames stop.
   */
  private scheduleFlush(callback: () => void): number {
    if (typeof document !== 'undefined' && document.hidden) {
      return window.setTimeout(callback, 250);
    }
    return requestAnimationFrame(callback);
  }

  private cancelFlush(handle: number): void {
    // The two id spaces are distinct, but cancelling the wrong one is a no-op,
    // so clearing both is safe and avoids tracking which scheduler was used.
    cancelAnimationFrame(handle);
    window.clearTimeout(handle);
  }

  protected fail(message: string, fatal = true, cause?: unknown): void {
    this.emit('error', { message, fatal, cause });
    if (fatal) this.setState({ loading: false }, true);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.pendingStateFlush !== null) {
      this.cancelFlush(this.pendingStateFlush);
      this.pendingStateFlush = null;
    }
    this.onDestroy();
    this.listeners.clear();
    this.container = null;
  }

  protected abstract onDestroy(): void;
}
