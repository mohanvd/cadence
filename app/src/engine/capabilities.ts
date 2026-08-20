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
 *
 * `audio/mp4` rather than `video/mp4` for a file with no picture, and it is not
 * a cosmetic difference: Chromium answers the two separately, and it takes
 * FLAC and Opus under the audio spelling while refusing them under the video
 * one. Declaring an album as video is how a lossless track ends up converted to
 * AAC for no reason anybody could have found.
 */
export function mseCodecString(
  tracks: readonly { type: string; codec: string }[],
  {
    copyVideo = true,
    copyAudio = true,
    /* What a converted audio track will arrive as. AAC for anything that was
       already lossy, FLAC for anything that was not — and the shell decides
       which, per track, because it is the one running the encoder. A default
       here would be a second opinion, so this one is only the value used when
       there is no track to have an opinion about. */
    audioFallback = 'mp4a.40.2',
  }: { copyVideo?: boolean; copyAudio?: boolean; audioFallback?: string } = {},
): string {
  const video = tracks.find((track) => track.type === 'video');
  const audio = tracks.find((track) => track.type === 'audio');

  const parts: string[] = [];

  if (video) {
    parts.push((copyVideo && toCodecString(video.codec)) || CONVERTED_VIDEO);
  }
  if (audio) {
    parts.push((copyAudio && toCodecString(audio.codec)) || audioFallback);
  }

  // A file with neither is not something to build a buffer for, but the caller
  // checks `isTypeSupported` and will get a clean refusal rather than a crash.
  return `${video ? 'video' : 'audio'}/mp4; codecs="${parts.join(',')}"`;
}

/**
 * The container's MIME with the codecs actually inside it.
 *
 * The bare container type is not a question worth asking: `video/mp4` alone
 * answers "maybe" for every MP4 ever made, including the ones holding a codec
 * this browser has never decoded. Naming the codecs is what turns it into a
 * question with an answer.
 *
 * Null when a codec has no known RFC 6381 spelling, because a question that
 * cannot be asked honestly should not be asked at all: a silent yes here is a
 * file that opens to a black screen.
 */
export function containerCodecString(
  containerMime: string,
  tracks: readonly { type: string; codec: string }[],
): string | null {
  /* Except where the container already answers it. These hold one codec and
     only ever that one, so there is nothing for a `codecs=` to disambiguate —
     and Chromium, measured in this webview, treats the redundant spelling as a
     type it has never heard of:

       canPlayType('audio/flac')                 -> "probably"
       canPlayType('audio/flac; codecs="flac"')  -> ""

     Saying more than is needed is how a FLAC the element would have played
     from disk gets sent through FFmpeg instead. */
  if (SINGLE_CODEC_CONTAINERS.has(containerMime)) return containerMime;

  const parts: string[] = [];
  for (const kind of ['video', 'audio'] as const) {
    const track = tracks.find((t) => t.type === kind);
    if (!track) continue;
    const codec = toCodecString(track.codec);
    if (!codec) return null;
    parts.push(codec);
  }
  return parts.length ? `${containerMime}; codecs="${parts.join(',')}"` : containerMime;
}

/** Containers that carry exactly one codec, so naming it says nothing new. */
const SINGLE_CODEC_CONTAINERS = new Set(['audio/mpeg', 'audio/flac', 'audio/wav', 'audio/aac']);

const elementCache = new Map<string, boolean>();
const sourceCache = new Map<string, boolean>();
let probeElement: HTMLVideoElement | null = null;

/**
 * Will Media Source accept this?
 *
 * A different question from `canPlayNatively` and not a formality: this webview
 * plays MP3 in a plain element and refuses the identical audio through Media
 * Source, so a track that needs no conversion to be played from disk needs one
 * to arrive in fragments.
 */
export function mediaSourceAccepts(mime: string): boolean {
  const cached = sourceCache.get(mime);
  if (cached !== undefined) return cached;
  const supported =
    typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mime);
  sourceCache.set(mime, supported);
  return supported;
}

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

/**
 * Container extensions a plain `<video>` element can demux.
 *
 * The audio half of this list is what lets an album play with no second
 * process at all: an MP3 or a FLAC goes straight to the element, decoded by
 * the same code the browser uses for every other sound it makes, and FFmpeg is
 * never started. Anything absent here — Windows Media Audio, Monkey's Audio,
 * AIFF, an ALAC rip — takes the stream route instead and arrives
 * repackaged. AIFF is absent on purpose: this webview answers "no" to every
 * spelling of it, so a mapping for it would be a claim that is never true.
 */
const NATIVE_CONTAINERS: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  mp3: 'audio/mpeg',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  aac: 'audio/aac',
};

export function nativeMimeForExtension(ext: string): string | null {
  return NATIVE_CONTAINERS[ext.toLowerCase()] ?? null;
}

export function extensionOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase();
}
