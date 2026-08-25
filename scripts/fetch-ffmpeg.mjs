/**
 * Download the FFmpeg build Cadence ships and place it in `src-tauri/ffmpeg/`.
 *
 * The binaries are deliberately not committed. They are ~75MB, they are not
 * ours, and a repository that carries its own copy of somebody else's compiler
 * output goes stale the moment upstream fixes a decoder. This fetches a pinned
 * release instead, and the bundler picks the result up as a resource.
 *
 * The LGPL build, not the GPL one, and now the whole licensing position rests
 * on that choice: Cadence itself is proprietary, and a GPL FFmpeg beside a
 * proprietary program is a licence problem where an LGPL one is not. What the
 * LGPL build gives up is the GPL-only encoders, chiefly x264: nothing Cadence
 * needs, since the encoders it does reach for are the ones on the graphics
 * card. Do not switch this to a GPL build to gain one.
 *
 * The `shared` variant matters for the same reason. The LGPL lets a closed
 * program use the library only if the user can replace that library with their
 * own build of it, which separate `.dll` files satisfy and a static link does
 * not.
 *
 * The `shared` variant, not the static one. Static would mean two ~70MB
 * executables that each contain their own copy of every codec; shared is two
 * small programs beside one set of libraries, for less than half the size.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, rm, readdir, rename, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'src-tauri', 'ffmpeg');
const scratch = join(root, 'src-tauri', '.ffmpeg-download');

/* A release branch, not master. Upstream publishes both under the same tag, and
   master moves whenever anything lands: a player that plays a file today and
   fails on it tomorrow, with no commit in between to explain why, is the worst
   kind of bug to be handed. The branch still takes fixes, so this name is
   checked against the release listing rather than assumed. */
const BUILD = 'ffmpeg-n8.1-latest-win64-lgpl-shared-8.1';
const URL = `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/${BUILD}.zip`;

/** What we keep out of the archive. */
const WANTED = /\.(exe|dll)$/i;

/* ffplay is a video player, which this project already has one of. It is 18MB
   of SDL window that nothing here would ever launch. */
const UNWANTED = /^ffplay\.exe$/i;

async function download(url, dest) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  await pipeline(response.body, createWriteStream(dest));
}

async function main() {
  if (existsSync(join(target, 'ffmpeg.exe')) && !process.argv.includes('--force')) {
    console.log('FFmpeg already present. Pass --force to fetch it again.');
    return;
  }

  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });

  const archive = join(scratch, 'ffmpeg.zip');
  console.log(`Fetching ${BUILD}...`);
  await download(URL, archive);
  const { size } = await stat(archive);
  console.log(`Fetched ${(size / 1024 / 1024).toFixed(1)}MB, extracting...`);

  // Expand-Archive rather than a zip library: this build only runs on Windows,
  // where it is already installed, and a dependency for one call is not worth
  // the supply chain it brings with it.
  await run('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath "${archive}" -DestinationPath "${scratch}" -Force`,
  ]);

  const [extracted] = (await readdir(scratch, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(scratch, entry.name));
  if (!extracted) throw new Error('the archive held no directory');

  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  const bin = join(extracted, 'bin');
  let kept = 0;
  for (const name of await readdir(bin)) {
    if (!WANTED.test(name) || UNWANTED.test(name)) continue;
    await rename(join(bin, name), join(target, name));
    kept += 1;
  }

  /* The licence text, kept out of the archive along with the binaries it
     covers.

     This is not tidiness. The LGPL asks that a copy of its terms accompany the
     work it is distributed with, and until the repository went private the
     public source tree was doing that job by accident. It cannot now, so the
     text has to travel with the install itself. `resources` already globs this
     directory, so a file dropped here is a file that lands beside the
     libraries on every machine Cadence is installed on.

     Absence is fatal rather than skippable: an FFmpeg shipped with no licence
     beside it is the exact thing this step exists to prevent, and a warning
     scrolling past in a build log would not stop it. */
  const notices = (await readdir(extracted)).filter((name) => /^LICENSE/i.test(name));
  if (notices.length === 0) {
    throw new Error(
      'the archive carried no licence file, and the binaries cannot be shipped without one',
    );
  }
  for (const name of notices) {
    // Prefixed, because on an installed machine this file sits in a directory
    // next to Cadence's own and needs to say whose terms it states.
    await rename(join(extracted, name), join(target, `FFmpeg-${name}`));
    kept += 1;
  }

  await rm(scratch, { recursive: true, force: true });
  console.log(`Placed ${kept} files in src-tauri/ffmpeg/`);
}

main().catch((err) => {
  console.error(`Could not fetch FFmpeg: ${err.message}`);
  process.exitCode = 1;
});
