use std::sync::Mutex;

// Both are only reached from the desktop-only single-instance handler, and an
// unconditional import would be an unused-import error in a mobile build.
#[cfg(desktop)]
use tauri::{Emitter, Manager};

mod fonts;
mod media;
mod music;
#[cfg(windows)]
mod nowplaying;
mod pgs;

/// The FFmpeg pipeline, and whether it is still being built.
///
/// `Unavailable` when the binaries could not be found or the socket could not
/// be opened. Playback then falls back to what the webview can open on its own,
/// which is MP4 and WebM: less than the player promises, but a window that
/// still works beats one that refuses to start.
enum Pipeline {
    Starting,
    Ready(std::sync::Arc<media::Media>),
    Unavailable,
}

struct MediaState(std::sync::Mutex<Pipeline>);

/// How long a caller will wait for startup before giving up on it.
const PIPELINE_WAIT: std::time::Duration = std::time::Duration::from_secs(30);

/// The pipeline, once startup has settled one way or the other.
///
/// Waiting is the whole point of this function. Startup runs FFmpeg several
/// times to find out what this machine can encode, and a page that asks the
/// moment it loads gets there first — as does anyone who double-clicked a video
/// to launch the app, which is the most common way it starts. Answering "there
/// is no pipeline" while one is being built is a lie the page has no way to
/// tell from the truth, and it believes it for as long as it runs.
async fn pipeline(state: &tauri::State<'_, MediaState>) -> Option<std::sync::Arc<media::Media>> {
    let deadline = std::time::Instant::now() + PIPELINE_WAIT;
    loop {
        {
            // Scoped so the guard is dropped before the sleep below: a lock
            // held across an await is a lock held for fifty milliseconds.
            let guard = state.0.lock().ok()?;
            match &*guard {
                Pipeline::Ready(media) => return Some(media.clone()),
                Pipeline::Unavailable => return None,
                Pipeline::Starting => {}
            }
        }
        if std::time::Instant::now() >= deadline {
            return None;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
}

/// Where the page should fetch streams and frames from, and the token that
/// admits it.
#[tauri::command]
async fn media_endpoint(
    state: tauri::State<'_, MediaState>,
) -> Result<Option<media::Endpoint>, ()> {
    Ok(pipeline(&state).await.map(|media| media.endpoint()))
}

/// Everything FFmpeg can tell us about a file: streams, codecs, languages,
/// duration. The page decides what to show from it.
#[tauri::command]
async fn media_probe(
    state: tauri::State<'_, MediaState>,
    path: String,
) -> Result<serde_json::Value, String> {
    match pipeline(&state).await {
        Some(media) => media.describe(&path).await,
        None => Err("playback support is not available".into()),
    }
}

/// One subtitle track from inside a file, as WebVTT the page can show.
///
/// A command rather than a route on the socket, unlike streams and frames.
/// Those are large and continuous and belong on a socket; this is a few tens of
/// kilobytes of text asked for once per track. Returning it straight to the
/// caller also keeps it same-origin, and a `<track>` element pointed at another
/// origin is refused unless the video element is opened for cross-origin reads,
/// which is a change with consequences well beyond subtitles.
#[tauri::command]
async fn media_subtitle(
    state: tauri::State<'_, MediaState>,
    path: String,
    index: u32,
) -> Result<String, String> {
    match pipeline(&state).await {
        Some(media) => media.subtitle(&path, index).await,
        None => Err("playback support is not available".into()),
    }
}

/// One subtitle track as the script it already is, styles and all.
///
/// Separate from `media_subtitle` because they answer different questions. That
/// one asks for the sentences and gets WebVTT; this asks for the whole script —
/// where each line goes, in what font, at what angle — and gets ASS, which is
/// what libass in the page reads.
/// Every font installed on this machine, by name.
///
/// Handed to the renderer as the list of what it may ask for, rather than as
/// the fonts themselves: a machine has hundreds and a script wants three, so
/// they are named here and fetched one at a time as libass finds it needs them.
#[tauri::command]
fn media_font_names() -> Vec<&'static str> {
    fonts::names()
}

/// The fonts come with it. A script that names a face the machine does not have
/// is drawn in something else, which for a sign painted onto a wall is the
/// difference between a translation and a caption — so the rip carries the
/// fonts, and they are no use to the page unless it is told they are there.
#[tauri::command]
async fn media_script(
    state: tauri::State<'_, MediaState>,
    path: String,
    index: u32,
) -> Result<serde_json::Value, String> {
    let Some(media) = pipeline(&state).await else {
        return Err("playback support is not available".into());
    };

    let script = media.script(&path, index).await?;
    // A film with no fonts attached is ordinary, not an error: most subtitles
    // ask for faces every machine already has.
    let fonts = media.fonts(&path).await.unwrap_or_default();

    Ok(serde_json::json!({ "script": script, "fonts": fonts }))
}

/// The shape of a picture subtitle track: when each line appears, where on the
/// frame it sits, and how large it is.
///
/// Not the pictures. Those come from the socket one at a time, for the reason
/// the socket exists at all — a film carries a thousand or so, and handing them
/// all over on the strength of somebody opening the menu would cost several
/// megabytes to show one line.
///
/// The sizes are on the disc's own canvas, which is the frame the subtitles
/// were authored against and usually the video's own. Scaling them to whatever
/// the window happens to be is the page's job, and it is the only party that
/// knows.
#[tauri::command]
async fn media_pictures(
    state: tauri::State<'_, MediaState>,
    path: String,
    index: u32,
) -> Result<serde_json::Value, String> {
    let Some(media) = pipeline(&state).await else {
        return Err("playback support is not available".into());
    };

    let track = media.pictures(&path, index).await?;
    let cues: Vec<serde_json::Value> = track
        .cues
        .iter()
        .map(|cue| {
            serde_json::json!({
                "start": cue.start,
                "end": cue.end,
                "x": cue.x,
                "y": cue.y,
                "width": cue.width,
                "height": cue.height,
            })
        })
        .collect();

    Ok(serde_json::json!({
        "width": track.width,
        "height": track.height,
        "cues": cues,
    }))
}

/* ── The library ── */

/// How many files one scan will take in, however many are down there.
///
/// Not a limit anybody should meet. It is here so that somebody who points
/// Cadence at a whole drive finds out in a minute rather than in an hour, and
/// so that a symlink loop surviving the walk's own depth cap still ends.
const SCAN_LIMIT: usize = 60_000;

/// The event names the page listens for while a scan runs.
const SCAN_PROGRESS: &str = "library-scan";
const SCAN_DONE: &str = "library-scanned";

/// How many files are read at once during a scan.
///
/// Reading a tag costs a process, and almost all of that cost is Windows
/// starting one. Several at a time turns a scan from something you leave the
/// room for into something you watch finish. Bounded by the machine rather
/// than by a number, and left with a core to spare, because a scan should not
/// be the reason the film playing in the other half of the window stutters.
fn scan_width() -> usize {
    std::thread::available_parallelism()
        .map(|count| count.get().saturating_sub(1).max(2))
        .unwrap_or(4)
}

/// The folders the library watches.
#[tauri::command]
fn library_folders(library: tauri::State<'_, music::Library>) -> Vec<String> {
    library.folders()
}

/// Everything the library knows, as it stands.
///
/// Read from memory: this is the list the whole music interface is drawn from,
/// and it is asked for on every visit to it.
#[tauri::command]
fn library_songs(library: tauri::State<'_, music::Library>) -> Vec<music::Song> {
    library.snapshot().songs
}

/// Watch a folder. Returns false when it was already covered by another.
#[tauri::command]
fn library_watch(
    library: tauri::State<'_, music::Library>,
    folder: String,
) -> Result<bool, String> {
    library.watch(folder)
}

/// Stop watching a folder, and forget what was found under it.
#[tauri::command]
fn library_unwatch(
    library: tauri::State<'_, music::Library>,
    folder: String,
) -> Result<(), String> {
    library.unwatch(&folder)
}

/// Walk every watched folder and read the tags of what is in them.
///
/// Two things keep this from being expensive twice. A file whose size and
/// modification time are unchanged since the last scan is not read again — its
/// record is carried across, which is what makes a rescan of a large library
/// take a second rather than a minute. And a scan already running refuses a
/// second one rather than doubling the work and racing itself to write the
/// answer.
///
/// Progress is emitted rather than returned, because the useful thing about a
/// long job is watching it move.
#[tauri::command]
async fn library_scan(
    app: tauri::AppHandle,
    state: tauri::State<'_, MediaState>,
    library: tauri::State<'_, music::Library>,
) -> Result<usize, String> {
    let Some(media) = pipeline(&state).await else {
        return Err("playback support is not available".into());
    };
    let Some(_running) = library.begin_scan() else {
        return Err("a scan is already running".into());
    };

    let folders = library.folders();
    let known = library.known();

    /* The walk is the cheap half: no process per file, only a directory read
    per folder. It happens off the runtime all the same, because a disk that
    has spun down can take seconds to answer the first question. */
    let listed = tauri::async_runtime::spawn_blocking(move || {
        let mut files = Vec::new();
        for folder in &folders {
            let remaining = SCAN_LIMIT.saturating_sub(files.len());
            if remaining == 0 {
                break;
            }
            files.extend(music::walk(std::path::Path::new(folder), remaining));
        }
        files
    })
    .await
    .map_err(|err| err.to_string())?;

    let total = listed.len();
    let _ = app.emit(
        SCAN_PROGRESS,
        serde_json::json!({ "done": 0, "total": total }),
    );

    let mut songs: Vec<music::Song> = Vec::with_capacity(total);
    let mut done = 0usize;

    for chunk in listed.chunks(scan_width()) {
        let reading = chunk.iter().map(|path| {
            let carried = known.get(&path.to_string_lossy().into_owned()).cloned();
            read_song(&media, path.clone(), carried)
        });
        songs.extend(
            futures_util::future::join_all(reading)
                .await
                .into_iter()
                .flatten(),
        );

        done += chunk.len();
        /* Once per batch rather than once per file. A page told a number
        several thousand times a second spends more effort drawing the number
        than the scan spends reading tags. */
        let _ = app.emit(
            SCAN_PROGRESS,
            serde_json::json!({ "done": done, "total": total }),
        );
    }

    /* Sorted once, here, in the order a library is read in: by album, then by
    disc and track within it. Doing it in the page would mean doing it again on
    every render of a list that does not change between them. */
    songs.sort_by(|a, b| {
        let album = a
            .album
            .as_deref()
            .unwrap_or_default()
            .to_lowercase()
            .cmp(&b.album.as_deref().unwrap_or_default().to_lowercase());
        album
            .then(a.disc.unwrap_or(1).cmp(&b.disc.unwrap_or(1)))
            .then(a.track.unwrap_or(0).cmp(&b.track.unwrap_or(0)))
            .then_with(|| natural_order(&a.file, &b.file))
    });

    let found = songs.len();
    library.replace(songs)?;
    let _ = app.emit(SCAN_DONE, found);
    Ok(found)
}

/// One file's record, reusing the last one when the file has not changed.
///
/// The comparison is size and modification time, which is what every backup
/// program on the machine also trusts, and is right for the same reasons.
/// Re-tagging a file changes both.
async fn read_song(
    media: &media::Media,
    path: std::path::PathBuf,
    carried: Option<music::Song>,
) -> Option<music::Song> {
    let meta = std::fs::metadata(&path).ok()?;
    let size = meta.len();
    let modified = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|since| since.as_secs())
        .unwrap_or(0);

    if let Some(known) = carried {
        if known.size == size && known.modified == modified {
            return Some(known);
        }
    }

    let probe = media.probe(&path.to_string_lossy()).await.ok()?;
    Some(music::Song::read(&path, &probe, modified, size))
}

