/**
 * What the browser will accept, and what to tell it a stream contains.
 *
 * Answers are cached: `canPlayType` is cheap but asked on every source load.
 *
 * The WebCodecs probing that used to live here has gone with the decoder it
 * served. Deciding whether the page could decode a codec itself only mattered
 * while the page was the last resort; FFmpeg reaches every codec, so the
 * question no longer has anything riding on it.
 */

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

export function toCodecString(codec: string): string | null {
  return CODEC_STRINGS[codec.toLowerCase()] ?? null;
}

/** What FFmpeg produces when it has to replace a track it cannot copy. */
const CONVERTED_VIDEO = 'avc1.64001E';
const CONVERTED_AUDIO = 'mp4a.40.2';

/**
 * The MIME type to declare before appending a single byte of the stream.
 *
 * Media Source checks this against the initialisation segment and rejects
 * everything on a mismatch, so it has to describe what will arrive rather than
 * what is in the file. For a track being converted those are different things:
 * the file may hold DTS, and what arrives is AAC.
 *
 * The output is always MP4, because that is the only container FFmpeg is asked
 * for here. Codecs whose place is really WebM, the VP family, are converted on
 * the way rather than carried into a box that would need a configuration atom
 * nothing can reliably rebuild from a Matroska source.
 */
export function mseCodecString(
  tracks: readonly { type: string; codec: string }[],
  { copyVideo = true, copyAudio = true }: { copyVideo?: boolean; copyAudio?: boolean } = {},
): string {
  const video = tracks.find((track) => track.type === 'video');
  const audio = tracks.find((track) => track.type === 'audio');

  const parts: string[] = [];

  if (video) {
    parts.push((copyVideo && toCodecString(video.codec)) || CONVERTED_VIDEO);
  }
  if (audio) {
    parts.push((copyAudio && toCodecString(audio.codec)) || CONVERTED_AUDIO);
  }

  // A file with neither is not something to build a buffer for, but the caller
  // checks `isTypeSupported` and will get a clean refusal rather than a crash.
  return `video/mp4; codecs="${parts.join(',')}"`;
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
