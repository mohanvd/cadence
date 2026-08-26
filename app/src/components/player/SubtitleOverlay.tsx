import * as React from 'react';
import { cn } from '@/lib/utils';
import type JASSUB from 'jassub';
// The renderer's own pieces, named rather than left to be found. A worker and
// two builds of the same WebAssembly, one using SIMD instructions and one for
// machines without them, which the library picks between at load.
import workerUrl from 'jassub/dist/worker/worker.js?worker&url';
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';
// Metrically identical to Arial, which is what a script that names no font it
// carries is usually asking for.
import fallbackFont from 'jassub/dist/default.woff2?url';
import type { PictureCue, PictureTrack, SubtitleScript, SubtitleStyle } from '@/hooks';

/**
 * Draws the active subtitle cues over the video.
 *
 * The browser will do this itself, and this exists because of what it will not
 * do while doing it. Native cues are painted inside the video element by the
 * engine, reachable only through `::cue`, which accepts a short list of text
 * properties and no position at all. Three things Cadence wants are on the
 * other side of that line: text that steps up out of the way when the control
 * bar appears rather than sitting behind it, one backdrop behind a whole line
 * instead of a separate box behind every fragment the cue happens to be split
 * into, and a right-to-left line that is laid out as one.
 *
 * So the track is left `hidden`, which parses it and keeps `activeCues`
 * current without painting, and the cues are rendered here as ordinary
 * elements.
 *
 * Two kinds of track go elsewhere. A Blu-ray's subtitles are not words but
 * pictures, drawn by `PictureLayer`; a script carries its own drawing and is
 * given to libass in `ScriptLayer`. Only one track shows at a time, and it is
 * made of one of the three things.
 */
export function SubtitleOverlay({
  track,
  pictures,
  script,
  style,
  visible,
  lifted,
  video,
  offset,
}: {
  /** The parsed track, held `hidden` so it maintains cues without drawing. */
  track: TextTrack | null;
  /** The showing track, when it is pictures rather than words. */
  pictures: PictureTrack | null;
  /** The showing track, when it is a script that draws itself. */
  script: SubtitleScript | null;
  style: SubtitleStyle;
  visible: boolean;
  /** True while the control bar is on screen, which the text steps above. */
  lifted: boolean;
  /** The element being played, for a clock the pictures can be timed against. */
  video: HTMLVideoElement | null;
  /** Seconds the viewer has nudged the cues by. */
  offset: number;
}) {
  const [cues, setCues] = React.useState<VTTCue[]>([]);

  React.useEffect(() => {
    if (!track) {
      setCues([]);
      return;
    }

    const read = () => {
      const active = track.activeCues;
      setCues(active ? (Array.from(active) as VTTCue[]) : []);
    };

    read();
    track.addEventListener('cuechange', read);
    return () => {
      track.removeEventListener('cuechange', read);
    };
  }, [track]);

  if (!visible) return null;

  if (script) {
    return <ScriptLayer script={script} video={video} offset={offset} />;
  }

  if (pictures) {
    return <PictureLayer track={pictures} video={video} lifted={lifted} offset={offset} />;
  }

  if (cues.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className={cn(
        /* Above the picture and below the chrome. A subtitle that covered the
           control bar would be worse than one the bar covered: the bar is
           there because the viewer just asked for it. */
        'pointer-events-none absolute inset-x-0 z-[15] flex flex-col items-center gap-1 px-[8%]',
        'transition-[bottom] duration-200 ease-[var(--ease-out-quint)]',
        // Clear of the control bar when it is up, low in frame when it is not.
        lifted ? 'bottom-[calc(var(--control-height,104px)+2vh)]' : 'bottom-[6%]',
      )}
    >
      {cues.map((cue, index) => (
        <Line key={cue.id || `${cue.startTime}-${index}`} cue={cue} style={style} />
      ))}
    </div>
  );
}

/**
 * Draws a subtitle track that is a script.
 *
 * ASS is not a subtitle format so much as a small drawing language: a line
 * carries where it sits, in what face, at what size and angle and colour, how
 * it is outlined, and how any of that changes over the seconds it is on screen.
 * It is what a fansub uses to put the translation of a sign onto the sign, and
 * what a karaoke line is written in.
 *
 * None of that survives a conversion to WebVTT, which has no position and no
 * colours, so Cadence used to keep the sentences and quietly lose the rest,
 * a sign painted on a wall arrived as a caption underneath the picture with no
 * indication of what it was labelling.
 *
 * What draws it here is libass, compiled to WebAssembly and run in a worker. It
 * is the same library mpv and VLC draw these with, which is the point: ASS has
 * no specification worth the name, and its real definition is what libass does
 * with it. A second implementation would be a second set of answers.
 */
