import * as React from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { computeMovieHash } from '@/utils/movieHash';
import { srtToVtt } from '@/utils/subtitles';
import { API_BASE } from '@/lib/apiBase';

/**
 * Subtitle search against OpenSubtitles, through this app's own proxy.
 *
 * The proxy exists because the API key must not ship to the browser; see
 * `api/subtitles.ts`. On the web it is a same-origin endpoint; from inside the
 * desktop application it is a cross-origin call to the deployment, which is why
 * the requests are prefixed rather than bare: see `lib/apiBase.js`.
 *
 * Two things make the results actually useful rather than a wall of guesses:
 *
 *  - A local file is hashed first, and the hash is sent alongside the title.
 *    A hash match is a subtitle timed to this exact encode, so it lands in sync
 *    instead of needing the offset nudged by hand.
 *  - The filename is cleaned before it is used as a query. Release names are
 *    full of tokens (resolution, codec, group) that match nothing upstream
 *    and actively push the right title out of the results.
 */

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'Arabic' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'de', label: 'German' },
  { code: 'tr', label: 'Turkish' },
] as const;

export const SUBTITLE_LANGUAGES = LANGUAGES;

const LANGUAGE_KEY = 'cadence-subtitle-language';

export interface OnlineSubtitle {
  fileId: number;
  name: string;
  language: string;
  release: string;
  downloads: number;
  hashMatch: boolean;
}

export interface OnlineSubtitlesApi {
  /** Null until a search has been run. */
  results: OnlineSubtitle[] | null;
  searching: boolean;
  /** The id currently being downloaded, so one row can show a spinner. */
  downloadingId: number | null;
  error: string;
  language: string;
  setLanguage: (code: string) => void;
  /** The cleaned title the search will use, shown so the user can correct it. */
  query: string;
  setQuery: (value: string) => void;
  search: () => Promise<void>;
  /** Fetch and apply a result. Resolves true when the track was loaded. */
  pick: (subtitle: OnlineSubtitle) => Promise<boolean>;
}

/**
 * Strip release noise from a filename to get something searchable.
 *
 * Everything from the first resolution/source/codec token onward is release
 * metadata, so the title is whatever precedes it.
 */
export function cleanTitle(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, '');
  const normalised = withoutExtension.replace(/[._]+/g, ' ');
  const cut = normalised.split(
    /\b(?:\d{3,4}p|720|1080|2160|4k|x26[45]|h ?26[45]|hevc|bluray|blu ray|web ?dl|webrip|hdrip|dvdrip|brrip|hdtv|remux|aac|ac3|dts|hdr|10bit)\b/i,
  )[0]!;
  return cut.replace(/[-([{].*$/, '').replace(/\s+/g, ' ').trim() || normalised.trim();
}

function loadLanguage(): string {
  try {
    return localStorage.getItem(LANGUAGE_KEY) || 'en';
  } catch {
    return 'en';
  }
}

export interface OnlineSubtitleOptions {
  /** Applies a VTT object URL as the active track. */
  applyTrack: (url: string, label: string) => void;
}

export function useOnlineSubtitles({ applyTrack }: OnlineSubtitleOptions): OnlineSubtitlesApi {
  const source = usePlayerStore((s) => s.source);

  const [results, setResults] = React.useState<OnlineSubtitle[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [downloadingId, setDownloadingId] = React.useState<number | null>(null);
  const [error, setError] = React.useState('');
  const [language, setLanguageState] = React.useState(loadLanguage);
  const [query, setQuery] = React.useState('');

  /* Reset to a title derived from the new file. Editing the box then sticks
     until the file changes, which is what makes a manual correction usable. */
  React.useEffect(() => {
    setQuery(source ? cleanTitle(source.name) : '');
    setResults(null);
    setError('');
  }, [source]);

  const setLanguage = React.useCallback((code: string) => {
    setLanguageState(code);
    try {
      localStorage.setItem(LANGUAGE_KEY, code);
    } catch {
      /* ignore */
    }
    // A language change invalidates the visible results, and leaving them up
    // next to a different language selector is worse than showing nothing.
    setResults(null);
  }, []);

  const search = React.useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Enter something to search for.');
      return;
    }

    setSearching(true);
    setError('');
    setResults(null);

    try {
      const params = new URLSearchParams({
        action: 'search',
        query: trimmed,
        languages: language,
      });

      // Only a local file can be hashed; a URL source has no bytes to read
      // without downloading the whole thing first.
      if (source?.kind === 'file') {
        const hash = await computeMovieHash(source.file);
        if (hash) params.set('moviehash', hash);
      }

      const response = await fetch(`${API_BASE}/api/subtitles?${params}`);
      const body = (await response.json()) as { results?: OnlineSubtitle[]; error?: string };

      if (!response.ok) {
        setError(body.error ?? 'Subtitle search failed.');
        return;
      }

      const found = body.results ?? [];
      // Exact-release matches first; popularity decides the rest.
      found.sort((a, b) => {
        if (a.hashMatch !== b.hashMatch) return a.hashMatch ? -1 : 1;
        return b.downloads - a.downloads;
      });
      setResults(found);
      if (found.length === 0) setError('No subtitles found for that title.');
    } catch {
      setError('Could not reach the subtitle service.');
    } finally {
      setSearching(false);
    }
  }, [query, language, source]);

  const pick = React.useCallback(
    async (subtitle: OnlineSubtitle) => {
      setDownloadingId(subtitle.fileId);
      setError('');
      try {
        const response = await fetch(
          `${API_BASE}/api/subtitles?action=download&file_id=${subtitle.fileId}`,
        );

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? 'Could not download that subtitle.');
          return false;
        }

        const text = await response.text();
        // OpenSubtitles serves SubRip; the element only understands WebVTT.
        const vtt = text.trimStart().startsWith('WEBVTT') ? text : srtToVtt(text);
        const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
        applyTrack(url, subtitle.name);
        return true;
      } catch {
        setError('Could not download that subtitle.');
        return false;
      } finally {
        setDownloadingId(null);
      }
    },
    [applyTrack],
  );

  return {
    results,
    searching,
    downloadingId,
    error,
    language,
    setLanguage,
    query,
    setQuery,
    search,
    pick,
  };
}
