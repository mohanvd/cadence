# Changelog

All notable changes to Cadence are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- ASS and SSA subtitles are drawn as they were written. The format is not a
  subtitle format so much as a small drawing language: a line carries where it
  sits on the frame, in what face, at what size and angle and colour, how it is
  outlined, and how any of that changes while it is on screen. It is what a
  translated sign is written in, and what puts the translation onto the sign
  rather than under the picture.

  Cadence used to convert these to WebVTT, which has none of that. The
  sentences arrived and everything else was quietly dropped, so a sign painted
  on a wall came out as a caption at the bottom with no indication of what it
  was labelling, and a line of karaoke came out as a line of text.

  They are given to libass now, unconverted. It is the library mpv and VLC draw
  these with, and using it rather than writing another one is the whole point:
  ASS has no specification worth the name, and its real definition is what
  libass does with it.

- The fonts a script asks for. Two sources, because scripts use both: the faces
  a rip carries inside itself, extracted from the file, and the faces it names
  and assumes the machine has, read from the machine.

  The second half is not a nicety. libass runs inside the webview, and a
  webview may not read the fonts on the computer it is running on without
  asking permission first — a question nobody can answer usefully, asked in the
  middle of a film. So the shell reads them, which it is an ordinary program
  and perfectly allowed to do, and hands over the ones asked for. Without it an
  Arabic subtitle is drawn in a font with no Arabic in it and every letter
  arrives as an empty box.

  The faces a script names are fetched before the first frame rather than when
  the renderer first misses one, because a font that arrives after the frame it
  was wanted for leaves that frame blank.

- `.ass` and `.ssa` files from disk, dropped on the window or chosen from the
  menu, alongside `.srt` and `.vtt`. They are read with the same encoding
  detection, which they need for the same reason: a script downloaded from the
  internet declares nothing about how it was written.

### Changed

- The appearance settings are offered only for subtitles Cadence draws itself.
  A script chooses its own fonts and colours and positions, and a Blu-ray's
  were drawn once by the disc; for those the panel holds only Timing, and
  Timing only for a file from disk. Overriding either would be answering a
  question the author already answered.

## [0.4.1] - 2026-08-20

### Added

- The subtitles on a Blu-ray play. A disc's subtitles are not text but small
  pictures, drawn once by whoever authored it, and until now Cadence listed
  them greyed with a note that reading them would mean OCR. That note was
  wrong, and it was wrong in a way worth naming: OCR is what turns a picture of
  a sentence back into the sentence, which is needed to search it or restyle it
  and is not needed to look at it. A Blu-ray player shows these without reading
  them. So does this, now.

  The track is copied out of the container rather than decoded on the way —
  the pictures are already compressed, so there is nothing for FFmpeg to do but
  find the packets — and Cadence decodes them itself: the run-length encoding,
  the palette, the position of each line on the frame the disc was authored
  against. A film's worth is a few seconds of work and a few megabytes held.

  They are placed where the disc says, scaled to however large the video is
  being drawn, so a line lands on the same part of the picture in a window and
  on a television. The one liberty taken is the one the text tracks already
  take: a line low in the frame steps up when the control bar appears. A sign
  or a caption higher up does not, because the bar was never going to cover it.

  Nothing about them can be restyled, and the settings panel says so by not
  being there. There is no font to change and no colour to choose — the disc
  made those decisions, which is the whole reason the format exists.

  DVD subtitles are pictures too, in a different encoding, and are still
  listed unusable. That is now a statement about work not yet done rather than
  about a difficulty that was never there.

### Changed

- The badge on a subtitle track that is pictures reads `Image` and the track
  can be chosen. One that Cadence genuinely cannot read reads `Unreadable`.
  These used to be the same word for the same reason, and are not the same
  thing.

## [0.4.0] - 2026-08-19

### Added

