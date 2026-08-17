import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { createEngine } from '@/engine/createEngine';
import type {
  BackendKind,
  MediaSourceInput,
  MediaTrack,
  PlaybackEngine,
  ProbeResult,
} from '@/engine/types';

/**
 * Single source of truth for playback.
 *
 * This replaces threading thirty props from the player down into the controls.
 * The important property is *granularity*: components subscribe to the exact
 * fields they render, so a `currentTime` update sixty times a second re-renders
 * the scrubber and nothing else. The engine instance itself lives outside React
 * state: it is a mutable object, and storing it in state would defeat the
 * shallow equality checks everything else relies on.
 */

export interface PlayerSnapshot {
  paused: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  seeking: boolean;
  loading: boolean;
  ended: boolean;
  volume: number;
  muted: boolean;
  rate: number;
}

interface PlayerStore extends PlayerSnapshot {
  /** Not reactive. Read through `getEngine()`, never rendered directly. */
  engine: PlaybackEngine | null;
  /**
   * The live `<video>` element, republished whenever a backend swaps.
   *
   * Feature hooks (equalizer, subtitles, PiP, gestures) need the real element,
   * not the engine abstraction. Exposing it here keeps them independent of
   * which backend produced it, and null when a backend renders to canvas.
   */
  videoEl: HTMLVideoElement | null;
  source: MediaSourceInput | null;
  probe: ProbeResult | null;
  backend: BackendKind | null;
  tracks: MediaTrack[];
  selectedAudioId: string | null;
  selectedSubtitleId: string | null;
  error: string | null;

  openSource: (source: MediaSourceInput, container: HTMLElement) => Promise<void>;
  closeSource: () => void;

  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  seekBy: (delta: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setRate: (rate: number) => void;
  selectAudioTrack: (id: string) => void;
  selectSubtitleTrack: (id: string | null) => void;
  clearError: () => void;
}

const INITIAL: PlayerSnapshot = {
  paused: true,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  seeking: false,
  loading: false,
  ended: false,
  volume: 1,
  muted: false,
  rate: 1,
};

/** Token guarding against a slow probe resolving after a newer one started. */
let loadToken = 0;

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  ...INITIAL,
  engine: null,
  videoEl: null,
  source: null,
  probe: null,
  backend: null,
  tracks: [],
  selectedAudioId: null,
  selectedSubtitleId: null,
  error: null,