/// One file's tags, read now, for something played from outside the library.
///
/// A track opened by double-clicking it in Explorer has never been scanned and
/// may never be, and it still deserves to say who it is by while it plays.
#[tauri::command]
async fn music_tags(
    state: tauri::State<'_, MediaState>,
    path: String,
) -> Result<Option<music::Song>, String> {
    let Some(media) = pipeline(&state).await else {
        return Ok(None);
    };
    Ok(read_song(&media, std::path::PathBuf::from(&path), None).await)
}

/// Whether a file is still where the page last saw it.
///
/// Asked after a failure rather than before an attempt. The browser reports a
/// file it cannot fetch and a file it cannot decode as the same thing — a
/// source it does not support — so a video deleted while it sat in a folder
/// queue used to be explained as an unsupported format, which is an answer
/// about the wrong subject entirely.
#[tauri::command]
fn file_is_there(path: String) -> bool {
    std::path::Path::new(&path).is_file()
}

/// Extensions Cadence will open, for deciding what counts as the next file.
///
/// The same list the installer registers Cadence for. It is deliberately the
/// file's name rather than its contents: this runs over a whole folder, and
/// inspecting every file in a season of television to find out which are video
/// would cost far more than believing the extension and being wrong about a
/// stray one.
///
/// One list rather than two, and that is the decision worth explaining. A
/// folder is a queue here, and a folder of music is a queue in exactly the way
/// a season of television is: named in the order it should play. Splitting the
/// list would mean a video that happens to sit beside an album silently ends
/// the queue, which is a rule nobody asked for and nobody could see.
const MEDIA_EXTENSIONS: &[&str] = &[
    // Video.
    "mp4", "mkv", "webm", "mov", "avi", "m4v", "wmv", "flv", "ts", "m2ts", "mts", "mpg", "mpeg",
    "3gp", "ogv", // Audio.
    "mp3", "m4a", "m4b", "flac", "wav", "opus", "ogg", "oga", "aac", "wma", "aiff", "aif", "ape",
    "wv", "mka",
];

