import { isDesktop, probeMedia } from '@/lib/desktop';
import {
  canPlayNatively,
  containerCodecString,
  extensionOf,
  mediaSourceAccepts,
  mseCodecString,
  nativeMimeForExtension,
} from './capabilities';
import { decodes } from './decoding';
import type { BackendKind, MediaSourceInput, MediaTrack, ProbeResult } from './types';

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

interface Route {
  backend: BackendKind;
  copyVideo: boolean;
  copyAudio: boolean;
}

/**
 * Reconcile three opinions about a file into one route.
 *
 * The shell says which streams it can lift out of the container untouched. The
 * browser says which it will accept. And `decoding` says which it has actually
 * been seen to decode on this machine, which is the only one of the three ever
 * tested against a real file.
 *
 * They disagree more often than they sound like they would. This webview
 * reports HEVC as playable and then refuses an HEVC file outright; it plays
 * MP3 from disk and refuses the same audio through Media Source. Asking one of
 * the three and believing it is how a file ends up at a decoder that has no
 * use for it.
 */
function route(
  source: MediaSourceInput,
  tracks: readonly MediaTrack[],
  shellCopyVideo: boolean,
  shellCopyAudio: boolean,
): Route {
  const video = tracks.find((track) => track.type === 'video');
  const audio = tracks.find((track) => track.type === 'audio');
  const trusted = decodes(video?.codec) && decodes(audio?.codec);

  /* A plain element, if the browser demuxes this container *and* takes what is
     inside it. The container alone was the old test, and it is the one that
     sent an HEVC MP4 to an element that could not decode it. */
  const containerMime = nativeMimeForExtension(extensionOf(source.name));
  const nativeMime = containerMime && containerCodecString(containerMime, tracks);
  if (trusted && shellCopyVideo && shellCopyAudio && nativeMime && canPlayNatively(nativeMime)) {
    return { backend: 'native', copyVideo: true, copyAudio: true };
  }

  /* Otherwise FFmpeg, copying whatever Media Source will take and converting
     the rest. What is tested here is the exact string the stream backend will
     declare, so the answer and the declaration cannot drift apart. */
  const accepts = (copyVideo: boolean, copyAudio: boolean): boolean =>
    (!copyVideo || decodes(video?.codec)) &&
    (!copyAudio || decodes(audio?.codec)) &&
    mediaSourceAccepts(mseCodecString(tracks, { copyVideo, copyAudio }));

  // Cheapest first, and converting video is by far the more expensive of the
  // two, so audio is given up before it.
  const candidates: [boolean, boolean][] = [
    [shellCopyVideo, shellCopyAudio],
    [shellCopyVideo, false],
    [false, shellCopyAudio],
    [false, false],
  ];
  for (const [copyVideo, copyAudio] of candidates) {
    if (accepts(copyVideo, copyAudio)) return { backend: 'stream', copyVideo, copyAudio };
  }

  // Nothing was accepted, which should not happen for H.264 and AAC. Converting
  // both is the honest last try, and it fails loudly rather than silently.
  return { backend: 'stream', copyVideo: false, copyAudio: false };
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

export interface ProbeOptions {
  /**
   * Inspect a link with FFmpeg and play it through FFmpeg, rather than handing
   * it to the browser.
   *
   * Off by default, and deliberately: a link the browser can open is opened
   * faster, seeks by byte range, and costs no second process. This is what the
   * player falls back to once the browser has already refused it, at which
   * point a round trip to ffprobe is no longer the expensive option.
   */
  forceStream?: boolean;
}

/**
 * Inspect a source and say how to play it.
 *
 * FFmpeg opens paths and URLs alike, so both can be inspected. A `File` cannot:
 * it is a handle inside the page with no name on disk, and it goes to the
 * browser as-is because that is the only thing it can go to.
 */
export async function probeSource(
  source: MediaSourceInput,
  { forceStream = false }: ProbeOptions = {},
): Promise<ProbeResult> {
  const target =
    source.kind === 'path' ? source.path : forceStream && source.kind === 'url' ? source.url : null;

  if (target === null || !isDesktop()) {
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

  const payload = (await probeMedia(target)) as ProbePayload | null;

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

  /* Subtitle streams are left out. They are not carried in the fragments, so
     listing them would put entries in the subtitle menu that select nothing.
     Lifting them out of the container is the obvious next thing FFmpeg could be
     asked for, and until it is asked, the menu should not imply it was.

     Everything else is playable, which is the whole point. */
  const tracks = payload.streams
    .filter((stream) => stream.codec_type !== 'subtitle')
    .map((stream) => trackFrom(stream, true))
    .filter((track): track is MediaTrack => track !== null);

  const chosen = route(source, tracks, copyVideo, copyAudio);
  // Asked for only after the browser has refused this source once, so letting
  // the route send it back there would be repeating a failure.
  const backend = forceStream ? 'stream' : chosen.backend;

  return {
    container,
    tracks,
    durationHint: Number.isFinite(duration) && duration > 0 ? duration : null,
    backend,
    reason: describe(backend, chosen.copyVideo, chosen.copyAudio),
    copyVideo: chosen.copyVideo,
    copyAudio: chosen.copyAudio,
  };
}

function describe(backend: string, copyVideo: boolean, copyAudio: boolean): string {
  if (backend === 'native') return 'the browser opens this container itself';
  if (copyVideo && copyAudio) return 'repackaged; both streams copied untouched';
  if (copyVideo) return 'repackaged; the audio codec cannot reach a browser';
  if (copyAudio) return 'the video codec cannot reach a browser';
  return 'both streams are being converted';
}
