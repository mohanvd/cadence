/**
 * Browser capability probing.
 *
 * Every answer here is cached: `canPlayType` and `isTypeSupported` are cheap but
 * called on every source load, and `VideoDecoder.isConfigSupported` is async and
 * genuinely expensive on some drivers.
 */

export interface PlatformCapabilities {
  mse: boolean;
  webCodecs: boolean;
  /** Chrome-only; enables the true mini-player window. */
  documentPiP: boolean;
  fileSystemAccess: boolean;
  /** WebCodecs can be driven off the main thread. */
  workerWebCodecs: boolean;
}

export function getPlatformCapabilities(): PlatformCapabilities {
  return {
    mse: typeof self.MediaSource !== 'undefined',
    webCodecs:
      typeof self.VideoDecoder !== 'undefined' &&
      typeof self.AudioDecoder !== 'undefined',
    documentPiP: 'documentPictureInPicture' in self,
    fileSystemAccess: 'showOpenFilePicker' in self,
    workerWebCodecs:
      typeof self.VideoDecoder !== 'undefined' &&
      typeof self.OffscreenCanvas !== 'undefined',
  };
}

/**
 * Map an ffmpeg/libav codec name to an RFC 6381 codec string.
 *
 * The profile/level suffixes are deliberately conservative baselines. They are
 * used only for *support probing*, never written into the muxed output, so
 * guessing low is safe: if the baseline probe passes, the real stream almost
 * certainly decodes too.
 */
const CODEC_STRINGS: Record<string, string> = {
  h264: 'avc1.64001E',
  avc: 'avc1.64001E',
  avc1: 'avc1.64001E',
  hevc: 'hvc1.1.6.L93.B0',
  h265: 'hvc1.1.6.L93.B0',
  vp8: 'vp8',
  vp9: 'vp09.00.10.08',
  av1: 'av01.0.04M.08',
  mpeg4: 'mp4v.20.9',
  aac: 'mp4a.40.2',
  mp3: 'mp3',
  opus: 'opus',
  vorbis: 'vorbis',
  flac: 'flac',
  ac3: 'ac-3',
  eac3: 'ec-3',
  alac: 'alac',
};

/** Codecs no browser decodes; they always require WASM decoding. */
const WASM_ONLY_CODECS = new Set([
  'dts',
  'dtshd',
  'truehd',
  'pcm_s16le',
  'pcm_s24le',
  'wmav2',
  'wmapro',
  'vc1',
  'wmv3',
  'mpeg2video',
  'msmpeg4v3',
  'rv40',
]);

export function toCodecString(codec: string): string | null {
  return CODEC_STRINGS[codec.toLowerCase()] ?? null;
}

export function isWasmOnlyCodec(codec: string): boolean {
  return WASM_ONLY_CODECS.has(codec.toLowerCase());
}

/**
 * Codecs that belong in WebM rather than MP4 when remuxing.
 *
 * MP4 can technically carry VP9 and AV1, but doing so requires a correct
 * `vpcC`/`av1C` configuration box that cannot always be reconstructed from a
 * Matroska source, so the resulting file parses as valid MP4 and is then rejected
 * by the browser's demuxer. Routing the VP family to WebM, their native
 * container, sidesteps the problem entirely.
 */
const WEBM_CODECS = new Set(['vp8', 'vp9', 'av1', 'opus', 'vorbis']);

export type RemuxFormat = 'mp4' | 'webm';

/** The container these codecs should be repackaged into. */
export function remuxFormatFor(codecs: string[]): RemuxFormat {
  return codecs.some((c) => WEBM_CODECS.has(c.toLowerCase())) ? 'webm' : 'mp4';
}

const mseCache = new Map<string, boolean>();

/**
 * Can MSE accept these codecs in the container we would remux them into?
 * This is the question that decides whether remuxing is enough.
 */
export function canMseRemux(codecs: string[]): boolean {
  const caps = getPlatformCapabilities();
  if (!caps.mse) return false;

  const resolved = codecs.map(toCodecString);
  if (resolved.some((c) => c === null)) return false;

  const mime = mseMimeFor(codecs);
  if (!mime) return false;

  const cached = mseCache.get(mime);
  if (cached !== undefined) return cached;

  const supported = self.MediaSource.isTypeSupported(mime);
  mseCache.set(mime, supported);
  return supported;
}

/** Full MSE MIME type for the remuxed output, or null if unmappable. */
export function mseMimeFor(codecs: string[]): string | null {
  const resolved = codecs.map(toCodecString);
  if (resolved.some((c) => c === null)) return null;
  const format = remuxFormatFor(codecs);
  return `video/${format}; codecs="${resolved.join(',')}"`;
}

const elementCache = new Map<string, boolean>();
let probeElement: HTMLVideoElement | null = null;

/** Can a plain `<video>` element play this container/codec combination? */
export function canPlayNatively(mime: string): boolean {
  const cached = elementCache.get(mime);
  if (cached !== undefined) return cached;

  probeElement ??= document.createElement('video');
  // `canPlayType` returns '', 'maybe', or 'probably'. Treat only a positive
  // answer as support. '' is a hard no.
  const answer = probeElement.canPlayType(mime);
  const supported = answer === 'probably' || answer === 'maybe';
  elementCache.set(mime, supported);
  return supported;
}

const decoderCache = new Map<string, boolean>();

/** Can WebCodecs decode this codec in hardware or software? */
export async function canDecodeWithWebCodecs(
  type: 'video' | 'audio',
  codec: string,
  extra: { width?: number; height?: number; sampleRate?: number; channels?: number } = {},
): Promise<boolean> {
  const caps = getPlatformCapabilities();
  if (!caps.webCodecs) return false;

  const codecString = toCodecString(codec);
  if (!codecString) return false;

  const key = `${type}:${codecString}:${extra.width ?? 0}x${extra.height ?? 0}`;
  const cached = decoderCache.get(key);
  if (cached !== undefined) return cached;

  try {
    let supported: boolean;
    if (type === 'video') {
      const result = await self.VideoDecoder.isConfigSupported({
        codec: codecString,
        codedWidth: extra.width ?? 1920,
        codedHeight: extra.height ?? 1080,
      });
      supported = result.supported === true;
    } else {
      const result = await self.AudioDecoder.isConfigSupported({
        codec: codecString,
        sampleRate: extra.sampleRate ?? 48000,
        numberOfChannels: extra.channels ?? 2,
      });
      supported = result.supported === true;
    }
    decoderCache.set(key, supported);
    return supported;
  } catch {
    // An unknown codec string throws rather than returning `supported: false`.
    decoderCache.set(key, false);
    return false;
  }
}

/** Container extensions a plain `<video>` element can demux. */
const NATIVE_CONTAINERS: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  oga: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
};

export function nativeMimeForExtension(ext: string): string | null {
  return NATIVE_CONTAINERS[ext.toLowerCase()] ?? null;
}

export function extensionOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase();
}
