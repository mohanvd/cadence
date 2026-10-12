import { useState, useCallback, useEffect, useMemo } from 'react';
import { EQ_BANDS, audioChain } from '../engine/audioChain';
import { DEFAULT_EQ_GAINS, useSettings } from '../store/settingsStore';

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

const BANDS = EQ_BANDS;

export const EQ_PRESETS = [
  { name: 'Flat', gains: [0, 0, 0, 0, 0] },
  { name: 'Bass Boost', gains: [8, 5, 0, 0, 0] },
  { name: 'Voice Clarity', gains: [-2, 0, 4, 6, 2] },
  { name: 'Treble Boost', gains: [0, 0, 0, 4, 7] },
  { name: 'Cinema', gains: [5, 3, 0, 3, 5] },
  { name: 'Podcast', gains: [-3, 0, 5, 4, 0] },
  { name: 'Loudness', gains: [6, 3, -1, 3, 6] },
];

/*
 * The curve is kept in the settings store rather than here, so that the one
 * the Settings screen shows is the one the player applies. Whether the
 * equalizer is on is not: switching it on routes the audio through Web Audio,
 * which is a step taken per film, from the player.
 */
export function useEqualizer(videoRef) {
  const gains = useSettings((s) => s.eqGains);
  const activePreset = useSettings((s) => s.eqPreset);
  const set = useSettings((s) => s.set);
  const [isEnabled, setIsEnabled] = useState(false);

  const isFlat = useMemo(() => gains.every((g) => g === 0), [gains]);

  /** Route the audio through the graph and apply the stored curve to it. */
  const initAudio = useCallback(async () => {
    if (!(await audioChain.ensure())) return;
    gains.forEach((g, i) => audioChain.setEqGain(i, g));
    setIsEnabled(true);
  }, [gains]);

  /* The curve is applied wherever it was changed from, this menu or the
     Settings screen, for as long as the equalizer is on. Off, the bands stay
     flat whatever the curve says. */
  useEffect(() => {
    if (!isEnabled) return;
    gains.forEach((g, i) => audioChain.setEqGain(i, g));
  }, [gains, isEnabled]);

  const updateGain = useCallback(
    (index, value) => {
      const clamped = Math.max(-12, Math.min(12, value));
      const next = [...useSettings.getState().eqGains];
      next[index] = clamped;
      set({ eqGains: next, eqPreset: null });
    },
    [set],
  );

  const applyPreset = useCallback(
    (preset) => set({ eqGains: [...preset.gains], eqPreset: preset.name }),
    [set],
  );

  const resetEQ = useCallback(
    () => set({ eqGains: [...DEFAULT_EQ_GAINS], eqPreset: 'Flat' }),
    [set],
  );

  // Toggle EQ on/off
  const toggleEQ = useCallback(() => {
    if (!isEnabled) {
      void initAudio();
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
