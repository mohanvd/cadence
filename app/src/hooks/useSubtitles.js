import { useState, useCallback, useRef, useEffect } from 'react';
import { loadSubtitleFile } from '../utils/subtitles';

const STORAGE_KEY = 'cadence-subtitle-style';

const DEFAULT_STYLE = {
  fontSize: '18px',
  color: '#ffffff',
  background: 'rgba(0, 0, 0, 0.75)',
};

function loadStyle() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return { ...DEFAULT_STYLE, ...JSON.parse(data) };
  } catch { /* ignore */ }
  return { ...DEFAULT_STYLE };
}

/**
 * @param {{ current: HTMLVideoElement|null }} videoRef
 * @param {HTMLVideoElement|null} [videoEl] The live element, passed by identity
 *   so the track is re-attached when a backend swap replaces it. The ref alone
 *   is stable by design and would never re-trigger that.
 */
export function useSubtitles(videoRef, videoEl = null) {
  const [trackUrl, setTrackUrl] = useState(null);
  const [label, setLabel] = useState('Subtitles');
  const [enabled, setEnabled] = useState(false);
  const [offset, setOffset] = useState(0); // in seconds
  const [style, setStyle] = useState(loadStyle);
  const urlRef = useRef(null);
  const styleTagRef = useRef(null);
  const trackElRef = useRef(null);

  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  useEffect(() => () => revokeUrl(), [revokeUrl]);

  /**
   * Attach the cue file to the engine's video element.
   *
   * The engine builds that element outside React and swaps it per backend, so
   * there is no JSX position to render a `<track>` into, so it has to be created
   * and appended here. Without this the rest of the hook runs happily against
   * an empty `textTracks` list and nothing ever appears on screen.
   */
  useEffect(() => {
    const video = videoEl ?? videoRef.current;
    if (!video) return;

    // Remove any track left by a previous file before adding the next.
    if (trackElRef.current?.parentNode) {
      trackElRef.current.remove();
      trackElRef.current = null;
    }
    if (!trackUrl) return;

    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = label;
    track.src = trackUrl;
    track.default = true;
    video.appendChild(track);
    trackElRef.current = track;

    return () => {
      track.remove();
      if (trackElRef.current === track) trackElRef.current = null;
    };
  }, [trackUrl, label, videoEl, videoRef]);

  const syncTrackMode = useCallback(() => {
    const video = videoEl ?? videoRef.current;
    if (!video) return;
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = enabled && trackUrl ? 'showing' : 'hidden';
    }
  }, [enabled, trackUrl, videoEl, videoRef]);

  useEffect(() => {
    syncTrackMode();
    const video = videoEl ?? videoRef.current;
    if (!video) return;
    video.addEventListener('loadedmetadata', syncTrackMode);
    // The track's own load is what actually populates `textTracks`, and it
    // resolves after the effect above appends it.
    const track = trackElRef.current;
    track?.addEventListener('load', syncTrackMode);
    return () => {
      video.removeEventListener('loadedmetadata', syncTrackMode);
      track?.removeEventListener('load', syncTrackMode);
    };
  }, [syncTrackMode, videoEl, videoRef]);

  const loadFile = useCallback(
    async (file) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'srt' && ext !== 'vtt') return false;
      revokeUrl();
      const url = await loadSubtitleFile(file);
      urlRef.current = url;
      setLabel(file.name);
      setTrackUrl(url);
      setEnabled(true);
      setOffset(0);
      return true;
    },
    [revokeUrl]
  );

  const changeOffset = useCallback((delta) => {
    setOffset((prev) => {
      const next = prev + delta;
      // Adjust cues directly
      const video = videoRef.current;
      if (video && video.textTracks && video.textTracks.length > 0) {
        const track = video.textTracks[0];
        const cues = track.cues || track.activeCues;
        if (cues) {
          for (let i = 0; i < cues.length; i++) {
            cues[i].startTime += delta;
            cues[i].endTime += delta;
          }
        }
      }
      return next;
    });
  }, [videoRef]);

  const changeStyle = useCallback((key, value) => {
    setStyle((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Inject dynamic CSS for ::cue
  useEffect(() => {
    let styleEl = styleTagRef.current;
    if (!styleEl) {
      styleEl = document.createElement('style');
      document.head.appendChild(styleEl);
      styleTagRef.current = styleEl;
    }
    
    styleEl.textContent = `
      ::cue {
        font-size: ${style.fontSize} !important;
        color: ${style.color} !important;
        background: ${style.background} !important;
        font-family: Inter, sans-serif !important;
        border-radius: 4px;
        line-height: 1.4;
      }
    `;

    return () => {
      if (styleEl && styleEl.parentNode) {
        styleEl.parentNode.removeChild(styleEl);
      }
      styleTagRef.current = null;
    };
  }, [style]);

  const toggle = useCallback(() => {
    if (!trackUrl) return;
    setEnabled((v) => !v);
  }, [trackUrl]);

  const clear = useCallback(() => {
    revokeUrl();
    setTrackUrl(null);
    setLabel('Subtitles');
    setEnabled(false);
    setOffset(0);
  }, [revokeUrl]);

  return {
    trackUrl,
    label,
    enabled,
    hasSubtitles: !!trackUrl,
    offset,
    style,
    loadFile,
    toggle,
    clear,
    changeOffset,
    changeStyle,
  };
}