/// Compare two names the way a person reads them.
///
/// Ordinary string ordering puts "Episode 10" before "Episode 2", because it
/// compares `1` against `2` and stops. Runs of digits are compared as numbers
/// instead, which is the difference between a season playing in order and a
/// season playing in the order 1, 10, 11, 2. Everything else is compared
/// case-insensitively, a character at a time.
fn natural_order(a: &str, b: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;

    let (mut left, mut right) = (a.chars().peekable(), b.chars().peekable());

    loop {
        match (left.peek().copied(), right.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) => {
                if x.is_ascii_digit() && y.is_ascii_digit() {
                    let take_number = |it: &mut std::iter::Peekable<std::str::Chars>| {
                        let mut digits = String::new();
                        while it.peek().is_some_and(|c| c.is_ascii_digit()) {
                            digits.push(it.next().unwrap());
                        }
                        // A season can be numbered past what fits in a u64 only
                        // by someone trying to. Treat that as equal and let the
                        // characters after it decide.
                        digits.trim_start_matches('0').parse::<u128>().unwrap_or(0)
                    };
                    match take_number(&mut left).cmp(&take_number(&mut right)) {
                        Ordering::Equal => continue,
                        other => return other,
                    }
                }

                let ordering = x
                    .to_lowercase()
                    .cmp(y.to_lowercase())
                    .then_with(|| x.cmp(&y));
                if ordering != Ordering::Equal {
                    return ordering;
                }
                left.next();
                right.next();
            }
        }
    }
}

