/**
 * Copy the libav.js WASM runtime into `app/app/public/libav/`.
 *
 * The runtime cannot be bundled: its loader resolves the `.wasm` binary
 * relative to its own URL, so the glue and the binary must stay siblings on
 * disk. Serving them as static assets is the only arrangement that survives
 * both the dev server and a production build.
 *
 * Because the copy is checked in, it can silently drift from the installed
 * package on an upgrade. This script is what keeps the two in step. Run it
 * after bumping `@libav.js/variant-webcodecs`.
 */
import { readdir, mkdir, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', '@libav.js', 'variant-webcodecs', 'dist');
const target = join(root, 'app', 'public', 'libav');

/**
 * The non-threaded WASM build only. Threading needs `SharedArrayBuffer`, which
 * requires COOP/COEP headers the app cannot rely on from a static host, and the
 * asm.js fallback is another 4.5MB for browsers that predate WebAssembly,
 * none of which can run WebCodecs anyway.
 */
const WANTED = /^libav-webcodecs\.mjs$|^libav-[\d.]+-webcodecs\.wasm\.(mjs|wasm)$/;

if (!existsSync(source)) {
  console.error('[sync-libav] @libav.js/variant-webcodecs is not installed.');
  process.exit(1);
}

const files = (await readdir(source)).filter((name) => WANTED.test(name));

if (files.length === 0) {
  console.error('[sync-libav] no matching runtime files. Did the layout change?');
  process.exit(1);
}

// Clear first so a version bump does not leave the old .wasm behind, which
// would otherwise ship a stale binary alongside the new loader.
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const name of files) {
  await copyFile(join(source, name), join(target, name));
  console.log(`[sync-libav] ${name}`);
}

console.log(`[sync-libav] ${files.length} files synced to app/public/libav/`);