- Subtitles that are inside the video. Until now the menu took an `.srt` or a
  `.vtt` from disk and nothing else, so a film that arrived subtitled — which
  is most of what an MKV is used for — played as though it had none, and the
  only way to read it was to go and find on the internet a copy of a track
  already in the file. Every text track in the container is now listed by name
  and language and shown on choosing.

  The fragments carry picture and sound and drop everything else, so a chosen
  track is lifted out of the file separately by FFmpeg and converted to
  WebVTT. That costs a pass over the container, seconds on a large film, and
  the menu says so while it runs rather than appearing to have ignored the
  click. It is done once per track: switching a track off and back on does not
  pay for it again.

  Blu-ray and DVD subtitles are listed and cannot be chosen. They are not text
  but pictures of text, and reading them means OCR, which is a different
  program. They are shown greyed rather than hidden, because a disc rip whose
  only subtitles are images should say that, not look like a film nobody
  subtitled.

  Nothing is guessed about encoding, which is the flaw in reading a subtitle
  file from disk: Matroska stores text as UTF-8 and FFmpeg emits UTF-8, so
  Arabic that would arrive from a downloaded `.srt` as mojibake arrives from
  inside the film intact.

- The next video plays when this one ends. The folder a file was opened from
  is the queue — there is no playlist to build and none to save, because a
  season of television is already arranged on a disk and asking anybody to
  arrange it a second time inside a player is asking for work they have done.
  Skip buttons appear in the control bar, the media keys and the system's Now
  Playing panel drive them, and the top bar says which of how many is playing.

  The order is the order the names read rather than the order the disk returns
  them in, which is not the same thing: sorted as text, "Episode 10" comes
  before "Episode 2", and a season plays 1, 10, 11, 2. Runs of digits are
  compared as numbers.

  Looping a file suppresses the advance. Repeat is an instruction about this
  video, and going on to the next one would obey the queue and disobey the
  person who asked.

- Cadence draws the subtitles itself now, rather than handing the cues to the
  browser to paint. The browser will do it, and the reason not to let it is
  everything it will not do while doing it: native cues are reachable only
  through `::cue`, which takes a short list of text properties and no position
  at all.

  Three things follow from owning the drawing. The text steps up out of the way
  when the control bar appears and settles back when it goes — it used to sit
  behind the buttons, which is where a line goes unread. The backdrop is one
  box behind a whole line rather than a separate box behind each fragment the
  cue happened to be split into. And a right-to-left line is laid out as one,
  so Arabic reads as Arabic.

  How far the text steps is measured from the bar rather than written down,
  because the bar's height follows the interface density the viewer chose. A
  number in the stylesheet would have been right at one setting and would have
  put the subtitles through the buttons at the others.

- The subtitle menu is panels rather than one list: the tracks, an Options
  panel behind them, and a panel of values behind each setting. Choosing a
  language happens often and takes one press; choosing a typeface happens once
  and is no longer in the way of it.

  What can be set has grown with the room to put it: font, size, text colour
  and opacity, backdrop colour and opacity, and the edge drawn around the
  glyphs. The edge is the one that matters and looks like it does not — a white
  line crossing a snow field disappears without one, and it is what makes
  turning the backdrop off a choice rather than a mistake.

  The size is a percentage of a base tied to the height of the window rather
  than a pixel count, so the setting means the same thing in a small window and
  across a television.

- A subtitle file that is not UTF-8 is decoded as what it actually is. Arabic
  subtitles are still commonly written in windows-1256, and every one of them
  arrived as mojibake. The file itself says nothing about its encoding, so it
  is read from the bytes: a byte-order mark if there is one, then strict UTF-8,
  which bytes that are not UTF-8 overwhelmingly fail; only then is anything
  guessed. The guess is settled by coherence — real writing is in one alphabet,
  and a wrong decoding scatters letters across several.

- Tracks are marked the way a film marks them: `CC` for the version written for
  someone who cannot hear the room, `Forced` for the handful of lines meant to
  be read by everybody, `Image` for the ones that are pictures. A film
  routinely carries three tracks called "English", and until something says
  which is which, choosing between them is guesswork.

### Fixed

- Any video with a space in its path failed to play, and said only that ffprobe
  could not read it. The page builds the streaming URL with `URLSearchParams`,
  which writes a space as `+` because that is what its encoding does; the shell
  only percent-decoded, so the plus stayed and the path named a file nobody
  had. It hid because the files it spares are the ones anybody tests with: an
  MP4 the browser demuxes never asks the shell for a stream, so reaching it
  needed a Matroska — or anything else FFmpeg has to open — with a space in its
  name or in a folder above it. Which is most films anybody owns.

  A plus that is genuinely part of a name is sent percent-encoded and still
  arrives as a plus: the decoding is ordered so it cannot be mistaken for a
  space.
