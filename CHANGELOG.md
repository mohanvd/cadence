# Changelog

All notable changes to Cadence are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.1] - 2026-08-26

### Added

- **The Discord panel says what the presence is doing.** Off, waiting for
  something to play, unable to find Discord, showing, or refused.

  Everything in that module fails quietly, because a player must not stop for
  Discord. That is the right trade while a film is running and the wrong one at
  the moment somebody is working out why their profile is blank: a switch that
  is on, a Discord that is closed and a card that was rejected all looked
  identical from the outside. Now they do not.

## [0.8.0] - 2026-08-26

### Added

- **Cadence can tell Discord what you are playing.** Off by default, and it
  stays off until you switch it on in Settings.

  It talks to the Discord already running on your machine over the pipe that
  program opens for exactly this. No server, no account, no network, and
  nothing at all if Discord is not running.

  The card carries the title, the artist and the record, one to a line, with a
  progress bar that moves on its own: Discord is given the times the track
  starts and ends and draws the rest itself, so a track playing for four
  minutes costs a single message rather than two hundred and forty. Pausing
  stops the bar and says so.

  Album art is looked up by name, from MusicBrainz first and iTunes behind it,
  and refused when neither is confident, because a card wearing the wrong
  sleeve is worse than one wearing the logo. Your files never leave the disk:
  what is sent is the artist and album already printed on the card for
  everyone to read.

  Film titles are a separate switch, and it is also off. A file name says far
  more about the person watching than a song title says about the person
  listening. With it off, a film reads as *Watching something*, which still
  says Cadence is open without saying what is in it.

## [0.7.0] - 2026-08-26

### Changed

- **Back means up, not before.** It closes what is open, the player first,
  then the record or playlist under it, and never crosses between the Files
  and Music tabs. The old behaviour walked a flat list of everywhere you had
  been, which produced the move that made this worth rewriting: put a record
  on, glance at the file screen, come back to the library, press back, and land
  on the file screen. Nothing about that is what "back" meant to the person
  pressing it. They were in the player and wanted to be in the library.

  Forward now undoes the last back and nothing else, which is the only thing
  anybody ever uses forward for.

- **Shuffle is a setting, not a button that plays something.** The one in a
  record's header is the same shuffle the transport shows, and it looks it: on
  or off, and staying that way. Play beside it says pause while that record is
  playing, rather than saying "play" over music already coming out of the
  speakers. Starting a shuffled list begins on a random track. Starting at
  track one and shuffling the rest opened every shuffled record with the same
  song.

- **Cadence is no longer open source.** The source repository is private and
  the licence is proprietary; versions up to and including 0.6.0 stay under the
  MIT licence they were published with, and that grant is not withdrawn.

- **Downloads and updates are addressed through cadence.auva.dev.** They used
  to be addressed through the source repository on GitHub, which meant that
  making that repository private took the download button and every installed
  copy's update channel down with it, in the same minute and without warning.

  Both now go through this site, `/download` and `/latest.json`, which
  redirect to wherever the files actually are. `latest.json`'s address is
  compiled into every binary and can never be changed afterwards, so it had to
  name something permanent. Moving the files again is now one redirect, not a
  new release that the copies needing it could never have received.

  The installers themselves live in a public repository that holds no source.

### Added

- **Playlists come in and go out as `.m3u` files.** Import one made anywhere
  else (a phone, another player, a decade ago) and export any of yours for
  something else to read.

  The interesting half is the finding, not the reading. A list exported from a
  phone names files under a root that exists nowhere on a PC, so a path that
  leads nowhere is looked up by file name, and then by the title and artist its
  own `#EXTINF` line carried. What arrives says how many were found the hard
  way and how many were not found at all, because a list that quietly turns up
  eleven tracks short is worse than one that says so.

- **The extra buttons on a mouse do back and forward.** They have meant that on
  every mouse for twenty years, and the hand reaches for them without asking
  the eye first.

- **Lists can be ordered.** Songs by title, artist, album, recently added or
  longest first; albums by artist, title, year or recently added. The default
  is unchanged, by album, then disc and track, which is right for browsing by
  record and wrong for a flat list of eight thousand tracks, where nobody is
  looking for the fourth song of something.

