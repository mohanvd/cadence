import { NativeBackend } from './backends/NativeBackend';
import { RemuxBackend } from './backends/RemuxBackend';
import { UnsupportedBackend } from './backends/UnsupportedBackend';
import { probeSource } from './probe';
import type { MediaSourceInput, PlaybackEngine, ProbeResult } from './types';

export interface EngineCreation {
  engine: PlaybackEngine;
  probe: ProbeResult;
}

/**
 * Probe a source and build the backend that can play it.
 *
 * Probing is best-effort: if inspection itself fails (a corrupt header, or the
 * WASM runtime failing to load on a locked-down network) we still hand back a
 * native backend rather than nothing. The browser is often more forgiving than
 * the probe, and a real playback error surfaces a better message than a
 * pre-emptive refusal.
 */
export async function createEngine(source: MediaSourceInput): Promise<EngineCreation> {
  let probe: ProbeResult;
  try {
    probe = await probeSource(source);
  } catch (err) {
    console.warn('[engine] probe failed, falling back to native playback', err);
    return {
      engine: new NativeBackend(),
      probe: {
        container: '',
        tracks: [],
        durationHint: null,
        backend: 'native',
        reason: 'could not inspect the file; trying the browser directly',
      },
    };
  }

  switch (probe.backend) {
    case 'native':
      return { engine: new NativeBackend(), probe };
    case 'remux':
      return { engine: new RemuxBackend(probe.tracks), probe };
    case 'decode':
      return { engine: new UnsupportedBackend(probe), probe };
  }
}

/**
 * Human-readable summary of how a file is being played, for the UI.
 */
export function describeBackend(probe: ProbeResult): string {
  switch (probe.backend) {
    case 'native':
      return 'Direct playback';
    case 'remux':
      return 'Remuxed to MP4';
    case 'decode':
      return 'Software decoding';
  }
}