- The timing offset moved the cues of whichever text track the element listed
  first. That was this player's own track until a container contributed one of
  its own, and then it was a coin toss. It moves the track being shown.
- The offset was also lost, silently, whenever the video element was rebuilt —
  which is what a backend falling back mid-file does. The readout went on
  claiming a correction that was no longer applied to anything. It is
  re-applied when the track is parsed again.
- The timing control was offered for every track, including the ones that
  cannot be out of time. A track lifted out of the film was authored against
  that film; what drifts is a subtitle downloaded for another release. It now
  appears only for a file opened from disk, where it means something.
- Every text track was switched on together. Harmless while this player's was
  the only one present, and double subtitles on screen the moment an MP4 the
  browser demuxed brought its own.

## [0.3.1] - 2026-08-19

### Fixed

- The volume boost multiplied the volume rather than extending it, so with the
  boost at 3x the slider governed only the first third of what could be heard
  and was dead across the rest of its travel. It now raises the top of the
  range the slider runs to: full travel is 3x, a third of it is exactly normal
  volume, and the slider is worth touching at any setting.
- The boost badge stayed in the control bar whenever it was on. Among a row of
  transport buttons a stray figure reads as another control rather than as the
  state of the one beside it, so it appears and disappears with the volume
  slider it belongs to.
- Playback speed showed "1x" permanently, which in a row of icons looks like a
  setting that is switched on, and it was the only text among them, so it never
  matched their size or weight. It is the speed icon at normal speed and the
  figure at any other.
- The boost control was a fixed box with its contents centred, which left the
  figure crowding the track on one side and floating on the other.
- The volume area collapsed while its own menu was open, so the menu could slide
  out from under the pointer on the way to it.
- No menu in the player closed when the pointer went down outside it. Every one
  of them had to be dismissed by pressing the button that opened it, which is
  not how a menu behaves anywhere. It hid for so long because a menu is chrome,
  and chrome fades out a few seconds after the pointer stops moving: a menu that
  was still open looked exactly like one that had closed.
- Dismissing a menu made the volume slider blink out and back. Closing hands
  focus to the button that opened the menu, and the area was obeying two rules
  that disagreed about what that meant. Only a keyboard focus ring holds it open
  now, and a departure shorter than a moment is not believed at all.
- Every menu handed focus back to its button on closing, which flashed that
  button's tooltip for an instant each time one was dismissed with the mouse.
  Shortcuts listen on the window, so nothing needed the focus.

### Changed

- Play and pause cross-fade into each other rather than swapping between frames.

## [0.3.0] - 2026-08-19

### Added

- Volume boost, for a recording mastered too quietly or a machine that will
  not go loud enough. It appears as a small control at the end of the volume
  slider once the volume is already at its maximum, which is where the need
  for it is discovered, and stays visible while it is on.

  Amplifying naively is what gives boosters their reputation. Material is
  usually mastered with its peaks near full scale, so multiplying it squares
  off everything above a fraction of the range, and that is the crackle people
  describe. A limiter and a soft clip after the gain bound the output below
  full scale by construction. Measured on a full-scale tone: gain alone peaks
  at 3.0000, the chain at 0.9644. The same measurement shows what it cannot do,
  which is make already loud material louder: three times the gain moved that
  tone by less than a decibel, because there was no headroom to use.

### Fixed

- The equalizer and the amplifier each built their own audio graph, and an
  element can be captured by Web Audio only once. Whichever was switched on
  second was refused and did nothing at all, without saying so. They share one
  chain now, which also puts them in the only workable order: a band lifted by
  8 dB clips exactly as an amplifier does, so the limiter has to sit after
  both. The equalizer had no limiter before this.
- The equalizer offered itself for a video played straight from a link, where
  routing the audio does not fail but silences it outright. It says why
  instead.

### Removed

- Two files nothing imported.

## [0.2.3] - 2026-08-18

### Fixed

- Almost no pasted link played. Every one of them was asked for with
  `crossOrigin`, which makes the request cross-origin and has the browser
  discard the response of any server that does not answer with a matching
  header. Most video hosts do not send one, so the video was refused before a
  byte of it was decoded — and the message shown blamed the format, which was
  never the problem.