- **Every folder inside a watched folder is a playlist.** People who keep music
  on a disk have already sorted it, and the sorting is the folders. They appear
  under *From your folders*, derived from what is actually there rather than
  copied into a list that goes stale, nothing to make, nothing to maintain,
  and never wrong after a rescan.

### Fixed

- **A track starts at the beginning.** Having heard half a song yesterday is
  not a request to skip the first half of it today, and in a queue it meant
  every track anybody had ever half-listened to jumped on arriving. The
  position is still kept and still offered (one click, in the player) and
  nothing seeks on its own. A film still resumes silently, because a film is
  the thing that should.

  The offer waits to be answered rather than expiring after eight seconds. A
  track starts with the player put away, so the whole eight seconds used to
  elapse behind a bar with nowhere to show it.

- Playlists and folders are laid out as tiles, the same shape and size as the
  albums grid, rather than as wide rows with most of the window empty beside
  them. Three sections of one library should look like one library.

- A stray null byte had been sitting in the source since the library was
  written, joining an album's name to its artist. It worked, invisibly, and is
  now the escape it should always have been.

- **The FFmpeg licence ships with FFmpeg.** Nine LGPL binaries were being
  installed with no copy of the terms they are licensed under; while the source
  was public the repository was satisfying that by accident, and going private
  removed it. The text is now extracted from the upstream archive and installed
  beside the libraries, and the build fails outright if the archive arrives
  without one.

## [0.6.0] - 2026-08-20

### Added

- Cadence plays music. MP3, M4A, FLAC, WAV, Opus, Ogg, AAC, WMA, Monkey's
  Audio, WavPack and Matroska audio open by drop, by the file dialog, and by
  double-clicking one in Explorer, and the installer registers Cadence for all
  of them.

  Nothing had to be taught to decode them. Every one of these formats already
  played, the pipeline has read them since the day it was written, and they
  were turned away by a list of extensions that only had video on it. The
  sentence people were shown was that Cadence does not open .mp3 files, about a
  file it would have played had it been let past the door.

  A folder of music is a queue in exactly the way a season of television is:
  opening the second track means the third one follows, in the order the names
  read. That is one list rather than two on purpose, so an album sitting beside
  a video does not silently end the queue.

- **Your music, as a library.** Point Cadence at the folder your music lives
  in and it reads the tags once (title, artist, album, album artist, track,
  disc, year, genre) and keeps them. Albums are a wall of sleeves, artists are
  a list to read down, and the search box matches each word against any field,
  so *auva light* finds *First Light* by Auva.

  A first scan of a large collection takes about a minute; every scan after it
  takes a second, because a file whose size and modification time have not
  changed is not read again.

  Nothing is scanned uninvited. A player that walks your disk the first time it
  opens is spending your machine on a question you did not ask.

- **Sleeves.** Inside the file first, because on a compilation that picture
  belongs to the track; beside it second, which is where every ripper leaves
  one. They are scaled on the way out, because album art is routinely stored three
  thousand pixels square, and they appear on the tiles, on the now-playing
  card, and blurred behind it for colour.

- **A queue you chose, with shuffle and repeat.** Play an album, an artist, a
  search or a playlist and the rest follows behind it. Shuffling does not
  scramble what is on screen, so the list stays readable; turning it off puts
  you back in the written order on the same track. Opening a file from Explorer
  still hands the queue back to the folder it came from, exactly as before.

- **Playlists.** A name and an order and nothing else. Stored as paths, so they
  survive a rescan, and a track on a drive that is unplugged today is still
  there tomorrow rather than quietly deleted.

- **Playback that continues while you look for the next record.** Going back to
  the library puts the player away rather than stopping it, and a bar along the
  bottom keeps the sleeve, the transport and the way back. Nothing is torn down
  to get there: the same element keeps playing, hidden.

