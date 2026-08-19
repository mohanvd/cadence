import { useState, useCallback, useEffect, useMemo } from 'react';
import { EQ_BANDS, audioChain } from '../engine/audioChain';

/**
 * Bass, voice clarity and the rest, as bands on the shared audio graph.
 *
 * The filters are not built here. An element can be captured by Web Audio
 * exactly once, and this hook used to spend that capture on its own context;
 * the amplifier then found the element already taken and did nothing, silently,
 * and if the amplifier got there first this did nothing instead. Both now set
 * their part of one graph, which also fixes the ordering: a band lifted by
 * 8 dB clips exactly like an amplifier does, and the limiter at the end of the
 * chain now sees it.
 */

const STORAGE_KEY = 'cadence-audio-eq';

const BANDS = EQ_BANDS;

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
  const saved = useMemo(() => loadEQ(), []);
  const [gains, setGains] = useState(saved.gains);
  const [activePreset, setActivePreset] = useState(saved.preset);
  const [isEnabled, setIsEnabled] = useState(false);

  const isFlat = useMemo(() => gains.every((g) => g === 0), [gains]);

  /** Route the audio through the graph and apply the stored curve to it. */
  const initAudio = useCallback(() => {
    if (!audioChain.ensure()) return;
    gains.forEach((g, i) => audioChain.setEqGain(i, g));
    setIsEnabled(true);
  }, [gains]);

  // Update filter gains in real-time
  const updateGain = useCallback((index, value) => {
    const clamped = Math.max(-12, Math.min(12, value));
    setGains((prev) => {
      const next = [...prev];
      next[index] = clamped;
      saveEQ(next, null);

      audioChain.setEqGain(index, clamped);
      return next;
    });
    setActivePreset(null);
  }, []);

  const applyPreset = useCallback((preset) => {
    setGains([...preset.gains]);
    setActivePreset(preset.name);
    saveEQ(preset.gains, preset.name);

    preset.gains.forEach((g, i) => audioChain.setEqGain(i, g));
  }, []);

  const resetEQ = useCallback(() => {
    setGains([...DEFAULT_GAINS]);
    setActivePreset('Flat');
    saveEQ(DEFAULT_GAINS, 'Flat');

    DEFAULT_GAINS.forEach((g, i) => audioChain.setEqGain(i, g));
  }, []);

  // Toggle EQ on/off
  const toggleEQ = useCallback(() => {
    if (!isEnabled) {
      initAudio();
      return;
    }
    // Flattened rather than unrouted: the graph cannot be taken back out, and
    // flat bands are transparent, so this is off in every sense that is
    // audible.
    BANDS.forEach((_, i) => audioChain.setEqGain(i, 0));
    setIsEnabled(false);
  }, [isEnabled, initAudio]);

  /*
   * Forget that the equalizer was on when the file changes.
   *
   * The graph itself follows the element without help now, but its bands are
   * rebuilt flat for the new one, so a menu still claiming "on" would be
   * describing a curve that is not being applied.
   */
  const element = videoRef.current ?? null;
  useEffect(() => {
    if (!element) return undefined;
    return () => setIsEnabled(false);
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
