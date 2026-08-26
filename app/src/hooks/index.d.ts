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
  /** Key into the overlay's font stacks: `sans`, `serif`, `mono`, `rounded`. */
  family: string;
  /** Percent of the player's own base size. */
  size: number;
  /** `#rrggbb`. */
  color: string;
  /** Percent. */
  opacity: number;
  /** `#rrggbb`. */
  backgroundColor: string;
  /** Percent. Zero is no backdrop at all, which the edge style makes usable. */
  backgroundOpacity: number;
  /** How the glyphs are separated from the picture: `none`, `shadow`,
   *  `outline`, `raised`. */
  edge: string;
}

/** Every value each appearance setting may take, in menu order. */
export type SubtitleOption<T> = { value: T; label: string };


/** A subtitle track that is a script, with the fonts it asks for. */
export interface SubtitleScript {
  /** The ASS document itself. */
  text: string;
  /** URLs of the fonts the film carries for it. */
  fonts: string[];
  /**
   * Every font on this machine, by name. For the faces a script names and
   * assumes are installed, which the webview may not read for itself.
   */
  installed: Record<string, string>;
}

/** One drawn subtitle, and where on the authoring canvas it belongs. */
export interface PictureCue {
  start: number;
  end: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The picture itself, served by the shell and fetched as it comes due. */
  url: string;
}

/** A subtitle track made of pictures, with the canvas it was drawn against. */
export interface PictureTrack {
  width: number;
  height: number;
  cues: PictureCue[];
}

export interface SubtitlesApi {
  trackUrl: string | null;
  /**
   * The parsed track, held `hidden` so it maintains `activeCues` without the
   * browser painting them. Cadence draws the cues itself.
   */
  textTrack: TextTrack | null;
  /** Track name shown in the menu: a filename, or a release name from search. */
  label: string;
  /**
   * Which source the showing cues came from: `'file'` for one opened from
   * disk, a demuxer stream index for one lifted out of the video, null for
   * none. The menu marks its active entry from this rather than from the
   * label, which two tracks in one film routinely share.
   */
  sourceId: string | null;
  /** True while a track is being lifted out of the container. */
  loading: boolean;
  /**
   * The id of the track currently being extracted, or null. Distinct from
   * `sourceId`, which still names whatever is on screen until it lands.
   */
  pendingId: string | null;
  enabled: boolean;
  /**
   * The showing track, when it is pictures rather than words, what a Blu-ray
   * carries. Never set at the same time as `textTrack`: one is a track the
   * browser parses, the other a list the overlay walks itself.
   */
  pictures: PictureTrack | null;
  /**
   * The showing track, when it is a script, ASS or SSA, that carries its own
   * drawing. Never set at the same time as the other two.
   */
  script: SubtitleScript | null;
  hasSubtitles: boolean;
  offset: number;
  style: SubtitleStyle;
  loadFile: (file: File) => Promise<boolean>;
  /** Extract a subtitle stream from the file being played, and show it. */
  loadEmbedded: (
    path: string,
    index: number,
    label: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** The same, for a stream whose subtitles are a script libass draws. */
  loadScript: (
    path: string,
    index: number,
    label: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** The same, for a stream whose subtitles are pictures. */
  loadPictures: (
    path: string,
    index: number,
    label: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  toggle: () => void;
  clear: () => void;
  changeOffset: (delta: number) => void;
  changeStyle: <K extends keyof SubtitleStyle>(key: K, value: SubtitleStyle[K]) => void;
  resetStyle: () => void;
  /** True while every appearance setting is still at its shipped value. */
  isStyleDefault: boolean;
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

declare module '@/hooks/useBookmarks' {
  export function useBookmarks(videoKey: string): BookmarksApi;
}

declare module '@/hooks/useSubtitles' {
  export const SUBTITLE_OPTIONS: {
    [K in keyof SubtitleStyle]: SubtitleOption<SubtitleStyle[K]>[];
  };
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

