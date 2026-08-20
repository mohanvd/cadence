import * as React from 'react';
import { Icon } from '@/components/ui/icons';
import { Artwork } from '@/components/music/Artwork';
import { cn } from '@/lib/utils';
import type { Song } from '@/store/libraryStore';
import { useIsPaused, usePlayerStore } from '@/store/playerStore';

/**
 * What fills the frame when there is no picture.
 *
 * Deliberately not a spectrum analyser. Reading real levels needs a
 * `MediaElementAudioSourceNode`, an element may only ever have one, and the
 * equalizer already owns it — so a visualiser here would either fight the
 * equalizer for the element or, worse, animate to nothing at all and pretend
 * it was listening. What goes here instead is the record sleeve, which is the
 * thing a person actually looks at while music plays, and costs one image
 * rather than a frame of work every sixteen milliseconds.
 *
 * The sleeve is also the wallpaper. Blurred and dimmed behind itself, it gives
 * the screen the colour of whatever is playing without sampling video frames
 * the way the ambient glow does — there are no frames here to sample.
 *
 * It is drawn as large as the window allows rather than at a fixed size. A
 * record sleeve is a twelve-inch object and the screen is the only place left
 * that can show it at anything like that; a two-hundred-pixel thumbnail in the
 * middle of a large window is a picture being apologised for.
 */
export interface MusicStageProps {
  /** The file's name, which is the fallback when there are no tags. */
  title: string;
  /** What the file says it is, once that has been read. */
  song: Song | null;
  /** True when the file simply has no video to show. */
  forced: boolean;
  /** Where the sleeve is fetched from: the track's own path. */
  path: string | null;
}

export function MusicStage({ title, song, forced, path }: MusicStageProps) {
  /* Nothing here animates on the play state. The sleeve used to shrink when
     the music stopped, which reads as the picture flinching every time you
     press pause, and there is already a transport underneath saying which
     state it is in. */
  const paused = useIsPaused();
  const tracks = usePlayerStore((s) => s.tracks);

  // Filename extensions are noise on a now-playing card.
  const clean = React.useMemo(() => title.replace(/\.[^.]+$/, ''), [title]);
  const heading = song?.title ?? clean;

  /* Under the title: who it is by and what it is from. Only what the file
     actually says — a card reading "Unknown artist · Unknown album" tells you
     nothing twice, and is worse than one that shows only the name. */
  const byline = React.useMemo(
    () => [song?.artist, song?.album].filter(Boolean).join(' · '),
    [song],
  );

  const audio = React.useMemo(
    () => tracks.find((track) => track.type === 'audio' && track.playable),
    [tracks],
  );

  /* The small print. Worth having and not worth reading first, so it sits
     below the names in the quietest weight on the screen: what the file is,
     for the one time in fifty somebody wants to know. */
  const detail = React.useMemo(() => {
    const parts: (string | undefined)[] = [];
    if (song?.year) parts.push(String(song.year));
    if (audio) {
      parts.push(audio.codec?.toUpperCase());
      if (audio.channels) {
        parts.push(
          audio.channels === 1 ? 'Mono' : audio.channels === 2 ? 'Stereo' : `${audio.channels}ch`,
        );
      }
      if (audio.sampleRate) parts.push(`${Math.round(audio.sampleRate / 1000)} kHz`);
    }
    return parts.filter(Boolean).join(' · ');
  }, [audio, song]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--bg)]">
      {/* The wallpaper: the same picture, blurred past recognition. No
          information, one paint, and the screen takes the colour of whatever
          is on. */}
      {path && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <Artwork
            path={path}
            width={320}
            rounded={false}
            className="size-full scale-125 opacity-30 blur-[80px] saturate-150"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black/80" />
        </div>
      )}

      {/* Clear of the bar along the bottom, which is 78px and sits over this. */}
      <div className="relative flex size-full flex-col items-center justify-center px-8 pb-[78px]">
        {path ? (
          <Artwork
            path={path}
            width={900}
            className={cn(
              'aspect-square w-auto rounded-[14px] border border-white/10 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.9)]',
              // Bounded by the shorter of the two: tall windows stop at a
              // sensible size and short ones stop at the window.
              'h-[min(46vh,26rem)]',
            )}
          />
        ) : (
          <div
            className={cn(
              'flex size-32 items-center justify-center rounded-[28px] border border-line bg-surface-1 shadow-[var(--shadow-panel)]',
              !paused && 'animate-[music-breathe_4s_ease-in-out_infinite]',
            )}
          >
            <Icon name="music" size={48} className="text-accent" />
          </div>
        )}

        <div className="mt-8 flex max-w-2xl flex-col items-center text-center">
          <h2 className="text-balance text-[28px] leading-tight font-semibold tracking-[-0.03em] text-white">
            {heading}
          </h2>

          {byline && <p className="mt-2 text-[15px] text-white/70">{byline}</p>}
          {detail && <p className="mt-3 text-[12px] tracking-[0.02em] text-white/40">{detail}</p>}

          {forced && !byline && !detail && (
            <p className="mt-4 text-[12px] leading-relaxed text-white/40">
              This file has no video track.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