- **One window bar.** The wordmark, back and forward, the two screens and the
  search all sit in the strip that carries the window. There is no second bar
  under it. A title bar with another bar beneath it doing the same job is what
  made this look like a web page in a frame.

  Back and forward are the whole of the navigation. Opening a record, changing
  section, expanding the player and going back are all positions, so one arrow
  in one place undoes any of them, and no panel needs a close button of its
  own in the corner of the thing it is showing you.

- **Right-click menus.** Play, play next, add to the queue, add to a playlist,
  edit, show in Explorer. WebView2's own menu (Back, Refresh, Save as, Print,
  Inspect) is gone from the whole window; it was the browser underneath
  introducing itself, and three of its five items would have done something
  actively wrong here.

- **Editing what a file says it is.** Rename a track, fix an artist, set a
  year or replace a sleeve, for one track or for a whole record at once. It is
  written into the file rather than kept in a database here, so every other
  player on the machine sees the correction too, and it survives copying the
  file somewhere else. Nothing is re-encoded: the streams are copied and only
  the header changes, so a lossless track stays bit-for-bit what it was.

- **A player that knows it is playing music.** The sleeve fills the frame, the
  title and artist come from the tags rather than the filename, the transport
  grows shuffle and repeat and loses subtitles, and the settings menu drops
  everything that is about a picture: brightness, zoom, fill, frame grab,
  rather than offering them greyed out. Windows gets the music card too, with
  somewhere to put an artist and an album.

### Fixed

- Cover art is no longer mistaken for a film. An MP3 with a sleeve embedded in
  it reports, to anything that asks, a video track: one mjpeg frame, flagged as
  an attached picture. Cadence read the flag nowhere, so an album arrived
  described as a video in a codec no browser will take, was routed as though
  its picture needed converting, and played as a black rectangle where the
  now-playing card belongs.

- A lossless track is no longer converted to AAC. FLAC and Opus now go into the
  stream untouched, because this webview decodes both; ALAC, WavPack, Monkey's
  Audio and raw PCM cannot be copied and are converted to FLAC instead of to
  192k AAC. For a film that conversion cost nothing anybody could hear beside
  the video. For an album it was the whole reason the file was kept.

- Music mode no longer announces the obvious. "No video track" is worth saying
  about a concert `.mkv` that turns out to be a recording; about an album it is
  a notification every three minutes concerning the thing you chose.

- The white buttons had white text on them. `text-base` is a font size in
  Tailwind rather than the colour token of that name, so the class was real,
  the build had nothing to warn about, and the label was invisible. Nothing had
  used that button style until now.

- A file that has been deleted no longer teaches Cadence the wrong lesson. The
  browser reports a file it cannot fetch and a file it cannot decode as the
  same failure, and Cadence learns from the second kind: a codec that fails
  once is distrusted from then on, so that the next film in it goes straight to
  FFmpeg rather than paying the same failed attempt again. Deleting one H.264
  file was therefore enough to have every H.264 file afterwards quietly
  re-encoded, for good, for a reason nothing on screen could explain. The disk
  is now consulted before the lesson is drawn.

## [0.5.1] - 2026-08-20

### Fixed

- The Windows "Now Playing" panel says **Cadence** rather than **Unknown app**.
  It is the panel the volume keys raise and a headset button reaches, and it
  had the right title and the right buttons over the wrong name since the day
  it was wired up.

  The cause is worth writing down, because nothing about it is visible from the
  page. A web page can ask Windows for that panel, and Cadence did, but
  Windows names the panel after the *process* that asked, and the process that
  asks on a page's behalf is the browser it runs in. Here that is WebView2, a
  program Windows knows only as `msedgewebview2.exe` and cannot name or draw an
  icon for. No amount of correcting the page could have fixed it.

  So the shell asks instead. It is an ordinary program with a name and an icon
  Windows already has. The installer writes both onto the Start menu shortcut,
  and it takes the panel for its own window. The browser's copy is switched off
  in the same breath, or there would be two entries in the flyout. What the
  page keeps is everything that needs knowing: what is playing, how far in,
  whether there is another file after this one, and what to do when a button is
  pressed.

