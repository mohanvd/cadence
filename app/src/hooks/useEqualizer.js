import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

/**
 * Audio equalizer hook using Web Audio API.
 * Provides bass boost, voice clarity, and custom EQ bands.
 */

const STORAGE_KEY = 'cadence-audio-eq';

const BANDS = [
  { freq: 60, label: '60', type: 'lowshelf' },
  { freq: 250, label: '250', type: 'peaking' },
  { freq: 1000, label: '1K', type: 'peaking' },
  { freq: 4000, label: '4K', type: 'peaking' },
  { freq: 16000, label: '16K', type: 'highshelf' },
];

const DEFAULT_GAINS = [0, 0, 0, 0, 0];

export const EQ_PRESETS = [
  { name: 'Flat', gains: [0, 0, 0, 0, 0] },
  { name: 'Bass Boost', gains: [8, 5, 0, 0, 0] },
  { name: 'Voice Clarity', gains: [-2, 0, 4, 6, 2] },
  { name: 'Treble Boost', gains: [0, 0, 0, 4, 7] },
  { name: 'Cinema', gains: [5, 3, 0, 3, 5] },
  { name: 'Podcast', gains: [-3, 0, 5, 4, 0] },
  { name: 'Loudness', gains: [6, 3, -1, 3, 6] },
];

function loadEQ() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed.gains) && parsed.gains.length === 5) return parsed;
    }
  } catch { /* ignore */ }
  return { gains: [...DEFAULT_GAINS], preset: 'Flat' };
}

function saveEQ(gains, preset) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ gains, preset }));
  } catch { /* ignore */ }
}

export function useEqualizer(videoRef) {
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const filtersRef = useRef([]);
  const connectedRef = useRef(false);

  const saved = useMemo(() => loadEQ(), []);
  const [gains, setGains] = useState(saved.gains);
  const [activePreset, setActivePreset] = useState(saved.preset);
  const [isEnabled, setIsEnabled] = useState(false);

  const isFlat = useMemo(() => gains.every((g) => g === 0), [gains]);

  // Initialize Web Audio API
  const initAudio = useCallback(() => {
    const video = videoRef.current;
    if (!video || connectedRef.current) return;

    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaElementSource(video);

      const filters = BANDS.map((band, i) => {
        const filter = ctx.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = band.freq;
        filter.gain.value = gains[i];
        if (band.type === 'peaking') {
          filter.Q.value = 1.4;
        }
        return filter;
      });

      // Chain: source → filter0 → filter1 → ... → destination
      source.connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1]);
      }
      filters[filters.length - 1].connect(ctx.destination);

      // A context created while the page is still gesture-gated starts
      // suspended, and a suspended context routes the audio nowhere: silence
      // rather than an unequalised signal.
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      audioCtxRef.current = ctx;
      sourceRef.current = source;
      filtersRef.current = filters;
      connectedRef.current = true;
      setIsEnabled(true);
    } catch (err) {
      console.warn('Equalizer: Could not initialize Web Audio API', err);
    }
  }, [videoRef, gains]);

  // Update filter gains in real-time
  const updateGain = useCallback((index, value) => {
    const clamped = Math.max(-12, Math.min(12, value));
    setGains((prev) => {
      const next = [...prev];
      next[index] = clamped;
      saveEQ(next, null);

      // Apply to audio filter
      const filter = filtersRef.current[index];
      if (filter) {
        filter.gain.value = clamped;
      }

      return next;
    });
    setActivePreset(null);
  }, []);

  const applyPreset = useCallback((preset) => {
    setGains([...preset.gains]);
    setActivePreset(preset.name);
    saveEQ(preset.gains, preset.name);

    // Apply to audio filters
    preset.gains.forEach((g, i) => {
      const filter = filtersRef.current[i];
      if (filter) filter.gain.value = g;
    });
  }, []);

  const resetEQ = useCallback(() => {
    setGains([...DEFAULT_GAINS]);
    setActivePreset('Flat');
    saveEQ(DEFAULT_GAINS, 'Flat');

    filtersRef.current.forEach((filter) => {
      filter.gain.value = 0;
    });
  }, []);

  // Toggle EQ on/off
  const toggleEQ = useCallback(() => {
    if (!connectedRef.current) {
      initAudio();
      return;
    }

    if (isEnabled) {
      // Bypass: set all gains to 0
      filtersRef.current.forEach((f) => {
        f.gain.value = 0;
      });
      setIsEnabled(false);
    } else {
      // Restore gains
      gains.forEach((g, i) => {
        const filter = filtersRef.current[i];
        if (filter) filter.gain.value = g;
      });
      setIsEnabled(true);
    }
  }, [isEnabled, gains, initAudio]);

  /*
   * Tear the graph down when the element it was built on goes away.
   *
   * `createMediaElementSource` binds permanently to one element, so after a
   * file switch the old chain is wired to a node that no longer exists while
   * the new element plays straight to the speakers. Without this the menu kept
   * claiming the equalizer was on and every band did nothing. Resetting the
   * state is honest: the next file starts with the equalizer off, and enabling
   * it rebuilds the chain against the element that is actually playing.
   */
  const element = videoRef.current ?? null;
  useEffect(() => {
    if (!element) return undefined;
    return () => {
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== 'closed') {
        try {
          ctx.close();
        } catch { /* ignore */ }
      }
      audioCtxRef.current = null;
      sourceRef.current = null;
      filtersRef.current = [];
      connectedRef.current = false;
      setIsEnabled(false);
    };
  }, [element]);

  return {
    bands: BANDS,
    gains,
    activePreset,
    isEnabled,
    isFlat,
    initAudio,
    updateGain,
    applyPreset,
    resetEQ,
    toggleEQ,
  };
}