/// Everything playable in the same folder as `path`, in the order it should play.
///
/// This is what makes one file into a queue. Nothing is remembered between
/// launches and no list is built by hand: the folder a file was opened from is
/// the playlist, which is how a season of television and an album are both
/// already organised on everyone's disk.
///
/// An empty list is returned for anything unreadable — a file on a drive that
/// has since been unplugged, a folder without permission. The player then has
/// no next file, which is exactly what it should conclude.
#[tauri::command]
fn folder_playlist(path: String) -> Vec<String> {
    let file = std::path::Path::new(&path);
    let Some(folder) = file.parent() else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(folder) else {
        return Vec::new();
    };

    let mut playable: Vec<std::path::PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|candidate| {
            candidate.is_file()
                && candidate
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| MEDIA_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        })
        .collect();

    playable.sort_by(|a, b| {
        natural_order(
            &a.file_name().unwrap_or_default().to_string_lossy(),
            &b.file_name().unwrap_or_default().to_string_lossy(),
        )
    });

    playable
        .into_iter()
        .map(|file| file.to_string_lossy().into_owned())
        .collect()
}

/// The file Cadence was asked to open at launch, if any.
///
/// Double-clicking a video, or "Open with → Cadence", starts the process with
/// the path as a plain argv entry. That happens long before the webview exists,
/// so the path is parked here and the frontend collects it once it is ready.
struct PendingOpen(Mutex<Option<String>>);

/// Hand the launch file to the frontend, exactly once.
///
/// Taking rather than cloning matters: a reload of the webview must not
/// re-open the file the user has since navigated away from.
#[tauri::command]
fn take_launch_file(state: tauri::State<'_, PendingOpen>) -> Option<String> {
    state.0.lock().ok()?.take()
}

