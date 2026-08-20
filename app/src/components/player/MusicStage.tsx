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
 */
export interface MusicStageProps {
  /** The file's name, which is the fallback when there are no tags. */
  title: string;
  /** What the file says it is, once that has been read. */
  song: Song | null;
  /** Explains itself when the file simply has no video to show. */
  forced: boolean;
  /** Where the sleeve is fetched from: the track's own path. */
  path: string | null;
}

export function MusicStage({ title, song, forced, path }: MusicStageProps) {
  const paused = useIsPaused();
  const tracks = usePlayerStore((s) => s.tracks);

  // Filename extensions are noise on a now-playing card.
  const clean = React.useMemo(() => title.replace(/\.[^.]+$/, ''), [title]);
  const heading = song?.title ?? clean;

  /* Under the title: who it is by and what it is from. Only what the file
     actually says — a card that reads "Unknown artist · Unknown album" tells
     you nothing twice and is worse than a card that says only the name. */
  const byline = React.useMemo(
    () => [song?.artist, song?.album].filter(Boolean).join(' · '),
    [song],
  );

  const audio = React.useMemo(
    () => tracks.find((track) => track.type === 'audio' && track.playable),
    [tracks],
  );

  const detail = React.useMemo(() => {
    if (!audio) return null;
    const parts = [audio.codec?.toUpperCase()];
    if (audio.channels) {
      parts.push(
        audio.channels === 1 ? 'Mono' : audio.channels === 2 ? 'Stereo' : `${audio.channels}ch`,
      );
    }
    if (audio.sampleRate) parts.push(`${Math.round(audio.sampleRate / 1000)} kHz`);
    if (song?.year) parts.unshift(String(song.year));
    return parts.filter(Boolean).join(' · ');
  }, [audio, song]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* The wallpaper. `aria-hidden` and pointer-transparent: it is the same
          picture as the one below it, at no information and one blur. */}
      {path && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <Artwork
            path={path}
            width={320}
            rounded={false}
            className="size-full scale-110 opacity-25 blur-3xl"
          />
        </div>
      )}

      <div className="relative flex size-full items-center justify-center px-8">
        <div className="flex max-w-lg flex-col items-center text-center">
          {path ? (
            <Artwork
              path={path}
              width={640}
              className={cn(
                'mb-7 size-56 border border-white/10 shadow-[var(--shadow-panel)] transition-transform duration-700 ease-[var(--ease-out-quint)]',
                // A sleeve that shrinks slightly when the music stops, and is
                // whole while it plays. Enough to read across a room, and
                // nothing that moves continuously in the corner of your eye
                // for the length of an album.
                paused && 'scale-[0.97] opacity-90',
              )}
            />
          ) : (
            <div
              className={cn(
                'mb-7 flex size-28 items-center justify-center rounded-[28px] border border-line bg-surface-1 shadow-[var(--shadow-panel)]',
                !paused && 'animate-[music-breathe_4s_ease-in-out_infinite]',
              )}
            >
              <Icon name="music" size={44} className="text-accent" />
            </div>
          )}

          <h2 className="text-balance text-xl font-semibold tracking-[-0.02em] text-fg">
            {heading}
          </h2>

          {byline && <p className="mt-1.5 text-[14px] text-fg-muted">{byline}</p>}
          {detail && <p className="mt-2 text-[13px] text-fg-subtle">{detail}</p>}

          {forced && !byline && (
            <p className="mt-4 text-[12px] leading-relaxed text-fg-subtle">
              This file has no video track.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
