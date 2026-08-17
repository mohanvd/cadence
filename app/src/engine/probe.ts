import {
  canDecodeWithWebCodecs,
  canMseRemux,
  canPlayNatively,
  extensionOf,
  getPlatformCapabilities,
  isWasmOnlyCodec,
  nativeMimeForExtension,
} from './capabilities';
import { getLibAV, nextVirtualFilename } from './libav';
import type { BackendKind, MediaSourceInput, MediaTrack, ProbeResult } from './types';

/**
 * Decide how a source should be played.
 *
 * The routing is a three-tier ladder, cheapest first:
 *
 *   1. `native`: the browser demuxes and decodes it. Zero overhead, hardware
 *                  decode, battery-friendly. Covers most MP4/WebM.
 *   2. `remux`: the *container* is unsupported but the codecs inside are.
 *                  Repackage into fragmented MP4 and feed MSE; still hardware
 *                  decode. This is the big one: most MKV lecture recordings are
 *                  H.264 + AAC and land here.
 *   3. `decode`: the codecs themselves are unsupported (AC3, DTS, VC1...).
 *                  Full WASM demux plus WebCodecs/WASM decode.
 */

/** libav `AVMEDIA_TYPE_*` values, which are stable ABI constants. */
const AVMEDIA_TYPE_VIDEO = 0;
const AVMEDIA_TYPE_AUDIO = 1;
const AVMEDIA_TYPE_SUBTITLE = 3;

function mediaTypeOf(codecType: number): MediaTrack['type'] | null {
  if (codecType === AVMEDIA_TYPE_VIDEO) return 'video';
  if (codecType === AVMEDIA_TYPE_AUDIO) return 'audio';
  if (codecType === AVMEDIA_TYPE_SUBTITLE) return 'subtitle';
  return null;
}

/**
 * Fast path: can a bare `<video>` element handle this without any inspection?
 *
 * Deliberately conservative: it only answers yes for containers the browser
 * natively demuxes. A `.mkv` never passes here even though many contain
 * perfectly playable H.264, because no browser demuxes Matroska.
 */
export function canProbablyPlayNatively(source: MediaSourceInput): boolean {
  const mime = nativeMimeForExtension(extensionOf(source.name));
  if (!mime) return false;
  return canPlayNatively(mime);
}

async function readTracks(source: MediaSourceInput): Promise<{
  container: string;
  tracks: MediaTrack[];
  duration: number | null;
}> {
  const libav = await getLibAV();
  const virtualName = nextVirtualFilename(source.name);

  // `mkreadaheadfile` streams the Blob on demand rather than copying the whole
  // file into the WASM heap, which is essential for multi-GB lecture recordings.
  const blob =
    source.kind === 'file'
      ? source.file
      : await fetch(source.url).then((r) => r.blob());
  await libav.mkreadaheadfile(virtualName, blob);

  let formatCtx = 0;
  try {
    const [ctx, streams] = await libav.ff_init_demuxer_file(virtualName);
    formatCtx = ctx;

    const durationRaw = await libav.AVFormatContext_duration(ctx);
    const durationHi = await libav.AVFormatContext_durationhi(ctx);
    // AV_TIME_BASE is 1e6; duration is a 64-bit value split across two fields.
    const totalMicros = durationHi * 2 ** 32 + durationRaw;
    const duration = totalMicros > 0 ? totalMicros / 1e6 : null;

    const tracks: MediaTrack[] = [];
    for (const stream of streams) {
      const type = mediaTypeOf(stream.codec_type);
      if (!type) continue;

      const codec = await libav.avcodec_get_name(stream.codec_id);
      const track: MediaTrack = {
        id: String(stream.index),
        type,
        codec,
        // Filled in by the caller once a backend is known.
        playable: false,
      };

      if (type === 'video') {
        track.width = await libav.AVCodecParameters_width(stream.codecpar);
        track.height = await libav.AVCodecParameters_height(stream.codecpar);
      } else if (type === 'audio') {
        track.sampleRate = await libav.AVCodecParameters_sample_rate(stream.codecpar);
        track.channels = await libav.AVCodecParameters_ch_layout_nb_channels(
          stream.codecpar,
        );
      }

      tracks.push(track);
    }

    return { container: extensionOf(source.name), tracks, duration };
  } finally {
    if (formatCtx) {
      await libav.avformat_close_input_js(formatCtx).catch(() => {});
    }
    // Readahead files live in their own table, not the normal virtual FS.
    await libav.unlinkreadaheadfile(virtualName).catch(() => {});
  }
}