/// Pick the file path out of a process argv.
///
/// argv[0] is the executable. Anything beginning with `-` is a flag, and
/// WebView2 and Tauri both pass their own through in development, so the file is the
/// first bare argument after the program name.
fn file_from_args(args: &[String]) -> Option<String> {
    args.iter().skip(1).find(|a| !a.starts_with('-')).cloned()
}

/// Tell Windows which application this process is.
///
/// Without it the "Now Playing" panel — the one the volume keys and a headset
/// button reach — says "Unknown app" over the title of the film. The panel is
/// drawn by Windows from whatever is playing audio, and what is playing audio
/// is the webview: a process called `msedgewebview2.exe`, which Windows has
/// never heard of and cannot name.
///
/// This is the string the installer already writes onto the Start menu
/// shortcut, which is what Windows looks the name and icon up from. It has to
/// be set before the webview exists, because a child process takes the
/// identity its parent had when it was started.
#[cfg(windows)]
fn name_this_program() {
    // The same string as `identifier` in tauri.conf.json, which is what the
    // installer puts on the shortcut. They have to agree or Windows finds
    // nothing to look up.
    let id: Vec<u16> = "dev.auva.cadence".encode_utf16().chain(Some(0)).collect();
    // Safety: the pointer is to a nul-terminated buffer that outlives the call,
    // and the function copies what it is given.
    unsafe {
        let _ = windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(id.as_ptr());
    }
}

/// What is playing, for the panel Windows draws.
///
/// Pushed by the page rather than read from here, because the page is the only
/// one that knows: the shell hands out streams and has no idea which of them is
/// on screen, how far in it is, or whether there is another file after it.
#[cfg(windows)]
#[tauri::command]
fn now_playing(
    state: tauri::State<'_, nowplaying::NowPlaying>,
    playing: nowplaying::Playing,
) -> Result<(), String> {
    state.update(&playing)
}

