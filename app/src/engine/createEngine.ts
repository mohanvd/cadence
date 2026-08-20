import { NativeBackend } from './backends/NativeBackend';
import { StreamBackend } from './backends/StreamBackend';
import { probeSource, type ProbeOptions } from './probe';
import type { MediaSourceInput, PlaybackEngine, ProbeResult } from './types';

export interface EngineCreation {
  engine: PlaybackEngine;
  probe: ProbeResult;
}

/**
 * Inspect a source and build the backend that can play it.
 *
 * Inspection is best-effort. If it fails outright, on a damaged header or a
 * shell with no playback pipeline, the file still goes to the browser: it is
 * often more forgiving than FFmpeg about a broken container, and a real
 * playback error names the problem better than a pre-emptive refusal.
 */
export async function createEngine(
  source: MediaSourceInput,
  options: ProbeOptions = {},
): Promise<EngineCreation> {
  let probe: ProbeResult;
  try {
    probe = await probeSource(source, options);
  } catch (err) {
    console.warn('[engine] inspection failed, trying the browser directly', err);
    probe = {
      container: '',
      tracks: [],
      durationHint: null,
      backend: 'native',
      reason: 'could not inspect the file; trying the browser directly',
      copyVideo: true,
      copyAudio: true,
      audioFallbacks: {},
    };
  }

  return {
    engine: probe.backend === 'stream' ? new StreamBackend(probe) : new NativeBackend(probe),
    probe,
  };
}

/** How a file is being played, in the fewest words that stay true. */
export function describeBackend(probe: ProbeResult): string {
  if (probe.backend === 'native') return 'Direct playback';
  return probe.copyVideo && probe.copyAudio ? 'Repackaged' : 'Converted';
}