/**
 * Work out which backend can play the given track set.
 *
 * Marks each track's `playable` flag as a side effect so the UI can grey out
 * an AC3 track that the chosen backend cannot render.
 */
async function chooseBackend(
  tracks: MediaTrack[],
): Promise<{ backend: BackendKind; reason: string }> {
  const caps = getPlatformCapabilities();
  const video = tracks.filter((t) => t.type === 'video');
  const audio = tracks.filter((t) => t.type === 'audio');

  // Any WASM-only codec present in the tracks we would actually play forces
  // the full decode path immediately.
  const primaryVideo = video[0];
  const primaryAudio = audio[0];

  const blockers: string[] = [];
  if (primaryVideo && isWasmOnlyCodec(primaryVideo.codec)) {
    blockers.push(primaryVideo.codec);
  }
  if (primaryAudio && isWasmOnlyCodec(primaryAudio.codec)) {
    blockers.push(primaryAudio.codec);
  }

  if (blockers.length > 0) {
    if (!caps.webCodecs) {
      return {
        backend: 'decode',
        reason: `${blockers.join(' + ')} needs software decoding`,
      };
    }
    return {
      backend: 'decode',
      reason: `${blockers.join(' + ')} is not supported by any browser decoder`,
    };
  }

  // Can MSE take these codecs inside fragmented MP4? If so, remuxing suffices
  // and we keep hardware decode.
  const codecsForMse = [primaryVideo?.codec, primaryAudio?.codec].filter(
    (c): c is string => Boolean(c),
  );

  if (codecsForMse.length > 0 && canMseRemux(codecsForMse)) {
    for (const track of tracks) {
      if (track.type === 'subtitle') {
        track.playable = true;
        continue;
      }
      track.playable = !isWasmOnlyCodec(track.codec) && canMseRemux([track.codec]);
    }
    return {
      backend: 'remux',
      reason: `${codecsForMse.join(' + ')} repackaged for hardware decode`,
    };
  }

  // Last resort: decode frame by frame. Probe each track individually so the
  // UI can distinguish "this audio track works" from "this one is DTS".
  await Promise.all(
    tracks.map(async (track) => {
      if (track.type === 'subtitle') {
        track.playable = true;
        return;
      }
      // WASM-only codecs are decoded by libav itself, so they remain playable
      // on this path even though WebCodecs rejects them.
      track.playable =
        isWasmOnlyCodec(track.codec) ||
        (await canDecodeWithWebCodecs(track.type, track.codec, {
          width: track.width,
          height: track.height,
          sampleRate: track.sampleRate,
          channels: track.channels,
        }));
    }),
  );

  const videoDecodable = primaryVideo
    ? await canDecodeWithWebCodecs('video', primaryVideo.codec, {
        width: primaryVideo.width,
        height: primaryVideo.height,
      })
    : true;

  return {
    backend: 'decode',
    reason: videoDecodable
      ? 'container and codec combination needs full decoding'
      : 'no hardware decoder available; decoding in software',
  };
}

/**
 * Inspect a source and return the tracks plus the backend that should play it.
 *
 * Skips loading the WASM runtime entirely when the browser can play the file
 * natively, which is the common case.
 */
export async function probeSource(source: MediaSourceInput): Promise<ProbeResult> {
  if (canProbablyPlayNatively(source)) {
    return {
      container: extensionOf(source.name),
      // Native tracks are enumerated from the element once metadata loads.
      tracks: [],
      durationHint: null,
      backend: 'native',
      reason: 'played directly by the browser',
    };
  }

  const { container, tracks, duration } = await readTracks(source);
  const { backend, reason } = await chooseBackend(tracks);

  return { container, tracks, durationHint: duration, backend, reason };
}
