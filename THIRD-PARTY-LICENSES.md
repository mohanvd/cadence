# Third-party licences

Cadence itself is [proprietary](LICENSE). It is distributed with components
that are not, and those keep their own terms. Where they conflict with
Cadence's licence, theirs prevail for their own code.

## FFmpeg

Cadence decodes with FFmpeg. It is the only bundled component whose licence
places obligations on how Cadence is built and shipped, so it is written out in
full here.

| | |
|---|---|
| Licence | **LGPL-3.0-or-later** |
| Build | `ffmpeg-n8.1-latest-win64-lgpl-shared-8.1` from [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) |
| Version | `n8.1.2-44-g7c533d0f86` |
| Source | <https://github.com/FFmpeg/FFmpeg/tree/release/8.1> |
| Shipped as | `ffmpeg.exe`, `ffprobe.exe` and seven `av*`/`sw*` DLLs in `resources/ffmpeg/` |

Version **3**, not 2.1: the build is configured `--enable-version3`, which
upgrades the LGPL to v3 so that components such as `libopencore-amr` can be
included. It is not configured `--enable-gpl` or `--enable-nonfree`, and
`libx264` and `libx265` are explicitly disabled. Nothing GPL is present, and
nothing may be added.

### What this requires, and how it is met

- **The library must stay replaceable.** The `shared` build is used, so the
  libraries are separate `.dll` files a user can substitute with their own. A
  static build would put Cadence's own source under the LGPL's relinking terms.
  This is why `scripts/fetch-ffmpeg.mjs` pins the `shared` variant.
- **The library must not be modified.** It is downloaded from upstream and
  shipped byte-for-byte. Modifying it would mean publishing the modifications.
- **The licence text must accompany the binaries.** `FFmpeg-LICENSE.txt` is
  extracted from the upstream archive and installed alongside the DLLs.
  A public source tree satisfies this only by accident, and only for as long
  as it stays public, which is why the fetch script fails outright if the
  archive carries no licence file.
- **Reverse engineering for debugging modifications to FFmpeg must stay
  permitted.** Cadence's licence carves this out of its own restrictions.
- **The corresponding source must be available.** The exact revision is named
  above.

### Before this goes to Android

**Do not carry this build to mobile.** LGPL-**3** on an app store is a known
problem: v3 carries the anti-circumvention and installation-information terms
that a store's distribution terms sit badly with, and on Android a user cannot
practically swap out a bundled `.so`, which is the freedom the LGPL is
protecting. Two ways out, both fine:

- Use the platform decoder. [Media3/ExoPlayer](https://developer.android.com/media/media3)
  is Apache-2.0 and has no such terms.
- Or build FFmpeg without `--enable-version3`, which keeps it at LGPL-2.1 and
  drops the components that forced the upgrade.

This is a decision to make before writing the mobile player, not after.

## JASSUB

The other LGPL component, and the other one to be careful with. ASS and SSA
subtitles are drawn by libass compiled to WebAssembly and shipped as
[`jassub`](https://github.com/ThaUnknown/jassub), pinned to `2.5.14`.

Its SPDX declaration is
`LGPL-2.1-or-later AND (FTL OR GPL-2.0-or-later) AND MIT AND MIT-Modern-Variant AND ISC AND NTP AND Zlib AND BSL-1.0`.
The dual term is FreeType, which Cadence takes under the **FTL** rather than
the GPL. Nothing GPL is taken.

Version **2.1** here, not 3, so the mobile problem described above does not
apply to this one.

The requirement is the same shape as FFmpeg's and is met the same way: the
`.wasm` and worker files are emitted as separate assets and fetched at runtime
rather than inlined into the JavaScript bundle. That is what keeps them
replaceable. `SubtitleOverlay.tsx` imports them with Vite's `?url` suffix
precisely to force this. Inlining them, which a bundler will happily do to a
small asset, would turn a loaded library into a linked one.

## Bundled at runtime

| Component | Licence | Notes |
|-----------|---------|-------|
| [Tauri](https://tauri.app) | MIT / Apache-2.0 | The desktop shell. |
| [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) | Microsoft proprietary | Ships with Windows; Cadence does not redistribute it. |
| [libass](https://github.com/libass/libass) | ISC | Inside FFmpeg, and inside JASSUB. |
| [dav1d](https://code.videolan.org/videolan/dav1d), [libvpx](https://www.webmproject.org/code/), [libopus](https://opus-codec.org) | BSD-style | Inside FFmpeg. |

## Built with

The Rust crates and npm packages Cadence is compiled from are MIT or
Apache-2.0 except where their own manifests say otherwise. They are linked into
the executable and impose no obligation beyond attribution, which their
licences travel with in the dependency lockfiles.

## Not used

Playback was once planned to move to [mpv](https://mpv.io). It will not: mpv
renders into its own window, and WebView2 cannot composite anything behind or
between its own layers, so an mpv surface could only ever sit on top of the
interface rather than beneath it. The measurement is what settled it. FFmpeg
feeding the browser's own media stack is the design, and this section is here
so the question is not reopened from memory.
