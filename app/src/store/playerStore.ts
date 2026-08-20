import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { createEngine, describeBackend } from '@/engine/createEngine';
import { decodes, markUndecodable } from '@/engine/decoding';
import { MAX_BOOST } from '@/engine/audioChain';
import { fileIsThere } from '@/lib/desktop';
import type { ProbeOptions } from '@/engine/probe';
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
  /** Amplification past full volume. 1 is untouched. */
  boost: number;
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
  /**
   * Whether this source's audio can be routed through Web Audio.
   *
   * False for one case only: a link the browser plays directly. Both the
   * amplifier and the equalizer work by routing the element, and a
   * cross-origin file without permission answers that by going silent rather
   * than by refusing, so this has to be known before either is offered rather
   * than after.
   */
  canProcessAudio: boolean;
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
  setBoost: (multiplier: number) => void;
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
  boost: 1,
  rate: 1,
};

/**
 * What should actually reach the speakers.
 *
 * The slider is a fraction and the boost is the ceiling it runs to, so full
 * slider at 3x is three times, and a third of the slider at 3x is exactly
 * normal volume. Multiplying rather than stacking is what keeps the slider
 * meaningful while the amplifier is on: without it the control that is used
 * constantly would sit there governing only the first third of the range.
 */
function gainOf(volume: number, boost: number, canProcess: boolean): number {
  return volume * (canProcess ? boost : 1);
}

/** Token guarding against a slow probe resolving after a newer one started. */
let loadToken = 0;

/**
 * How many times a failed open is allowed to change its mind.
 *
 * One for "the browser cannot really decode this after all", which puts FFmpeg
 * in front of the file, and one for "and it cannot decode what FFmpeg copied
 * out either", which converts that stream instead of copying it. Past two the
 * file is genuinely unplayable, and saying so is more use than trying again.
 */
const MAX_RECOVERIES = 2;

/**
 * Record what a failed attempt just proved.
 *
 * Recovery is not a special case anywhere else in the engine: inspection is
 * pure, and the only reason a second look at the same file reaches a different
 * answer is that this ran in between. It returns the options for the next
 * attempt, or null when it has nothing left to learn and the failure is real.
 */
function learn(
  source: MediaSourceInput,
  probe: ProbeResult,
  forceStream: boolean,
): { forceStream: boolean } | null {
  const video = probe.tracks.find((track) => track.type === 'video');
  const audio = probe.tracks.find((track) => track.type === 'audio');

  /* Distrust whichever stream was being handed over untouched, video first:
     it is the one browsers are wrong about, and the one that costs the most to
     convert when they are not. */
  if (probe.copyVideo && video && decodes(video.codec)) {
    markUndecodable(video.codec);
    return { forceStream };
  }
  if (probe.copyAudio && audio && decodes(audio.codec)) {
    markUndecodable(audio.codec);
    return { forceStream };
  }

  /* A link, which is handed straight to the browser without being inspected.
     There is no codec to distrust, so the answer is the blunt one: look at it
     properly and put FFmpeg in front of it.

     Only a link. A *path* with no tracks is one ffprobe already failed to read,
     and FFmpeg will not read it any better on a second pass — retrying there
     would replace the browser's description of what is wrong with a worse
     one. */
  if (!forceStream && source.kind === 'url' && probe.tracks.length === 0) {
    return { forceStream: true };
  }

  return null;
}

/**
 * One go at opening a source, with whatever the previous go taught us.
 *
 * Separate from `openSource` so a failure can simply do it again: everything
 * from the inspection down is rebuilt, which is what makes a retry honest
 * rather than a patch applied to a half-built engine.
 */