  openSource: async (source, container) => {
    const token = ++loadToken;

    // Tear the previous engine down first so its decoder and WASM buffers are
    // released before the next one allocates.
    get().engine?.destroy();
    set({
      ...INITIAL,
      loading: true,
      engine: null,
      videoEl: null,
      source,
      probe: null,
      backend: null,
      tracks: [],
      selectedAudioId: null,
      selectedSubtitleId: null,
      error: null,
    });

    let created;
    try {
      created = await createEngine(source);
    } catch (err) {
      if (token !== loadToken) return;
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Could not open this file.',
      });
      return;
    }

    // A newer source was opened while we were probing; discard this one.
    if (token !== loadToken) {
      created.engine.destroy();
      return;
    }

    const { engine, probe } = created;

    engine.on('statechange', (state) => {
      if (token !== loadToken) return;
      set({
        paused: state.paused,
        currentTime: state.currentTime,
        duration: state.duration,
        buffered: state.buffered,
        seeking: state.seeking,
        loading: state.loading,
        ended: state.ended,
        volume: state.volume,
        muted: state.muted,
        rate: state.rate,
      });
    });

    engine.on('loadedmetadata', ({ duration, tracks }) => {
      if (token !== loadToken) return;
      // Prefer the container's declared duration; the probe's hint is a
      // fallback for formats where the element reports Infinity.
      const resolved =
        Number.isFinite(duration) && duration > 0 ? duration : (probe.durationHint ?? 0);
      const merged = tracks.length > 0 ? tracks : probe.tracks;
      set({
        duration: resolved,
        tracks: merged,
        selectedAudioId:
          merged.find((t) => t.type === 'audio' && t.playable)?.id ?? null,
      });
    });

    engine.on('error', ({ message }) => {
      if (token !== loadToken) return;
      set({ error: message, loading: false });
    });

    engine.attach(container);
    // Publish the element only after attach, when the backend has created it.
    set({
      engine,
      videoEl: engine.getVideoElement(),
      probe,
      backend: probe.backend,
      tracks: probe.tracks,
    });

    try {
      await engine.load(source);
    } catch (err) {
      if (token !== loadToken) return;
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Playback failed.',
      });
    }
  },

  closeSource: () => {
    loadToken += 1;
    get().engine?.destroy();
    set({
      ...INITIAL,
      engine: null,
      videoEl: null,
      source: null,
      probe: null,
      backend: null,
      tracks: [],
    });
  },

  togglePlay: () => {
    const { engine, paused } = get();
    if (!engine) return;
    if (paused) void engine.play().catch(() => {});
    else engine.pause();
  },

  play: () => {
    void get().engine?.play().catch(() => {});
  },

  pause: () => {
    get().engine?.pause();
  },

  seek: (seconds) => {
    get().engine?.seek(seconds);
  },

  seekBy: (delta) => {
    const { engine, currentTime } = get();
    engine?.seek(currentTime + delta);
  },

  setVolume: (volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    const engine = get().engine;
    engine?.setVolume(clamped);
    // Raising the volume from a muted state should unmute, matching how every
    // desktop player behaves.
    if (clamped > 0 && get().muted) engine?.setMuted(false);
    set({ volume: clamped });
  },

  toggleMute: () => {
    const { engine, muted } = get();
    engine?.setMuted(!muted);
    set({ muted: !muted });
  },

  setRate: (rate) => {
    get().engine?.setRate(rate);
    set({ rate });
  },

  selectAudioTrack: (id) => {
    get().engine?.selectTrack('audio', id);
    set({ selectedAudioId: id });
  },

  selectSubtitleTrack: (id) => {
    get().engine?.selectTrack('subtitle', id);
    set({ selectedSubtitleId: id });
  },

  clearError: () => set({ error: null }),
}));

/* ── Granular selector hooks ───────────────────────────────────────────────
 * Each hook subscribes to the narrowest slice its consumer renders. Importing
 * these instead of reaching into the store directly is what keeps a scrubbing
 * timeline from re-rendering the settings menus.
 */

export const useCurrentTime = () => usePlayerStore((s) => s.currentTime);
export const useDuration = () => usePlayerStore((s) => s.duration);
export const useBuffered = () => usePlayerStore((s) => s.buffered);
export const useIsPaused = () => usePlayerStore((s) => s.paused);
export const useIsLoading = () => usePlayerStore((s) => s.loading);
export const usePlayerError = () => usePlayerStore((s) => s.error);
export const useBackendKind = () => usePlayerStore((s) => s.backend);
export const useVideoEl = () => usePlayerStore((s) => s.videoEl);
export const usePlaybackRate = () => usePlayerStore((s) => s.rate);

export const useVolumeState = () =>
  usePlayerStore(useShallow((s) => ({ volume: s.volume, muted: s.muted })));

export const useTrackState = () =>
  usePlayerStore(
    useShallow((s) => ({
      tracks: s.tracks,
      selectedAudioId: s.selectedAudioId,
      selectedSubtitleId: s.selectedSubtitleId,
    })),
  );

/**
 * Actions are stable across renders, so pulling them does not subscribe the
 * component to any state at all.
 */
export const usePlayerActions = () =>
  usePlayerStore(
    useShallow((s) => ({
      togglePlay: s.togglePlay,
      play: s.play,
      pause: s.pause,
      seek: s.seek,
      seekBy: s.seekBy,
      setVolume: s.setVolume,
      toggleMute: s.toggleMute,
      setRate: s.setRate,
      selectAudioTrack: s.selectAudioTrack,
      selectSubtitleTrack: s.selectSubtitleTrack,
      openSource: s.openSource,
      closeSource: s.closeSource,
      clearError: s.clearError,
    })),
  );
