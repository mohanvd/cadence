# Cadence

A minimal, keyboard-first video player for Windows.

Part of the [Auva](https://auva.dev) ecosystem.

## Install

Download the latest installer from the [releases page](https://github.com/mohanvd/cadence/releases/latest)
and run it. No administrator rights are required.

Cadence updates itself: new releases are downloaded in the background and
applied the next time you restart it.

## Features

- Plays MP4, MKV, AVI, MOV, WMV, FLV, TS, M2TS, MPEG and more, with the codecs
  inside them: H.264, HEVC, AV1, AC-3, DTS
- Drag and drop a video anywhere in the window, or open one from the file dialog
- Double-click any video file to open it in Cadence
- Speed control from 0.25× to 4×, remembered across videos
- Frame-accurate stepping and A–B looping
- Timestamp bookmarks with notes
- Subtitles from a local `.srt` or `.vtt` file, with adjustable timing
- Resumes each video where you stopped
- Save the current frame as a PNG

Files are read from disk and never uploaded.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Space / K | Play / pause |
| ← / → | ±10 seconds |
| J / L | ±30 seconds |
| , / . | Previous / next frame |
| Home / End | Jump to start / end |
| S | Save frame as PNG |
| ? | Show all shortcuts |

## Layout

```
app/         the player: a React interface, built with Vite
site/        cadence.auva.dev: an Astro page that ships no JavaScript
src-tauri/   the shell: a native window, written in Rust
```

The two front ends are separate projects with separate toolchains. They share
one thing, and it is CSS: the site imports the player's stylesheet so that its
picture of the window cannot drift from the window. Neither build contains the
other's code.

That one import has a deployment consequence worth writing down. The site is
deployed from `site/` as the root directory, and Vercel uploads only the root
directory unless told otherwise, so the build fails on `@player/styles/theme.css`
with nothing to explain why. The project needs **Settings → Build and Deployment
→ Root Directory → Include source files outside of the Root Directory** turned
on. It is off by default on a new project.

## Building from source

Cadence is a [Tauri](https://tauri.app) application: a React interface in a
native window, with the shell written in Rust.

You will need [Node.js](https://nodejs.org) 22 or newer, the
[Rust toolchain](https://rustup.rs), and the Visual Studio C++ build tools.
The build tools need the Windows SDK component, which the C++ workload
installs; without it the Rust linker has no `kernel32.lib` to link against.

```bash
npm install
npm run fetch:ffmpeg  # once, before the first desktop build
npm run app:dev       # run the player
npm run app:build     # produce an installer
npm run site:dev      # run the website
```

`npm run dev` serves the interface on its own in a browser, which is a faster
loop for work that does not touch the desktop shell. Playback there is limited
to what the browser opens by itself, because the pipeline below lives in the
shell.

Four things are worth knowing, because none of them has anywhere to say so:

- Cadence plays what it plays because FFmpeg is bundled with it. The binaries
  are not in the repository: they are 138MB of somebody else's build output and
  go stale the moment upstream fixes a decoder, so `npm run fetch:ffmpeg`
  downloads a pinned LGPL build into `src-tauri/ffmpeg/`. The bundler treats
  that directory as a resource, and a build without it produces an installer
  that runs and cannot open a Matroska file.

- `version` in `src-tauri/tauri.conf.json` is a path to `package.json` rather
  than a number. That file is the only place a version is written, so the
  installer, the update manifest and what the app reports cannot drift apart.
- `src-tauri/installer/installer.nsi` is Tauri's own NSIS template, pinned to
  the CLI version, with two changes: the wizard is skipped and the player is
  started afterwards. Both are commented in place. It has to be re-pinned when
  the CLI is upgraded.
- The updater runs that same installer with `/P /R /UPDATE`. Anything done to
  the template has to leave those working, and the only way to prove it is two
  real releases.

## Releasing

Releases are cut from tags. Pushing a `v*` tag builds the installer, signs it,
and opens a draft GitHub release with the update manifest attached; publishing
that draft is what delivers the update to everyone already running Cadence.

`package.json` is the only place a version number is written: the installer and
the version the interface reports are both read from it.

```bash
npm version minor          # commits the bump and tags it
git push --follow-tags
```

The workflow uploads the installer twice: once under the bundler's own name,
`Cadence_<version>_x64-setup.exe`, which is what the update manifest points at,
and once as `Cadence-Setup.exe`, which is what the website links to. The second
exists because a page cannot link to a filename that changes every release.

One secret has to exist on the repository or the release is useless:
`TAURI_SIGNING_PRIVATE_KEY`. Without it the build still produces an installer,
and the updater rejects it.

## Licence

[MIT](LICENSE). Third-party components carry their own terms. See
[THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).
