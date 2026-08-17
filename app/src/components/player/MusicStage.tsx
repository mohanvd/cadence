import * as React from 'react';
import { Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsPaused, usePlayerStore } from '@/store/playerStore';

/**
 * What fills the frame in music mode.
 *
 * Deliberately not a spectrum analyser. Reading real levels needs a
 * `MediaElementAudioSourceNode`, an element may only ever have one, and the
 * equalizer already owns it, so a visualiser here would either fight the
 * equalizer for the element or, worse, animate to nothing at all and pretend it
 * was listening. A still card that states what is playing is honest and costs
 * no frames, which is the entire point of the mode.
 */
export interface MusicStageProps {
  title: string;
  /** Explains itself when the file simply has no video to show. */
  forced: boolean;
}

export function MusicStage({ title, forced }: MusicStageProps) {
  const paused = useIsPaused();
  const tracks = usePlayerStore((s) => s.tracks);

  // Filename extensions are noise on a now-playing card.
  const clean = React.useMemo(() => title.replace(/\.[^.]+$/, ''), [title]);

  const audio = React.useMemo(
    () => tracks.find((track) => track.type === 'audio' && track.playable),
    [tracks],
  );

  const detail = React.useMemo(() => {
    if (!audio) return null;
    const parts = [audio.codec?.toUpperCase()];
    if (audio.channels) {
      parts.push(audio.channels === 1 ? 'Mono' : audio.channels === 2 ? 'Stereo' : `${audio.channels}ch`);
    }
    if (audio.sampleRate) parts.push(`${Math.round(audio.sampleRate / 1000)} kHz`);
    return parts.filter(Boolean).join(' · ');
  }, [audio]);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
      <div className="flex max-w-lg flex-col items-center text-center">
        <div
          className={cn(
            'mb-7 flex size-28 items-center justify-center rounded-[28px] border border-line bg-surface-1 shadow-[var(--shadow-panel)]',
            // A slow breath while playing, perfectly still while paused: enough
            // to tell the two states apart from across a room, and not enough
            // to be something moving in your peripheral vision for an hour.
            !paused && 'animate-[music-breathe_4s_ease-in-out_infinite]',
          )}
        >
          <Music className="size-11 text-accent" strokeWidth={1.25} />
        </div>

        <h2 className="text-balance text-xl font-semibold tracking-[-0.02em] text-fg">
          {clean}
        </h2>

        {detail && <p className="mt-2 text-[13px] text-fg-subtle">{detail}</p>}

        {forced && (
          <p className="mt-4 text-[12px] leading-relaxed text-fg-subtle">
            This file has no video track.
          </p>
        )}
      </div>
    </div>
  );
}