- The recent list lost the location of every file it listed. The path was
  written when a file was opened and dropped again when the list was read
  back, so clicking an entry offered the file picker for a file whose location
  the player was holding. Posters went the same way, which is why the tiles
  were grey.
- An HEVC file said the browser could not play the format. The browser had
  said it could: `canPlayType`, `MediaSource.isTypeSupported` and
  `VideoDecoder.isConfigSupported` all answer yes for HEVC on Windows, and the
  element then refuses the file. They answer from a codec list, not from a
  decoder. Cadence now learns instead of asking — a codec is trusted until a
  file fails on it, after which every inspection routes around it — so the
  first such film costs one failed attempt and none after it do.
- MP3 audio inside an MP4 was being copied through untouched to a Media Source
  that will not accept it, even though the same browser plays it from disk.
- Converting picked the first encoder present in the FFmpeg build rather than
  the first that works on the machine. `h264_nvenc` is in every build and in no
  computer without an NVIDIA card, and converting is how HEVC now reaches the
  browser. Each candidate is made to encode a frame before it is chosen.
- Asking for the playback pipeline before it had finished starting was answered
  with "there is none", and the page believed it for the rest of the session.
  Starting is what runs FFmpeg to survey the machine, and double-clicking a
  video is the most common way Cadence launches, so the race was easy to lose.

### Changed

- Thumbnails come from FFmpeg, so the recent tiles and the previews on the
  scrub bar work for every file the player opens rather than only the ones the
  browser demuxes by itself. Entries already in the list without a picture are
  filled in on sight.
- A video played from a link cannot be screenshotted — reading pixels back out
  of it is what its origin forbids — and says so rather than failing silently.

## [0.2.2] - 2026-08-18

### Fixed

- A file with a saved position started, jumped to where it was left, and
  stopped there. Seeking past the buffered part while watching did the same.
  Both are one bug: a seek that far rebuilds the stream, an element handed a
  new source is a paused one, and a resume is itself a seek. Every file watched
  more than once paused itself a second after opening.

## [0.2.1] - 2026-08-18

### Fixed

- The update ring spun for a moment before showing a percentage. Zero progress
  was being read as unknown progress, and those are different: a download that
  has not delivered a byte yet is at the start of something measurable. It now
  only turns when the server genuinely sends no size, and turns more slowly
  when it does, because a fast spinner reads as a stall being covered up.

## [0.2.0] - 2026-08-18

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

### Fixed

- Every icon is drawn at one weight. Lucide draws on a 24 unit grid, so a
  stroke of 2 comes out at 2px in a 24px box and 1.5px in an 18px one, and call
  sites were choosing a size and a stroke independently. There were seven
  different weights in one window, which is what made the interface look
  assembled out of several other people's applications.
- An update says it is downloading. It used to appear only once the download
  had finished, and from the outside a slow download and a broken update
  channel looked exactly alike.

### Removed

- The WebAssembly demuxer, its 2.5MB runtime, the script that kept the two in
  step, and the backend whose only job was to explain that a file could not be
  played. Nothing is refused now, so nothing needs explaining.
- The browser's File System Access layer: an IndexedDB store of file handles, a
  memory cache to beat the click deadline, and a permission negotiation with
  three outcomes. A file has one identity now, its path, and the shell provides
  it for a dropped file, a picked file and a double-clicked file alike.
- The mini player. It asked for Document Picture-in-Picture, which WebView2
  does not implement, so pressing it produced an apology and nothing else.
- Subtitle search, which called an endpoint that answers 501 without an
  OpenSubtitles key. A menu item that always fails teaches people a feature is
  broken rather than absent. Local `.srt` and `.vtt` files are unaffected.
- The phone layout: a compact control bar with notch insets, a thumb-reachable
  transport, swipe gestures and an orientation lock, in a Windows application.
  Its breakpoint was 640px, which is this window's own minimum width.

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

[0.2.2]: https://github.com/mohanvd/cadence/releases/tag/v0.2.2
[0.2.1]: https://github.com/mohanvd/cadence/releases/tag/v0.2.1
[0.2.0]: https://github.com/mohanvd/cadence/releases/tag/v0.2.0
[0.1.1]: https://github.com/mohanvd/cadence/releases/tag/v0.1.1
[0.1.0]: https://github.com/mohanvd/cadence/releases/tag/v0.1.0