pub fn run() {
    #[cfg(windows)]
    name_this_program();

    let argv: Vec<String> = std::env::args().collect();
    let launch_file = file_from_args(&argv);

    let builder = tauri::Builder::default();

    // Registered before every other plugin, as the plugin requires: it has to
    // decide whether this process is the primary one before anything else
    // starts claiming resources.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        // A second launch is someone double-clicking another video while
        // Cadence is already open. Opening a second window there would be
        // wrong. Hand the path to the running window and raise it instead.
        if let Some(path) = file_from_args(&argv) {
            let _ = app.emit("cadence://open-file", path);
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    let builder = builder
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingOpen(Mutex::new(launch_file)))
        .manage(MediaState(Mutex::new(Pipeline::Starting)));

    #[cfg(windows)]
    let builder = builder.manage(nowplaying::NowPlaying::idle());

    builder
        .invoke_handler(tauri::generate_handler![
            take_launch_file,
            media_endpoint,
            media_probe,
            media_subtitle,
            media_script,
            media_font_names,
            file_is_there,
            media_pictures,
            folder_playlist,
            library_folders,
            library_songs,
            library_watch,
            library_unwatch,
            library_scan,
            music_tags,
            #[cfg(windows)]
            now_playing
        ])
        .setup(|app| {
            /* The library, read back from where it was last written. Managed
            here rather than beside the states above because it needs a place
            to keep itself, and where that is is a question only the app can
            answer. A machine that will not give up a data directory still
            plays music; it just cannot remember it between launches. */
            let store = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("cadence"));
            app.manage(music::Library::open(store));

            /* The panel Windows shows for whatever is playing. Taken here
            because it belongs to a window, and the window exists by now. A
            machine that will not give it up still plays films. */
            #[cfg(windows)]
            if let Err(err) = app.state::<nowplaying::NowPlaying>().attach(app.handle()) {
                eprintln!("no Now Playing panel: {err}");
            }

            /* Started in the background rather than awaited here. Preparing it
            means running FFmpeg twice to find out what it can do, and the
            window should be on screen before that finishes: someone who
            double-clicked a file is watching for a window, not for a codec
            survey. The page asks for the endpoint when it needs one. */
            let handle = app.handle().clone();
            let resources = app.path().resource_dir().map(|dir| dir.join("ffmpeg"));

            tauri::async_runtime::spawn(async move {
                let started = match resources {
                    Ok(dir) => media::Media::start(dir).await,
                    Err(err) => Err(err.to_string()),
                };

                let settled = match started {
                    Ok(media) => Pipeline::Ready(media),
                    Err(err) => {
                        eprintln!("Cadence: no playback pipeline ({err})");
                        Pipeline::Unavailable
                    }
                };

                // Recorded either way. Leaving it on `Starting` after a failure
                // would make every caller wait out the full timeout for an
                // answer already known.
                if let Some(state) = handle.try_state::<MediaState>() {
                    if let Ok(mut slot) = state.0.lock() {
                        *slot = settled;
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Cadence");
}

#[cfg(test)]
mod playlist_tests {
    use super::natural_order;
    use std::cmp::Ordering;

    /// The case the whole function exists for: a season plays in order.
    #[test]
    fn digits_compare_as_numbers() {
        let mut names = vec!["Episode 10.mkv", "Episode 2.mkv", "Episode 1.mkv"];
        names.sort_by(|a, b| natural_order(a, b));
        assert_eq!(names, ["Episode 1.mkv", "Episode 2.mkv", "Episode 10.mkv"]);
    }

    /// Padded and unpadded numbering are the same numbering.
    #[test]
    fn leading_zeroes_do_not_change_the_number() {
        assert_eq!(natural_order("S01E02", "S1E2"), Ordering::Equal);
        assert_eq!(natural_order("ep007.mp4", "ep8.mp4"), Ordering::Less);
    }

    /// Case is a tiebreak and never more than one: "alpha" precedes "Beta"
    /// because a precedes b, which plain byte ordering gets backwards. Two
    /// names differing only in case still have to be ordered somehow, and
    /// uppercase first is the convention every file manager uses.
    #[test]
    fn case_does_not_decide_before_letters_do() {
        assert_eq!(natural_order("alpha", "Beta"), Ordering::Less);
        assert_eq!(natural_order("Alpha", "alpha"), Ordering::Less);
    }

    /// A shorter name that is otherwise identical comes first.
    #[test]
    fn a_prefix_sorts_before_what_extends_it() {
        assert_eq!(natural_order("part", "part 2"), Ordering::Less);
    }

    /// The whole command over a real folder: what plays, in order, and nothing
    /// that does not. The subtitle and the cover art sitting beside a download
    /// are the reason for the filter, and they are next to every episode
    /// anybody has.
    #[test]
    fn a_folder_lists_what_it_can_play_in_reading_order() {
        let folder = std::env::temp_dir().join(format!(
            "cadence-playlist-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&folder).unwrap();

        for name in [
            "Episode 10.mkv",
            "Episode 2.mp4",
            "Episode 1.avi",
            "Episode 1.srt",
            "cover.jpg",
            "notes.txt",
        ] {
            std::fs::write(folder.join(name), b"").unwrap();
        }

        let listed =
            super::folder_playlist(folder.join("Episode 1.avi").to_string_lossy().into_owned());
        let names: Vec<String> = listed
            .iter()
            .map(|path| {
                std::path::Path::new(path)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();

        std::fs::remove_dir_all(&folder).ok();
        assert_eq!(names, ["Episode 1.avi", "Episode 2.mp4", "Episode 10.mkv"]);
    }

    /// A folder of music is a queue in the same way a season is, and the
    /// filter that keeps `cover.jpg` out must not also keep the album out.
    #[test]
    fn a_folder_of_music_is_a_queue_too() {
        let folder = std::env::temp_dir().join(format!(
            "cadence-album-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&folder).unwrap();

        for name in [
            "10 Closing.flac",
            "02 Second.mp3",
            "01 Opening.m4a",
            "folder.jpg",
            "album.nfo",
        ] {
            std::fs::write(folder.join(name), b"").unwrap();
        }

        let listed =
            super::folder_playlist(folder.join("01 Opening.m4a").to_string_lossy().into_owned());
        let names: Vec<String> = listed
            .iter()
            .map(|path| {
                std::path::Path::new(path)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();

        std::fs::remove_dir_all(&folder).ok();
        assert_eq!(
            names,
            ["01 Opening.m4a", "02 Second.mp3", "10 Closing.flac"]
        );
    }

    /// A path with no folder above it must not panic, and must offer nothing.
    #[test]
    fn something_unreadable_offers_no_queue() {
        assert!(super::folder_playlist(String::new()).is_empty());
    }
}
