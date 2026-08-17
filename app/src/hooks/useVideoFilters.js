import { useState, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'cadence-video-filters';

const DEFAULT_FILTERS = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
};

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

function loadFilters() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return { ...DEFAULT_FILTERS, ...JSON.parse(data) };
  } catch { /* ignore */ }
  return { ...DEFAULT_FILTERS };
}

function saveFilters(filters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch { /* ignore */ }
}

/**
 * Hook for video CSS filters: brightness, contrast, saturation, hue-rotate.
 */
export function useVideoFilters() {
  const [filters, setFilters] = useState(loadFilters);
  const [activePreset, setActivePreset] = useState('Normal');

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      saveFilters(next);
      return next;
    });
    setActivePreset(null);
  }, []);

  const applyPreset = useCallback((preset) => {
    setFilters({ ...preset.values });
    saveFilters(preset.values);
    setActivePreset(preset.name);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
    saveFilters(DEFAULT_FILTERS);
    setActivePreset('Normal');
  }, []);

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
