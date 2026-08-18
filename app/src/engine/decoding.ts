/**
 * What this installation can actually decode, as opposed to what it claims.
 *
 * Every capability API the webview offers lies about HEVC on Windows. Measured
 * on a machine with Microsoft's HEVC Video Extension installed, in the webview
 * Cadence actually ships in:
 *
 *   canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"')  -> "probably"
 *   MediaSource.isTypeSupported(same)                   -> true
 *   VideoDecoder.isConfigSupported({codec:'hvc1...'})   -> supported: true
 *   <video src=an actual HEVC file>                     -> error code 4
 *
 * All three answer for a codec list compiled into Chromium; only the fourth
 * involves a decoder. So support is *learned* rather than asked for. A codec
 * starts trusted, and the first file that fails on it moves it to the
 * distrusted set, where it stays: the second HEVC film should not pay the same
 * failed attempt as the first, and neither should the first one after a
 * restart.
 *
 * The verdict is per codec rather than per file because that is the thing that
 * varies. What is on the machine — the platform extension, the graphics
 * driver — changes far less often than the files being opened, and when it
 * does change `forget` is one call away.
 */

const KEY = 'cadence-undecodable';

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((c) => typeof c === 'string') : []);
  } catch {
    return new Set();
  }
}

let distrusted: Set<string> | null = null;

function loaded(): Set<string> {
  distrusted ??= read();
  return distrusted;
}

/** Whether a codec is worth handing to the browser at all. */
export function decodes(codec: string | undefined): boolean {
  if (!codec) return true;
  return !loaded().has(codec.toLowerCase());
}

/**
 * Record that the browser could not decode this codec after all.
 *
 * Called from the one place that knows: a load that failed on a file whose
 * codec the browser had said it would take.
 */
export function markUndecodable(codec: string | undefined): void {
  if (!codec) return;
  const set = loaded();
  const name = codec.toLowerCase();
  if (set.has(name)) return;
  set.add(name);
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* A verdict that survives only this session is still worth having. */
  }
}

/** Drop every learned verdict. For when the machine's decoders change. */
export function forget(): void {
  distrusted = new Set();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
