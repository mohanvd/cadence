# Cadence

A minimal, keyboard-first media player for Windows.

Part of the [Auva](https://auva.dev) ecosystem.

## Install

Download the latest installer from the [releases page](https://github.com/mohanvd/cadence/releases/latest)
and run it. No administrator rights are required.

Cadence updates itself: new releases are downloaded in the background and
applied the next time you restart it.

## Features

- Plays MP4, MKV, AVI, MOV, WMV, FLV, TS, M2TS, MPEG and more, with the codecs
  inside them: H.264, HEVC, AV1, AC-3, DTS
- Plays music too: MP3, M4A, FLAC, WAV, Opus, Ogg, AAC, WMA and more, with the
  picture switched off and the transport where it always is. Lossless stays
  lossless — FLAC and Opus are handed to the decoder untouched, and the formats
  that cannot be are converted to FLAC rather than to AAC
- Drag and drop a file anywhere in the window, or open one from the file dialog
- Double-click any video or audio file to open it in Cadence
- Speed control from 0.25× to 4×, remembered across files
- Frame-accurate stepping
- Timestamp bookmarks with notes
- Subtitles from inside the file — every track it carries, by name and
  language: plain text, styled ASS drawn by libass, or Blu-ray pictures — or
  from a local `.srt`, `.vtt`, `.ass` or `.ssa`, with adjustable timing
- A library for your music: point it at a folder and it reads the tags once —
  albums as sleeves, artists as a list, and a search where each word may match
  a different field. Every folder inside it becomes a playlist, because you
  already did the sorting
- Playlists, shuffle and repeat, and a queue that follows whatever you started
- Playback carries on while you look for the next record, with a bar along the
  bottom to get back to it
- Fix what a file says it is — title, artist, album, year, sleeve — for one
  track or a whole record. It is written into the file, so every other player
  sees the correction too, and nothing is re-encoded
- Plays the rest of the folder: the next file starts when one ends, in the
  order the names read — a season of television and an album alike
- Resumes each file where you stopped
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

Right-click almost anything for what you can do with it.

## Layout

```
app/         the player: a React interface, built with Vite
site/        cadence.auva.dev: an Astro page that ships no JavaScript
src-tauri/   the shell: a native window, written in Rust
```

The two front ends are separate projects with separate toolchains, and neither
one reads a file out of the other's directory. The site used to import the
player's stylesheet so that its picture of the window could not drift from the
window; it carries its own copy now. That import cost a Vercel project setting
to permit reading above the deployed root, and a build failure that said nothing
about why, which is a steep price for a landing page. The note at the top of
`site/src/styles/base.css` says what the copy owes the player and which files to
read it against when the two disagree.

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

Five things are worth knowing, because none of them has anywhere to say so:

- Cadence plays what it plays because FFmpeg is bundled with it. The binaries
  are not in the repository: they are 138MB of somebody else's build output and
  go stale the moment upstream fixes a decoder, so `npm run fetch:ffmpeg`
  downloads a pinned LGPL build into `src-tauri/ffmpeg/`. The bundler treats
  that directory as a resource, and a build without it produces an installer
  that runs and cannot open a Matroska file.

- Subtitle scripts — ASS and SSA — are drawn by libass, compiled to
  WebAssembly and shipped as `jassub`. It is the library mpv and VLC draw them
  with, and it is here for the same reason FFmpeg is: the format has no
  specification worth the name, so a second implementation would only be a
  second set of answers. Like FFmpeg it is LGPL, and like FFmpeg it is pinned
  to an exact version — the player names files inside the package, which is
  not something a minor release promises to keep still.

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
