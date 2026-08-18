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
            media_probe
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
