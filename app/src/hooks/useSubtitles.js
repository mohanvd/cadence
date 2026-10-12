import { useState, useCallback, useRef, useEffect } from 'react';
import { decodeSubtitle, loadSubtitleFile } from '../utils/subtitles';
import { DEFAULT_SUBTITLE_STYLE as DEFAULT_STYLE, SUBTITLE_OPTIONS } from '../lib/subtitleStyle';
import { useSettings } from '../store/settingsStore';
import {
  subtitleTrack,
  scriptSubtitleTrack,
  pictureSubtitleTrack,
  installedFonts,
} from '../lib/desktop';

/* The style lives in the settings store, so the one the Settings screen shows
   and the one on screen over a film are the same style. The values it may take
   are in lib/subtitleStyle, and are re-exported here for the menus that have
   always read them from this module. */
export { SUBTITLE_OPTIONS };

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
  const style = useSettings((s) => s.subtitleStyle);
  /**
   * Where the showing cues came from: `'file'` for one opened from disk, or a
   * demuxer stream index for one lifted out of the video itself. Null when
   * nothing is loaded.
   *
   * The menu needs it to mark which entry is on. Deriving that from the label
   * would work until two tracks in a film share a name, which is exactly what
   * an English track and an English SDH track usually do.
   */
  const [sourceId, setSourceId] = useState(null);
  /**
   * Which track is being lifted out of the container, or null.
   *
   * Separate from `sourceId`, and it has to be: `sourceId` names the track on
   * screen, and does not become the new one until the extraction has finished.
   * Marking the row that is working needs the id of the track that has not
   * arrived yet.
   */
  const [pendingId, setPendingId] = useState(null);

  /**
   * A picture subtitle track, when the chosen one is pictures.
   *
   * Never set at the same time as `trackUrl`: a text track lives in a `<track>`
   * element the browser parses, and this is a list the overlay walks itself.
   * One of the two is on screen and the other is null.
   *
   * @type {[import('../lib/desktop').PictureTrack | null, Function]}
   */
  const [pictures, setPictures] = useState(null);

  /**
   * A script track, when the chosen one is ASS or SSA.
   *
   * The third of three, and like the other two it is set only when the others
   * are null. A track is words, or a script, or pictures.
   *
   * @type {[import('../lib/desktop').SubtitleScript | null, Function]}
   */
  const [script, setScript] = useState(null);
  /**
   * The parsed track itself, for the component that draws its active cues.
   */
  const [textTrack, setTextTrack] = useState(null);
  const urlRef = useRef(null);
  const trackElRef = useRef(null);
  /**
   * Bumped on every load. An extraction that was in flight when the viewer
   * chose a different track checks this before adopting, so the slower of two
   * requests cannot overwrite the one they actually waited for.
   */
  const requestRef = useRef(0);

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
    /* Published as state, because what reads it is a component rather than
       this hook: the element parses the file and holds the cues, and Cadence
       draws them. */
    setTextTrack(track.track ?? null);

    return () => {
      track.remove();
      if (trackElRef.current === track) trackElRef.current = null;
      setTextTrack(null);
    };
  }, [trackUrl, label, videoEl, videoRef]);

  /**
   * Re-apply the viewer's timing offset to a track that has just been parsed.
   *
   * The cues carry the times written in the file, and the offset is not one of
   * them: it is applied by moving the cues, so a track that is parsed again
   * comes back unshifted. That happens whenever the element is rebuilt, a
   * backend falling back mid-file is the case that does it, and until this
   * ran, the readout went on claiming a correction the screen had lost.
   */
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  useEffect(() => {
    const element = trackElRef.current;
    if (!element || !trackUrl) return;

    const shift = () => {
      const by = offsetRef.current;
      const cues = element.track?.cues;
      if (!cues || by === 0) return;
      for (let i = 0; i < cues.length; i++) {
        cues[i].startTime += by;
        cues[i].endTime += by;
      }
    };

    // LOADED. Already parsed, so the event has been and gone.
    if (element.readyState === 2) shift();
    else element.addEventListener('load', shift, { once: true });
    return () => element.removeEventListener('load', shift);
  }, [trackUrl, videoEl]);

  /**
   * Keep exactly one track live, and keep the browser from drawing it.
   *
   * `hidden` rather than `showing` is the whole arrangement. A hidden track is
   * still parsed and still maintains `activeCues` as the clock runs; what it
   * does not do is paint. Cadence paints, in an ordinary element over the
   * video, which is what buys everything the native rendering cannot be talked
   * into: text that sits above the control bar rather than behind it, a
   * backdrop that is one box behind the whole line, and a right-to-left line
   * that reads as one.
   *
   * Every track used to be switched together, which was harmless while the only
   * one present was this hook's. It stops being harmless the moment the
   * container has its own: an MP4 with subtitles inside it is demuxed by the
   * browser, which publishes them as text tracks of its own, and letting those
   * through would draw every line twice.
   */
  const syncTrackMode = useCallback(() => {
    const video = videoEl ?? videoRef.current;
    if (!video) return;
    const ours = trackElRef.current?.track;
    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      track.mode = track === ours && enabled && trackUrl ? 'hidden' : 'disabled';
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

  /**
   * Put a WebVTT document on screen, whatever produced it.
   *
   * @param {string} vtt
   * @param {string} name Shown in the menu.
   * @param {string} id `'file'`, or a demuxer stream index.
   */
  const adopt = useCallback(
    (vtt, name, id) => {
      revokeUrl();
      // The three kinds are mutually exclusive: choosing one track replaces
      // whatever was on screen, whether or not it was made of the same stuff.
      setPictures(null);
      setScript(null);
      const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
      urlRef.current = url;
      setLabel(name);
      setSourceId(id);
      setTrackUrl(url);
      setEnabled(true);
      setOffset(0);
    },
    [revokeUrl]
  );

  /**
   * Put a script on screen, whatever produced it.
   *
   * @param {import('../lib/desktop').SubtitleScript} next
   * @param {string} name Shown in the menu.
   * @param {string} id `'file'`, or a demuxer stream index.
   */
  const adoptScript = useCallback(
    (next, name, id) => {
      revokeUrl();
      setTrackUrl(null);
      setPictures(null);
      setScript(next);
      setLabel(name);
      setSourceId(id);
      setEnabled(true);
      setOffset(0);
    },
    [revokeUrl]
  );

  const loadFile = useCallback(
    async (file) => {
      const ext = file.name.split('.').pop()?.toLowerCase();

      /* A script from disk goes the same way as one from inside a film, and
         needs the one thing that one does not: its encoding worked out. A
         `.ass` downloaded from the internet declares nothing about itself. */
      if (ext === 'ass' || ext === 'ssa') {
        requestRef.current += 1;
        adoptScript(
          { text: decodeSubtitle(await file.arrayBuffer()), fonts: [], installed: await installedFonts() },
          file.name,
          'file'
        );
        return true;
      }

      if (ext !== 'srt' && ext !== 'vtt') return false;
      requestRef.current += 1;
      revokeUrl();
      setPictures(null);
      setScript(null);
      const url = await loadSubtitleFile(file);
      urlRef.current = url;
      setLabel(file.name);
      setSourceId('file');
      setTrackUrl(url);
      setEnabled(true);
      setOffset(0);
      return true;
    },
    [revokeUrl, adoptScript]
  );

  /**
   * Lift a subtitle track out of the video being played and show it.
   *
   * The extraction is a pass over the container, so it is seconds on a large
   * film rather than instant, and `loading` is what lets the menu say so.
   *
   * @param {string} path The file being played.
   * @param {number} index Demuxer stream index of the subtitle track.
   * @param {string} name Shown in the menu.
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  const loadEmbedded = useCallback(
    async (path, index, name) => {
      requestRef.current += 1;
      const request = requestRef.current;
      setPendingId(String(index));
      try {
        const vtt = await subtitleTrack(path, index);
        // A slower extraction must not land on top of a faster one the viewer
        // chose afterwards, and neither may land at all once the file is closed.
        if (request !== requestRef.current) return { ok: false };
        adopt(vtt, name, String(index));
        return { ok: true };
      } catch (err) {
        if (request !== requestRef.current) return { ok: false };
        return { ok: false, error: String(err) };
      } finally {
        if (request === requestRef.current) setPendingId(null);
      }
    },
    [adopt]
  );

  /**
   * Show a subtitle track that is pictures rather than words.
   *
   * A Blu-ray carries its subtitles already drawn, in whatever font and colour
   * the disc was authored with. Nothing here is converted, because there is
   * nothing to convert them into, the pictures are put on the screen as they
   * are, which is what the disc player does and is why the format has no font
   * to be missing.
   *
   * What comes back is a table of times and places. The pictures themselves are
   * fetched as they come due, so opening the menu on a film with a thousand
   * lines in it costs one small request rather than every one of them.
   *
   * @param {string} path The file being played.
   * @param {number} index Demuxer stream index of the subtitle track.
   * @param {string} name Shown in the menu.
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  const loadPictures = useCallback(
    async (path, index, name) => {
      requestRef.current += 1;
      const request = requestRef.current;
      setPendingId(String(index));
      try {
        const track = await pictureSubtitleTrack(path, index);
        if (request !== requestRef.current) return { ok: false };
        revokeUrl();
        setTrackUrl(null);
        setScript(null);
        setPictures(track);
        setLabel(name);
        setSourceId(String(index));
        setEnabled(true);
        setOffset(0);
        return { ok: true };
      } catch (err) {
        if (request !== requestRef.current) return { ok: false };
        return { ok: false, error: String(err) };
      } finally {
        if (request === requestRef.current) setPendingId(null);
      }
    },
    [revokeUrl]
  );

  /**
   * Show a subtitle track that is a script rather than plain words.
   *
   * ASS carries the drawing along with the sentences, where each line sits, in
   * what face, at what angle, in what colour, and how it moves. Converting it
   * to WebVTT keeps the words and loses the rest, which is why this route
   * exists: the script is handed to libass, unchanged, along with whatever
   * fonts the film carries for it.
   *
   * @param {string} path The file being played.
   * @param {number} index Demuxer stream index of the subtitle track.
   * @param {string} name Shown in the menu.
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  const loadScript = useCallback(
    async (path, index, name) => {
      requestRef.current += 1;
      const request = requestRef.current;
      setPendingId(String(index));
      try {
        const next = await scriptSubtitleTrack(path, index);
        if (request !== requestRef.current) return { ok: false };
        adoptScript(next, name, String(index));
        return { ok: true };
      } catch (err) {
        if (request !== requestRef.current) return { ok: false };
        return { ok: false, error: String(err) };
      } finally {
        if (request === requestRef.current) setPendingId(null);
      }
    },
    [adoptScript]
  );

  const changeOffset = useCallback((delta) => {
    setOffset((prev) => {
      const next = prev + delta;
      /* The cues are moved rather than the clock, because there is no clock to
         move: a text track runs on the element's. This reaches for the track
         element's own track rather than the first in the list, which are the
         same thing only until the container contributes one of its own. */
      const cues = trackElRef.current?.track?.cues;
      if (cues) {
        for (let i = 0; i < cues.length; i++) {
          cues[i].startTime += delta;
          cues[i].endTime += delta;
        }
      }
      return next;
    });
  }, []);

  const changeStyle = useCallback((key, value) => {
    const { subtitleStyle, set } = useSettings.getState();
    set({ subtitleStyle: { ...subtitleStyle, [key]: value } });
  }, []);

  const resetStyle = useCallback(() => {
    useSettings.getState().set({ subtitleStyle: { ...DEFAULT_STYLE } });
  }, []);

  const toggle = useCallback(() => {
    if (!trackUrl && !pictures && !script) return;
    setEnabled((v) => !v);
  }, [trackUrl, pictures, script]);

  const clear = useCallback(() => {
    // Bumped so an extraction still running is disowned rather than adopted
    // into the file that replaced the one it was asked for.
    requestRef.current += 1;
    revokeUrl();
    setTrackUrl(null);
    setPictures(null);
    setScript(null);
    setLabel('Subtitles');
    setSourceId(null);
    setPendingId(null);
    setEnabled(false);
    setOffset(0);
  }, [revokeUrl]);

  return {
    trackUrl,
    textTrack,
    label,
    sourceId,
    pendingId,
    loading: pendingId !== null,
    enabled,
    pictures,
    script,
    hasSubtitles: !!trackUrl || !!pictures || !!script,
    offset,
    style,
    loadFile,
    loadEmbedded,
    loadScript,
    loadPictures,
    toggle,
    clear,
    changeOffset,
    changeStyle,
    resetStyle,
    isStyleDefault: Object.keys(DEFAULT_STYLE).every((key) => style[key] === DEFAULT_STYLE[key]),
  };
}
