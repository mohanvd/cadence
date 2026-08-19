/**
 * Reading a subtitle file that was written by somebody else.
 *
 * A track lifted out of a video needs none of this: Matroska stores text as
 * UTF-8 and FFmpeg emits UTF-8, so what arrives is already right. A `.srt`
 * downloaded from the internet is the opposite case — it carries no
 * declaration of its own encoding, and a great many of them are not UTF-8.
 */

/**
 * Encodings a subtitle file is realistically written in, beyond UTF-8.
 *
 * Each of these maps all 256 bytes to letters, so none of them can fail on
 * arbitrary input and none of them can be ruled out by trying it. Telling them
 * apart is what `coherence` below is for.
 */
const LEGACY_ENCODINGS = [
  'windows-1256', // Arabic
  'windows-1251', // Cyrillic
  'windows-1252', // Western European
  'windows-1250', // Central European
  'windows-1254', // Turkish
  'windows-1255', // Hebrew
  'iso-8859-7', // Greek
];

/** Which alphabet a character belongs to, for the coherence test below. */
function scriptOf(code) {
  if (code >= 0x0600 && code <= 0x06ff) return 'arabic';
  if (code >= 0x0400 && code <= 0x04ff) return 'cyrillic';
  if (code >= 0x0590 && code <= 0x05ff) return 'hebrew';
  if (code >= 0x0370 && code <= 0x03ff) return 'greek';
  if (code >= 0x00c0 && code <= 0x024f) return 'latin';
  return null;
}

/**
 * How much a decoding looks like prose rather than like a wrong guess.
 *
 * Every candidate produces letters, so a decoding cannot be judged by whether
 * it worked. What separates the right one is that real writing is in one
 * alphabet: Arabic text read as Cyrillic comes out as Cyrillic letters, but
 * sprinkled with the accents, symbols and stray marks that the intended
 * alphabet's bytes happen to land on. So the score is the size of the largest
 * single alphabet, less everything outside it.
 */
function coherence(text) {
  const scripts = new Map();
  let stray = 0;

  for (const character of text) {
    const code = character.codePointAt(0);
    if (code === undefined) continue;
    // Replacement characters mean the decoder gave up, which is decisive.
    if (code === 0xfffd) return -Infinity;
    // ASCII is common to every candidate and so tells them apart not at all.
    if (code < 0x80) continue;

    const script = scriptOf(code);
    if (script) scripts.set(script, (scripts.get(script) ?? 0) + 1);
    else stray += 1;
  }

  const largest = Math.max(0, ...scripts.values());
  return largest - stray;
}

/**
 * Decode a subtitle file's bytes into text.
 *
 * In order of how much each step actually knows:
 *
 *   1. A byte-order mark. The file says what it is, and nothing beats being
 *      told.
 *   2. Strict UTF-8. Not a guess either: UTF-8 has a shape, and bytes that
 *      are not UTF-8 overwhelmingly fail to have it, so decoding without
 *      error is close to proof. This is where every modern file stops.
 *   3. The legacy candidates, scored. Only here is anything guessed, and only
 *      for files that have already proved they are not UTF-8.
 *
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function decodeSubtitle(buffer) {
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0xff && bytes[1] === 0xfe) return strip(new TextDecoder('utf-16le').decode(bytes));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return strip(new TextDecoder('utf-16be').decode(bytes));

  try {
    return strip(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    /* Not UTF-8. Fall through to the candidates. */
  }

  let best = strip(new TextDecoder('windows-1252').decode(bytes));
  let bestScore = -Infinity;

  for (const encoding of LEGACY_ENCODINGS) {
    let text;
    try {
      text = new TextDecoder(encoding).decode(bytes);
    } catch {
      // A label this engine does not carry. There are others.
      continue;
    }
    const score = coherence(text);
    if (score > bestScore) {
      bestScore = score;
      best = strip(text);
    }
  }

  return best;
}

/** Remove a byte-order mark left at the head of the decoded text. */
function strip(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Converts SRT content to WebVTT format.
 * @param {string} srt
 * @returns {string}
 */
export function srtToVtt(srt) {
  const blocks = srt.trim().replace(/\r\n/g, '\n').split(/\n\n+/);
  let vtt = 'WEBVTT\n\n';

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 2) continue;
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const textLines = lines.slice(lines.indexOf(timeLine) + 1);
    const convertedTime = timeLine.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    vtt += `${convertedTime}\n${textLines.join('\n')}\n\n`;
  }

  return vtt;
}

/**
 * @param {File} file
 * @returns {Promise<string>} object URL for VTT
 */
export async function loadSubtitleFile(file) {
  const text = decodeSubtitle(await file.arrayBuffer());
  const ext = file.name.split('.').pop()?.toLowerCase();
  const vttContent = ext === 'srt' ? srtToVtt(text) : text;
  const blob = new Blob([vttContent], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
}