function ScriptLayer({
  script,
  video,
  offset,
}: {
  script: SubtitleScript;
  video: HTMLVideoElement | null;
  /** Seconds the viewer has nudged the cues by. */
  offset: number;
}) {
  const [renderer, setRenderer] = React.useState<JASSUB | null>(null);

  React.useEffect(() => {
    if (!video) return undefined;

    let live = true;
    let instance: JASSUB | null = null;

    /* Loaded on demand rather than with the page. The renderer is a couple of
       megabytes of WebAssembly, and most of what anybody plays has no script
       in it at all, there is no reason for a film with an `.srt` beside it to
       pay for a font shaper it will never call. */
    void import('jassub').then(({ default: JASSUB }) => {
      if (!live) return;
      instance = new JASSUB({
        video,
        subContent: script.text,
        // The fonts the film carries for it, and one to fall back on for a
        // face it names that nobody has.
        /* The film's own fonts, and the ones it names but expects the machine
           to have. Both are loaded before the first frame is drawn rather than
           when libass first misses one: a font that arrives after the frame it
           was needed for leaves that frame blank, which on a paused picture is
           a subtitle that simply is not there. */
        fonts: [...script.fonts, ...facesIn(script.text, script.installed)],
        /* And the rest of the machine's faces by name, for anything the script
           asks for in a way not worth parsing. Named, not loaded: the renderer
           fetches one only if it turns out to want it. */
        availableFonts: { ...script.installed, 'liberation sans': fallbackFont },
        defaultFont: 'liberation sans',
        /* The renderer's own way of finding local fonts asks the person for
           permission, mid-film, for a question about typography. The shell has
           already answered it above. */
        queryFonts: false,
        workerUrl,
        wasmUrl,
        modernWasmUrl,
        timeOffset: offset,
      });
      setRenderer(instance);
    });

    return () => {
      live = false;
      setRenderer(null);
      void instance?.destroy();
    };
    // `offset` is deliberately absent: it is applied below rather than here,
    // because rebuilding the renderer to nudge the timing by a tenth of a
    // second would reload the fonts and blank the screen while it did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, video]);

  React.useEffect(() => {
    if (renderer) renderer.timeOffset = offset;
  }, [renderer, offset]);

  /* Nothing is rendered here. libass draws onto a canvas of its own, which it
     puts beside the video element and keeps exactly the size and position of
     the picture, letterboxing included. Every coordinate in a script is
     measured against the frame, so that is the only place the canvas can be. */
  return null;
}

/**
 * Draws a subtitle track that is pictures rather than words.
 *
 * Nothing here is styled, and that is the format rather than an omission. A
 * Blu-ray's subtitles were drawn once, by whoever authored the disc, in the
 * font and colour and position they chose; there is no text to restyle and no
 * layout to redo. What a player owes them is to put them back exactly where
 * they were meant to go.
 *
 * Which is what the box below is for. The coordinates are on the canvas the
 * disc was authored against, 1920 by 1080, usually, and the video is drawn
 * inside the window at whatever size fits. So the cues are placed in a box of
 * the canvas's own shape, sized the way the picture is sized, and positioned
 * within it as fractions. The subtitle then lands on the same part of the
 * frame at every window size, which is the only definition of right there is.
 */
function PictureLayer({
  track,
  video,
  lifted,
  offset,
}: {
  track: PictureTrack;
  video: HTMLVideoElement | null;
  lifted: boolean;
  offset: number;
}) {
  const [showing, setShowing] = React.useState<PictureCue | null>(null);

  React.useEffect(() => {
    if (!video) return undefined;

    /* Read from the element on every frame rather than from the store. The
       store publishes the clock a few times a second, which is fine for a
       readout and is not fine here: a subtitle that arrives a quarter second
       after the line is spoken is a subtitle that is late, and a quarter
       second is exactly how late it would be. */
    let frame = 0;
    let shown: PictureCue | null = null;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const at = video.currentTime - offset;
      const found = cueAt(track.cues, at);
      if (found !== shown) {
        shown = found;
        setShowing(found);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [track, video, offset]);

  /* The picture for a cue is fetched when the cue arrives, which would show it
     a moment late the first time through. Asking for the next few in advance
     costs a handful of small requests and means the webview already has them.
     Seeking makes some of this wasted, which is the cheaper mistake. */
  React.useEffect(() => {
    if (!showing) return;
    const from = track.cues.indexOf(showing) + 1;
    for (const cue of track.cues.slice(from, from + 3)) {
      const image = new Image();
      image.src = cue.url;
    }
  }, [showing, track]);

  if (!showing) return null;

  const percent = (value: number, of: number) => `${(value / of) * 100}%`;
  // Lifting a sign at the top of the frame to clear a bar at the bottom would
  // be moving it for no reason, so only what the bar could actually cover is
  // moved. Signs, credits and forced captions stay where they were drawn.
  const low = showing.y + showing.height > track.height * 0.72;

  return (
    <div className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center">
      <div
        className="relative w-full max-h-full max-w-full"
        style={{ aspectRatio: `${track.width} / ${track.height}` }}
      >
        <img
          src={showing.url}
          alt=""
          className={cn(
            'absolute',
            lifted && low && 'transition-transform duration-200 ease-[var(--ease-out-quint)]',
          )}
          style={{
            left: percent(showing.x, track.width),
            top: percent(showing.y, track.height),
            width: percent(showing.width, track.width),
            height: percent(showing.height, track.height),
            transform:
              lifted && low ? 'translateY(calc(-1 * var(--control-height, 104px)))' : undefined,
          }}
        />
      </div>
    </div>
  );
}

/**
 * The fonts a script names, as URLs to fetch them from.
 *
 * Two places name one: the style definitions at the top, and a `\fn` override
 * on a line that wants something other than its style's face. What is not here
 * is anything a script asks for by some other means, which the renderer will
 * still find by name, this list exists to have the common ones in hand before
 * the first frame rather than one frame after it.
 *
 * A leading `@` marks a face to be drawn vertically, which is a instruction
 * about the writing and not part of the name.
 */
function facesIn(script: string, installed: Record<string, string>): string[] {
  const named = new Set<string>();
  const add = (name: string | undefined) => {
    const face = name?.trim().replace(/^@/, '').toLowerCase();
    if (face && installed[face]) named.add(installed[face]);
  };

  for (const line of script.split(/\r?\n/)) {
    // `Style: Name,Fontname,Fontsize,…`
    if (line.startsWith('Style:')) add(line.slice(6).split(',')[1]);
  }
  for (const [, name] of script.matchAll(/\\fn([^\\}]+)/g)) add(name);

  return [...named];
}

/**
 * The cue showing at `at`, or null.
 *
 * A search rather than a scan because this runs on every animation frame and a
 * film holds a thousand or so cues. They never overlap, each one is a whole
 * screenful, and the next one replaces it, so the last cue that has started
 * is the only candidate, and it is showing if it has not yet ended.
 */
function cueAt(cues: PictureCue[], at: number): PictureCue | null {
  let low = 0;
  let high = cues.length - 1;
  let found: PictureCue | null = null;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const cue = cues[middle];
    if (!cue) break;
    if (cue.start <= at) {
      found = cue;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return found && found.end > at ? found : null;
}

/**
 * One cue.
 *
 * The text arrives as WebVTT markup, `<i>`, `<b>`, `<v Speaker>`, and
 * `getCueAsHTML` is the parser for it that the browser already has. Using it
 * rather than the raw string is also what keeps a subtitle file from being able
 * to inject anything: the fragment it returns holds text and formatting nodes,
 * built by the same parser that would have drawn them natively.
 */
function Line({ cue, style }: { cue: VTTCue; style: SubtitleStyle }) {
  const ref = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.replaceChildren(cue.getCueAsHTML());
  }, [cue]);

  return (
    <span
      ref={ref}
      dir="auto"
      className="max-w-full rounded-[4px] px-2 py-0.5 text-center leading-snug font-medium whitespace-pre-wrap"
      style={{
        fontFamily: FAMILIES[style.family],
        // Against the player's own base rather than a raw pixel count, so the
        // same setting reads the same on a laptop and on a television.
        fontSize: `calc(${style.size / 100} * var(--subtitle-base, 22px))`,
        color: withAlpha(style.color, style.opacity),
        backgroundColor: withAlpha(style.backgroundColor, style.backgroundOpacity),
        textShadow: EDGES[style.edge],
      }}
    />
  );
}

const FAMILIES: Record<string, string> = {
  sans: 'Inter, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"JetBrains Mono", Consolas, monospace',
  rounded: '"Segoe UI Variable", "Nunito", system-ui, sans-serif',
};

/**
 * How the glyphs are separated from whatever is behind them.
 *
 * This is the setting that matters most and looks least important. Subtitles
 * are read over a picture, not over a colour, and a white line crossing a snow
 * field disappears entirely with no edge on it. It is why the backdrop can be
 * turned off at all: without one of these, turning it off makes the text
 * unreadable rather than unobtrusive.
 */
const EDGES: Record<string, string | undefined> = {
  none: undefined,
  shadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.7)',
  outline:
    '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 3px rgba(0,0,0,0.8)',
  raised: '1px 1px 0 rgba(255,255,255,0.35), 2px 2px 3px rgba(0,0,0,0.95)',
};

/** `#rrggbb` and a percentage, as one colour the browser will take. */
function withAlpha(hex: string, percent: number): string {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${percent / 100})`;
}
