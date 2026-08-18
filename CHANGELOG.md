# Changelog

All notable changes to Cadence are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Cadence plays the formats it always claimed to. MKV, AVI, WMV, FLV, TS, M2TS
  and MPEG open, along with the codecs inside them: HEVC, AC-3, DTS and the
  rest. The installer registered Cadence for all of these and the player
  accepted four of them, so double-clicking an `.avi` opened a window that then
  failed on it.
- FFmpeg is bundled and does the demuxing, in its own process, handing the
  player fragmented MP4 over a loopback socket.

### Changed

- Nothing is re-encoded unless it has to be. H.264, HEVC and AV1 are copied
  through untouched and still decode on the graphics card. Only a codec that
  cannot reach a browser at all is converted, which for audio costs almost
  nothing. When a video stream does need converting, the encoder comes from
  what the machine has: NVENC, Quick Sync or AMF before anything on the CPU.
- Inspecting a file no longer reads it. The previous demuxer ran in the page
  and was handed the file as a Blob, so finding out what was in a four gigabyte
  film meant holding four gigabytes.

### Removed

- The WebAssembly demuxer, its 2.5MB runtime, the script that kept the two in
  step, and the backend whose only job was to explain that a file could not be
  played. Nothing is refused now, so nothing needs explaining.
- The browser's File System Access layer: an IndexedDB store of file handles, a
  memory cache to beat the click deadline, and a permission negotiation with
  three outcomes. A file has one identity now, its path, and the shell provides
  it for a dropped file, a picked file and a double-clicked file alike.

## [0.1.1]

### Changed

- Nothing but the version. This release exists to prove the update channel
  carries one: the installer's wizard was removed by modifying the template the
  updater itself runs, and the only test of that is a second release arriving on
  a machine running the first.

## [0.1.0] - 2026-08-17

### Added

- Cadence is a desktop application for Windows, installed from a signed
  installer rather than run in a browser tab.
- Automatic updates. A new release is verified against a key built into the
  app, fetched in the background, and applied on restart at a moment the viewer
  picks. Never in the middle of a film.
- An installer with no wizard. Running it shows a progress window and then the
  player, with nothing to click through and no directory to choose.
- The window draws its own title bar, so the application is one surface rather
  than a dark page under a grey system strip.
- File associations. Double-clicking a video, or "Open with", opens it. A
  second file opened while Cadence is running reaches the window already open
  instead of starting another copy.
- Recent files remember where the file is. A path survives a restart, so a tile
  opens what it shows instead of asking for the file again.
- Recent files show a frame from the video, sampled once when it was opened.

### Changed

- cadence.auva.dev is a landing page, built with Astro, that ships no
  JavaScript at all. It was 216 kB of React to render a page with no state.
- The repository is two projects: `app/` for the player and `site/` for the
  website, sharing only the design tokens and one component.
- Interface fonts are bundled from source rather than served as static files,
  so both projects build them from one copy and neither can drift.
- Files opened through the dialog, and files dropped on the window, are both
  identified by path. The shell takes the drop before the webview sees it,
  which is the only way a dropped file arrives with a path at all.

### Fixed

- Controls on the video no longer keep focus after a click. A focused button
  turned the space bar into a second press of whatever was clicked last: click
  fullscreen, press space to pause, and the player left fullscreen instead.
- Online subtitle search from the desktop application. It called `/api/...` as
  a same-origin path, which inside the app resolves to a host that does not
  exist, so the request never left the machine.
- The download link on the website pointed at a filename the release does not
  contain, and would have 404ed on the first release.

### Removed

- The progressive web app: the service worker, the offline precache and the web
  app manifest. Every one of them existed to make a browser tab behave like an
  installed program, which is no longer a problem worth solving.
- A router, for an application with one screen.

[0.1.1]: https://github.com/mohanvd/cadence/releases/tag/v0.1.1
[0.1.0]: https://github.com/mohanvd/cadence/releases/tag/v0.1.0
