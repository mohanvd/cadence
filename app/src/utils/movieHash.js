/**
 * OpenSubtitles "moviehash".
 *
 * Their canonical algorithm: take the file size, then add every 64-bit
 * little-endian word of the first 64 KiB and the last 64 KiB, letting the sum
 * wrap at 64 bits. The result is rendered as 16 lowercase hex digits.
 *
 * The point of hashing only the ends is that it identifies a *release* without
 * reading the file: a two-hour rip is matched from 128 KiB. That matters far
 * more here than it does in a desktop client: matching by hash returns
 * subtitles already timed to this exact encode, which is the difference between
 * subtitles that fit and subtitles the user then has to nudge by hand.
 *
 * Arithmetic is in BigInt because the intermediate sum genuinely exceeds
 * `Number.MAX_SAFE_INTEGER`; doing it in doubles silently loses the low bits
 * and produces a hash that matches nothing.
 */

const CHUNK_SIZE = 65536;
const MASK_64 = (1n << 64n) - 1n;

/** Sum an ArrayBuffer as little-endian 64-bit words. */
function sumChunk(buffer) {
  const view = new DataView(buffer);
  let total = 0n;
  for (let offset = 0; offset + 8 <= view.byteLength; offset += 8) {
    total = (total + view.getBigUint64(offset, true)) & MASK_64;
  }
  return total;
}

/**
 * @param {File|Blob} file
 * @returns {Promise<string|null>} 16-char hex hash, or null if the file is too
 *   small for the algorithm to be defined.
 */
export async function computeMovieHash(file) {
  const size = file.size;
  // Below two chunks the head and tail would overlap, and OpenSubtitles simply
  // does not define a hash for such files.
  if (size < CHUNK_SIZE * 2) return null;

  const [head, tail] = await Promise.all([
    file.slice(0, CHUNK_SIZE).arrayBuffer(),
    file.slice(size - CHUNK_SIZE, size).arrayBuffer(),
  ]);

  let hash = BigInt(size) & MASK_64;
  hash = (hash + sumChunk(head)) & MASK_64;
  hash = (hash + sumChunk(tail)) & MASK_64;

  return hash.toString(16).padStart(16, '0');
}
