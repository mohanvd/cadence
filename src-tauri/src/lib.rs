use std::sync::Mutex;

// Both are only reached from the desktop-only single-instance handler, and an
// unconditional import would be an unused-import error in a mobile build.
#[cfg(desktop)]
use tauri::{Emitter, Manager};

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
        .invoke_handler(tauri::generate_handler![take_launch_file])
        .run(tauri::generate_context!())
        .expect("error while running Cadence");
}