- A file that is no longer there says so. Deleted, renamed, or on a disk that
  has been unplugged, it used to be reported as a file "in a format the browser
  cannot play", which is an answer to a question nobody asked and sends the
  reader looking for a codec.

  The browser is not being careless: it reports a file it cannot fetch and a
  file it cannot decode as the same failure, and from inside the page the two
  are genuinely indistinguishable. The shell can simply look, so now it does,
  after the failure rather than before every attempt, because the check is only
  worth making once something has already gone wrong.

## [0.5.0] - 2026-08-20

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
  asking permission first: a question nobody can answer usefully, asked in the
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

  The track is copied out of the container rather than decoded on the way,
  the pictures are already compressed, so there is nothing for FFmpeg to do but
  find the packets, and Cadence decodes them itself: the run-length encoding,
  the palette, the position of each line on the frame the disc was authored
  against. A film's worth is a few seconds of work and a few megabytes held.

  They are placed where the disc says, scaled to however large the video is
  being drawn, so a line lands on the same part of the picture in a window and
  on a television. The one liberty taken is the one the text tracks already
  take: a line low in the frame steps up when the control bar appears. A sign
  or a caption higher up does not, because the bar was never going to cover it.

  Nothing about them can be restyled, and the settings panel says so by not
  being there. There is no font to change and no colour to choose: the disc
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
  `.vtt` from disk and nothing else, so a film that arrived subtitled, which
  is most of what an MKV is used for, played as though it had none, and the
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
  is the queue. There is no playlist to build and none to save, because a
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
  when the control bar appears and settles back when it goes. It used to sit
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
  glyphs. The edge is the one that matters and looks like it does not: a white
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
  guessed. The guess is settled by coherence: real writing is in one alphabet,
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
  needed a Matroska, or anything else FFmpeg has to open, with a space in its
  name or in a folder above it. Which is most films anybody owns.

  A plus that is genuinely part of a name is sent percent-encoded and still
  arrives as a plus: the decoding is ordered so it cannot be mistaken for a
  space.
- The timing offset moved the cues of whichever text track the element listed
  first. That was this player's own track until a container contributed one of
  its own, and then it was a coin toss. It moves the track being shown.
- The offset was also lost, silently, whenever the video element was rebuilt,
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
  byte of it was decoded, and the message shown blamed the format, which was
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
  decoder. Cadence now learns instead of asking. A codec is trusted until a
  file fails on it, after which every inspection routes around it, so the
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
- A video played from a link cannot be screenshotted, because reading pixels back out
  of it is what its origin forbids, and says so rather than failing silently.

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

[0.8.1]: https://github.com/mohanvd/cadence-releases/releases/tag/v0.8.1
[0.8.0]: https://github.com/mohanvd/cadence-releases/releases/tag/v0.8.0
[0.7.0]: https://github.com/mohanvd/cadence-releases/releases/tag/v0.7.0
[0.6.0]: https://github.com/mohanvd/cadence-releases/releases/tag/v0.6.0
[0.5.1]: https://github.com/mohanvd/cadence-releases/releases/tag/v0.5.1
[0.5.0]: https://github.com/mohanvd/cadence-releases/releases/tag/v0.5.0
[0.4.1]: https://github.com/mohanvd/cadence-releases/releases/tag/v0.4.1
[0.4.0]: https://github.com/mohanvd/cadence-releases/releases/tag/v0.4.0
[0.3.1]: https://github.com/mohanvd/cadence-releases/releases/tag/v0.3.1
[0.3.0]: https://github.com/mohanvd/cadence-releases/releases/tag/v0.3.0
[0.2.2]: https://github.com/mohanvd/cadence-releases/releases/tag/v0.2.2
[0.2.1]: https://github.com/mohanvd/cadence-releases/releases/tag/v0.2.1
[0.2.0]: https://github.com/mohanvd/cadence-releases/releases/tag/v0.2.0
[0.1.1]: https://github.com/mohanvd/cadence-releases/releases/tag/v0.1.1
[0.1.0]: https://github.com/mohanvd/cadence-releases/releases/tag/v0.1.0
