/**
 * Type surface for the legacy JavaScript feature hooks.
 *
 * These hooks are sound and stay in JS for now, but their JSDoc declares only
 * `object` as the return type, which erases every property at the call site.
 * Declaring the real shapes here gives the TypeScript UI full checking without
 * rewriting the implementations, and makes any future port a type-checked
 * refactor rather than a guess.
 */

import type { RefObject } from 'react';

export interface ABRepeatApi {
  pointA: number | null;
  pointB: number | null;
  isActive: boolean;
  setA: (time: number) => void;
  setB: (time: number) => void;
  clear: () => void;
}

export interface BookmarkRecord {
  id: string;
  videoKey: string;
  time: number;
  note: string;
  createdAt: number;
}

export interface BookmarksApi {
  bookmarks: BookmarkRecord[];
  isLoading: boolean;
  add: (time: number, note?: string) => Promise<BookmarkRecord | null>;
  remove: (id: string) => Promise<void>;
  updateNote: (id: string, note: string) => Promise<void>;
  exportAsMarkdown: () => void;
  exportAsText: () => void;
}

export interface SubtitleStyle {
  fontSize: string;
  color: string;
  background: string;
}

export interface SubtitlesApi {
  trackUrl: string | null;
  /** Track name shown in the menu: a filename, or a release name from search. */
  label: string;
  enabled: boolean;
  hasSubtitles: boolean;
  offset: number;
  style: SubtitleStyle;
  loadFile: (file: File) => Promise<boolean>;
  /** Adopts an already-built VTT object URL, taking ownership of it. */
  toggle: () => void;
  clear: () => void;
  changeOffset: (delta: number) => void;
  changeStyle: (key: keyof SubtitleStyle, value: string) => void;
}

export interface EqualizerBand {
  freq: number;
  label: string;
  type: BiquadFilterType;
}

export interface EqualizerPreset {
  name: string;
  gains: number[];
}

export interface EqualizerApi {
  bands: EqualizerBand[];
  gains: number[];
  activePreset: string | null;
  isEnabled: boolean;
  isFlat: boolean;
  initAudio: () => void;
  updateGain: (index: number, value: number) => void;
  applyPreset: (preset: EqualizerPreset) => void;
  resetEQ: () => void;
  toggleEQ: () => void;
}

export interface FilterValues {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
}

export interface FilterPreset {
  name: string;
  values: FilterValues;
}

export interface VideoFiltersApi {
  filters: FilterValues;
  activePreset: string | null;
  isDefault: boolean;
  filterStyle: { filter: string } | undefined;
  updateFilter: (key: keyof FilterValues, value: number) => void;
  applyPreset: (preset: FilterPreset) => void;
  resetFilters: () => void;
}

export interface ZoomPanApi {
  zoom: number;
  pan: { x: number; y: number };
  isZoomed: boolean;
  videoStyle: { transform?: string };
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setZoomLevel: (zoom: number) => void;
  panLeft: () => void;
  panRight: () => void;
  panUp: () => void;
  panDown: () => void;
  panBy: (dx: number, dy: number) => void;
  startPan: (event: unknown) => void;
  onPanMove: (event: unknown) => void;
  endPan: () => void;
}

export interface SleepTimerOption {
  label: string;
  ms: number;
}

export interface SleepTimerApi {
  options: SleepTimerOption[];
  remainingMs: number | null;
  isActive: boolean;
  isUrgent: boolean;
  display: string | null;
  start: (ms: number) => void;
  clear: () => void;
}

type VideoRef = RefObject<HTMLVideoElement | null>;

declare module '@/hooks/useABRepeat' {
  export function useABRepeat(): ABRepeatApi;
}

declare module '@/hooks/useBookmarks' {
  export function useBookmarks(videoKey: string): BookmarksApi;
}

declare module '@/hooks/useSubtitles' {
  export function useSubtitles(
    videoRef: VideoRef,
    videoEl?: HTMLVideoElement | null,
  ): SubtitlesApi;
}

declare module '@/hooks/useEqualizer' {
  export const EQ_PRESETS: EqualizerPreset[];
  export function useEqualizer(videoRef: VideoRef): EqualizerApi;
}

declare module '@/hooks/useVideoFilters' {
  export const FILTER_PRESETS: FilterPreset[];
  export function useVideoFilters(): VideoFiltersApi;
}

declare module '@/hooks/useZoomPan' {
  export function useZoomPan(): ZoomPanApi;
}

declare module '@/hooks/useSleepTimer' {
  export function useSleepTimer(onExpire?: () => void): SleepTimerApi;
}