async function attempt(
  source: MediaSourceInput,
  container: HTMLElement,
  token: number,
  options: ProbeOptions,
  recoveries: number,
): Promise<void> {
  const set = usePlayerStore.setState;
  const get = usePlayerStore.getState;

  // Tear the previous engine down first so its decoder buffers are released
  // before the next one allocates.
  get().engine?.destroy();
  set({
    ...INITIAL,
    loading: true,
    engine: null,
    videoEl: null,
    source,
    probe: null,
    backend: null,
    canProcessAudio: true,
    tracks: [],
    selectedAudioId: null,
    selectedSubtitleId: null,
    error: null,
  });

  let created;
  try {
    created = await createEngine(source, options);
  } catch (err) {
    if (token !== loadToken) return;
    const said = err instanceof Error ? err.message : 'Could not open this file.';
    void whyItFailed(source, said).then((reason) => {
      if (token === loadToken) set({ loading: false, error: reason });
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
      /* Volume is not mirrored back. The store is the only thing that sets it,
         and what the backend holds is the gain, which is the slider times the
         boost; writing that into the slider's own value would move it. */
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
    /* Subtitles come from the probe whichever backend is running, because no
       backend produces them. The fragments carry picture and sound and drop
       the rest, and a native element hides whatever the container held, so a
       backend reporting its own tracks has still only described what it plays.
       The subtitle entries are FFmpeg's to extract when one is chosen, and
       dropping them here is what would make an MP4 with subtitles inside it
       look like an MP4 without any. */
    const subtitles = probe.tracks.filter((track) => track.type === 'subtitle');
    /* The backend's own list is taken for picture and sound and discarded for
       subtitles, rather than appended to. A backend built from the probe is
       already carrying the probe's subtitle entries, so adding them was listing
       every track in the file twice. Replacing instead of merging is right
       whichever backend answered: the entries can only have come from the probe
       in the first place. */
    const played = tracks.filter((track) => track.type !== 'subtitle');
    const merged = played.length > 0 ? [...played, ...subtitles] : probe.tracks;
    set({
      duration: resolved,
      tracks: merged,
      selectedAudioId:
        merged.find((t) => t.type === 'audio' && t.playable)?.id ?? null,
    });
  });

  engine.on('error', ({ message, fatal }) => {
    if (token !== loadToken) return;

    /* A fatal error here is usually not the file's fault but the routing's:
       the browser said it would take a codec and then would not. Ask again
       knowing that, rather than showing an apology built on the same wrong
       assumption. */
    if (fatal && recoveries < MAX_RECOVERIES) {
      /* Except when the file has gone. A codec verdict is learned from a
         failure and kept for good, and a file that is not on the disk is a
         failure that says nothing about any codec — but it looks identical
         from in here, because the browser reports what it cannot fetch and
         what it cannot decode as the same error. Distrusting H.264 because
         somebody deleted one H.264 file is how every film afterwards ends up
         re-encoded, permanently, for a reason nobody can see. */
      void stillOnDisk(source).then((there) => {
        if (token !== loadToken) return;
        const next = there ? learn(source, probe, options.forceStream ?? false) : null;
        if (next) {
          void attempt(source, container, token, next, recoveries + 1);
          return;
        }
        void whyItFailed(source, message).then((reason) => {
          if (token === loadToken) set({ error: reason, loading: false });
        });
      });
      return;
    }

    void whyItFailed(source, message).then((reason) => {
      if (token === loadToken) set({ error: reason, loading: false });
    });
  });

  engine.attach(container);
  // Publish the element only after attach, when the backend has created it.
  /* A link handed straight to the browser is the only source that cannot be
     amplified. The same link routed through FFmpeg can be: what reaches the
     element then is a buffer built in this document, which carries this page's
     origin no matter where the bytes came from. */
  const canProcessAudio = !(source.kind === 'url' && probe.backend === 'native');

  set({
    engine,
    videoEl: engine.getVideoElement(),
    probe,
    backend: probe.backend,
    tracks: probe.tracks,
    canProcessAudio,
  });

  /* Hand the new engine what the store already holds.
     
     Volume is a preference restored from disk the moment the file key changes,
     which is before this engine exists and before anything knows whether the
     source can be amplified. Pushing it here rather than relying on that order
     is what makes a remembered boost survive into the next film, and what
     stops one being shown on a file that cannot take it. Set directly rather
     than through the action, which would also unmute. */
  /* The stored preference reaches the engine only when this source can carry
     it; the store keeps it either way. */
  engine.setVolume(gainOf(get().volume, get().boost, canProcessAudio));
  engine.setMuted(get().muted);

  try {
    await engine.load(source);
    if (token !== loadToken) return;

    /* Then start it.
       
       Opening a film and being handed a still of its first frame is not what
       double-clicking a video means anywhere else, and it is not what this
       application's own front page says happens. The call is allowed to fail:
       an engine that will not start without a gesture leaves the picture
       exactly where it is, which is where it would have been anyway. */
    void engine.play().catch(() => {});
  } catch (err) {
    if (token !== loadToken) return;
    const said = err instanceof Error ? err.message : 'Playback failed.';
    void whyItFailed(source, said).then((reason) => {
      if (token === loadToken) set({ loading: false, error: reason });
    });
  }
}

/**
 * Why a file would not play, checked against the disk before it is repeated.
 *
 * The browser reports a file it cannot fetch and a file it cannot decode as
 * the same failure — an unsupported source — so a video that has been deleted,
 * renamed, or left on an external disk that is no longer plugged in used to be
 * explained as an unsupported format. That is an answer to a question nobody
 * asked, and it sends the reader to look for a codec rather than for the file.
 *
 * Only paths are checked. A link that will not load has its own reasons and
 * this is not one of them.
 */
async function whyItFailed(source: MediaSourceInput, message: string): Promise<string> {
  if (await stillOnDisk(source)) return message;
  return 'It is not where it was. The file may have been moved, renamed, or deleted since it was last opened.';
}

/**
 * Whether the failure could have been about the file's contents at all.
 *
 * True for anything that is not a path, because a link has its own reasons and
 * the shell cannot look at it.
 */
async function stillOnDisk(source: MediaSourceInput): Promise<boolean> {
  if (source.kind !== 'path') return true;
  return fileIsThere(source.path);
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  ...INITIAL,
  engine: null,
  videoEl: null,
  source: null,
  probe: null,
  backend: null,
  canProcessAudio: true,
  tracks: [],
  selectedAudioId: null,
  selectedSubtitleId: null,
  error: null,

  openSource: async (source, container) => {
    const token = ++loadToken;
    await attempt(source, container, token, {}, 0);
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
      canProcessAudio: true,
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
    engine?.setVolume(gainOf(clamped, get().boost, get().canProcessAudio));
    // Raising the volume from a muted state should unmute, matching how every
    // desktop player behaves.
    if (clamped > 0 && get().muted) engine?.setMuted(false);
    set({ volume: clamped });
  },

  setBoost: (multiplier) => {
    /* Kept as asked for, and only ignored at the engine.
       
       This is a preference about a machine or a badly mastered recording, and
       a link that happens to be unroutable is not a reason to forget it:
       writing 1 here would be written straight to disk and the setting would
       be gone for every file afterwards. */
    const clamped = Math.max(1, Math.min(MAX_BOOST, multiplier));
    set({ boost: clamped });
    get().engine?.setVolume(gainOf(get().volume, clamped, get().canProcessAudio));
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

/**
 * How playback is happening, in words rather than in the backend's own name.
 *
 * Null for the ordinary case, where the browser opened the file itself: a badge
 * reading "Direct" on almost every file is furniture, and the point of showing
 * this at all is that the other cases are worth noticing.
 */
export const usePlaybackLabel = () =>
  usePlayerStore((s) => (s.probe && s.probe.backend !== 'native' ? describeBackend(s.probe) : null));
export const useVideoEl = () => usePlayerStore((s) => s.videoEl);
export const usePlaybackRate = () => usePlayerStore((s) => s.rate);

export const useVolumeState = () =>
  usePlayerStore(
    useShallow((s) => ({
      volume: s.volume,
      muted: s.muted,
      // The badge must not claim an amplification this source cannot take.
      boost: s.canProcessAudio ? s.boost : 1,
    })),
  );

export const useAudioProcessing = () =>
  usePlayerStore(
    useShallow((s) => ({ boost: s.boost, canProcessAudio: s.canProcessAudio })),
  );

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
      setBoost: s.setBoost,
      toggleMute: s.toggleMute,
      setRate: s.setRate,
      selectAudioTrack: s.selectAudioTrack,
      selectSubtitleTrack: s.selectSubtitleTrack,
      openSource: s.openSource,
      closeSource: s.closeSource,
      clearError: s.clearError,
    })),
  );
