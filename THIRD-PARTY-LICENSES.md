# Third-party licences

Cadence's own source is [MIT](LICENSE). It is distributed alongside components
that are not, and those keep their own terms.

## Bundled at runtime

| Component | Licence | Notes |
|-----------|---------|-------|
| [Tauri](https://tauri.app) | MIT / Apache-2.0 | The desktop shell. |
| [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) | Microsoft proprietary | Ships with Windows; Cadence does not redistribute it. |

## Planned

Playback is moving from the browser media stack to [mpv](https://mpv.io), which
is **LGPL-2.1-or-later**. That imposes obligations Cadence has to meet, and they
shape how it is built:

- `libmpv` must be linked **dynamically**, shipped as its own library file
  beside the executable. Statically linking it would pull Cadence's own source
  under the LGPL's relinking requirement.
- The library must not be modified. If it ever is, those modifications have to
  be published under the LGPL.
- This file must carry the full licence text and a link to the exact source
  revision the shipped binary was built from.

Cadence staying MIT depends on all three holding. They are recorded here so
that a later change to the build does not quietly break the licence.
