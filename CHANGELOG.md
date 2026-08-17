# Changelog

All notable changes to Cadence are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/mohanvd/cadence/commits/main
