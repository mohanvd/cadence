use std::sync::Mutex;

// Both are only reached from the desktop-only single-instance handler, and an
// unconditional import would be an unused-import error in a mobile build.
#[cfg(desktop)]
use tauri::{Emitter, Manager};

mod media;

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

/// Extensions Cadence will open, for deciding what counts as the next video.
///
/// The same list the installer registers Cadence for. It is deliberately the
/// file's name rather than its contents: this runs over a whole folder, and
/// inspecting every file in a season of television to find out which are video
/// would cost far more than believing the extension and being wrong about a
/// stray one.
const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "webm", "mov", "avi", "m4v", "wmv", "flv", "ts", "m2ts", "mts", "mpg", "mpeg",
    "3gp", "ogv",
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

/// Every video in the same folder as `path`, in the order they should play.
///
/// This is what makes one file into a queue. Nothing is remembered between
/// launches and no list is built by hand: the folder a film was opened from is
/// the playlist, which is how a season of television is already organised on
/// everyone's disk.
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

    let mut videos: Vec<std::path::PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|candidate| {
            candidate.is_file()
                && candidate
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| VIDEO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        })
        .collect();

    videos.sort_by(|a, b| {
        natural_order(
            &a.file_name().unwrap_or_default().to_string_lossy(),
            &b.file_name().unwrap_or_default().to_string_lossy(),
        )
    });

    videos
        .into_iter()
        .map(|video| video.to_string_lossy().into_owned())
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

pub fn run() {
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

    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingOpen(Mutex::new(launch_file)))
        .manage(MediaState(Mutex::new(Pipeline::Starting)))
        .invoke_handler(tauri::generate_handler![
            take_launch_file,
            media_endpoint,
            media_probe,
            media_subtitle,
            folder_playlist
        ])
        .setup(|app| {
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

    /// The whole command over a real folder: the videos, in order, and nothing
    /// that is not a video. The subtitle and the cover art sitting beside a
    /// download are the reason for the filter, and they are next to every
    /// episode anybody has.
    #[test]
    fn a_folder_lists_its_videos_in_reading_order() {
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

    /// A path with no folder above it must not panic, and must offer nothing.
    #[test]
    fn something_unreadable_offers_no_queue() {
        assert!(super::folder_playlist(String::new()).is_empty());
    }
}
