import { isDesktop, probeMedia } from '@/lib/desktop';
import { canPlayNatively, extensionOf, nativeMimeForExtension } from './capabilities';
import type { MediaSourceInput, MediaTrack, ProbeResult } from './types';

/**
 * Decide how a source should be played.
 *
 * Two answers, cheapest first:
 *
 *   1. `native`: the browser demuxes and decodes it on its own. No second
 *      process, no repackaging, hardware decode. Most MP4 lands here.
 *   2. `stream`: FFmpeg opens the file and hands the browser fragmented MP4.
 *      Everything else lands here, which is the point: the container stops
 *      being the thing that decides whether a file plays.
 *
 * Inspection is FFmpeg's too. It used to be libav compiled to WebAssembly,
 * reading the file through a Blob, which meant a four gigabyte film was read
 * into memory to find out what was in it.
 */

/** What ffprobe reports for one stream. Only the fields Cadence reads. */
interface ProbeStream {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  channels?: number;
  sample_rate?: string;
  width?: number;
  height?: number;
  disposition?: Record<string, number>;
  tags?: Record<string, string>;
}

interface ProbePayload {
  streams?: ProbeStream[];
  format?: { format_name?: string; duration?: string };
  /** Added by the shell: what it intends to do with the streams. */
  cadence?: { copyVideo?: boolean; copyAudio?: boolean };
}

/**
 * Fast path: can a bare `<video>` element handle this without any inspection?
 *
 * Deliberately conservative. It only answers yes for containers the browser
 * demuxes itself, and only by extension, so it costs nothing. A `.mkv` never
 * passes even though most hold perfectly ordinary H.264, because no browser
 * demuxes Matroska.
 */
export function canProbablyPlayNatively(source: MediaSourceInput): boolean {
  const mime = nativeMimeForExtension(extensionOf(source.name));
  if (!mime) return false;
  return canPlayNatively(mime);
}

function trackFrom(stream: ProbeStream, playable: boolean): MediaTrack | null {
  const type = stream.codec_type;
  if (type !== 'video' && type !== 'audio' && type !== 'subtitle') return null;

  const tags = stream.tags ?? {};
  const sampleRate = stream.sample_rate ? Number(stream.sample_rate) : undefined;

  return {
    id: String(stream.index ?? 0),
    type,
    codec: stream.codec_name ?? 'unknown',
    language: tags.language && tags.language !== 'und' ? tags.language : undefined,
    label: tags.title || undefined,
    default: stream.disposition?.default === 1,
    playable,
    channels: stream.channels,
    sampleRate: Number.isFinite(sampleRate) ? sampleRate : undefined,
    width: stream.width,
    height: stream.height,
  };
}

/**
 * Inspect a source and say how to play it.
 *
 * Only a path can be inspected, because only a path is something FFmpeg can
 * open. A `File` or a remote URL is handed to the browser as-is, which is all
 * that was ever possible for them.
 */
export async function probeSource(source: MediaSourceInput): Promise<ProbeResult> {
  if (source.kind !== 'path' || !isDesktop()) {
    return {
      container: extensionOf(source.name),
      tracks: [],
      durationHint: null,
      backend: 'native',
      reason: 'handed straight to the browser',
      copyVideo: true,
      copyAudio: true,
    };
  }

  const payload = (await probeMedia(source.path)) as ProbePayload | null;

  /* Inspection failing is not a reason to refuse the file. FFmpeg is often
     stricter than the browser about a damaged header, and a real playback
     error names the problem better than a pre-emptive apology does. */
  if (!payload?.streams?.length) {
    return {
      container: extensionOf(source.name),
      tracks: [],
      durationHint: null,
      backend: 'native',
      reason: 'could not inspect the file; trying the browser directly',
      copyVideo: true,
      copyAudio: true,
    };
  }

  const container = payload.format?.format_name ?? extensionOf(source.name);
  const duration = Number(payload.format?.duration);
  const copyVideo = payload.cadence?.copyVideo ?? true;
  const copyAudio = payload.cadence?.copyAudio ?? true;

  /* Every track is playable now, which is the whole point. The flag stays on
     the type because it is what the track menus read, and because a browser
     source still has tracks nothing can promise anything about. */
  const tracks = payload.streams
    .map((stream) => trackFrom(stream, true))
    .filter((track): track is MediaTrack => track !== null);

  const nativeContainer = canProbablyPlayNatively(source);
  const backend = nativeContainer && copyVideo && copyAudio ? 'native' : 'stream';

  return {
    container,
    tracks,
    durationHint: Number.isFinite(duration) && duration > 0 ? duration : null,
    backend,
    reason: describe(backend, copyVideo, copyAudio),
    copyVideo,
    copyAudio,
  };
}

function describe(backend: string, copyVideo: boolean, copyAudio: boolean): string {
  if (backend === 'native') return 'the browser opens this container itself';
  if (copyVideo && copyAudio) return 'repackaged; both streams copied untouched';
  if (copyVideo) return 'repackaged; the audio codec cannot reach a browser';
  if (copyAudio) return 'the video codec cannot reach a browser';
  return 'both streams are being converted';
}
