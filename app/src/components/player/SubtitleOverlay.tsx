import * as React from 'react';
import { cn } from '@/lib/utils';
import type { SubtitleStyle } from '@/hooks';

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
 */
export function SubtitleOverlay({
  track,
  style,
  visible,
  lifted,
}: {
  /** The parsed track, held `hidden` so it maintains cues without drawing. */
  track: TextTrack | null;
  style: SubtitleStyle;
  visible: boolean;
  /** True while the control bar is on screen, which the text steps above. */
  lifted: boolean;
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

  if (!visible || cues.length === 0) return null;

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
 * One cue.
 *
 * The text arrives as WebVTT markup — `<i>`, `<b>`, `<v Speaker>` — and
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
        fontSize: style.fontSize,
        color: style.color,
        backgroundColor: style.background,
        /* Legible over a bright frame even with the backdrop turned off, which
           is the setting anyone who dislikes the black box reaches for. */
        textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.6)',
      }}
    />
  );
}
