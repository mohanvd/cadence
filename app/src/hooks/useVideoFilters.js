import { useCallback, useMemo } from 'react';
import { DEFAULT_FILTERS, useSettings } from '../store/settingsStore';

export const FILTER_PRESETS = [
  { name: 'Normal', values: { ...DEFAULT_FILTERS } },
  { name: 'Vivid', values: { brightness: 105, contrast: 115, saturation: 140, hue: 0 } },
  { name: 'Warm', values: { brightness: 105, contrast: 105, saturation: 110, hue: 15 } },
  { name: 'Cool', values: { brightness: 100, contrast: 105, saturation: 95, hue: -15 } },
  { name: 'Cinema', values: { brightness: 95, contrast: 120, saturation: 85, hue: 0 } },
  { name: 'B&W', values: { brightness: 105, contrast: 110, saturation: 0, hue: 0 } },
  { name: 'Sepia', values: { brightness: 100, contrast: 100, saturation: 40, hue: 30 } },
  { name: 'High Contrast', values: { brightness: 100, contrast: 140, saturation: 100, hue: 0 } },
  { name: 'Night Mode', values: { brightness: 80, contrast: 110, saturation: 80, hue: 0 } },
];

/**
 * Hook for video CSS filters: brightness, contrast, saturation, hue-rotate.
 *
 * The values live in the settings store, so the player and the Settings screen
 * are looking at one set of them: a slider moved in Settings changes the film
 * paused behind it.
 */
export function useVideoFilters() {
  const filters = useSettings((s) => s.filters);
  const activePreset = useSettings((s) => s.filterPreset);
  const set = useSettings((s) => s.set);

  const updateFilter = useCallback(
    (key, value) => {
      set({ filters: { ...useSettings.getState().filters, [key]: value }, filterPreset: null });
    },
    [set],
  );

  const applyPreset = useCallback(
    (preset) => set({ filters: { ...preset.values }, filterPreset: preset.name }),
    [set],
  );

  const resetFilters = useCallback(
    () => set({ filters: { ...DEFAULT_FILTERS }, filterPreset: 'Normal' }),
    [set],
  );

  const isDefault = useMemo(() => {
    return (
      filters.brightness === 100 &&
      filters.contrast === 100 &&
      filters.saturation === 100 &&
      filters.hue === 0
    );
  }, [filters]);

  const filterStyle = useMemo(() => {
    if (isDefault) return undefined;
    return {
      filter: [
        filters.brightness !== 100 && `brightness(${filters.brightness}%)`,
        filters.contrast !== 100 && `contrast(${filters.contrast}%)`,
        filters.saturation !== 100 && `saturate(${filters.saturation}%)`,
        filters.hue !== 0 && `hue-rotate(${filters.hue}deg)`,
      ]
        .filter(Boolean)
        .join(' '),
    };
  }, [filters, isDefault]);

  return {
    filters,
    activePreset,
    isDefault,
    filterStyle,
    updateFilter,
    applyPreset,
    resetFilters,
  };
}
