//! The panel Windows shows when something is playing.
//!
//! It is the one the volume keys raise, the one a headset button reaches, and
//! the one that appears over the lock screen. Until now Cadence appeared in it
//! as **Unknown app**, and the reason is worth writing down because it is not
//! obvious and cost an afternoon to find.
//!
//! A web page can ask for that panel, `navigator.mediaSession`, and the page
//! did, which is why the title and the buttons were right. But Windows names
//! the panel after the *process* that asked, and the process that asks on a
//! page's behalf is the browser it is running in. Here that is WebView2: a
//! program called `msedgewebview2.exe`, which Windows has never heard of and
//! cannot name or draw an icon for. Nothing the page does can change that,
//! because the page is not the one asking.
//!
//! So the shell asks instead. It is an ordinary program with a name Windows
//! knows, and it takes the panel for its own window; the page's copy is turned
//! off in the same breath, because two would be two entries in the flyout.
//! What the page keeps is the knowing: it says what is playing and it acts on
//! the buttons, and this file is the wire between.

use std::sync::Mutex;

use serde::Deserialize;
use tauri::{Emitter, Manager};
use windows::core::HSTRING;
use windows::Foundation::{TimeSpan, TypedEventHandler};
use windows::Media::{
    MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls,
    SystemMediaTransportControlsButton, SystemMediaTransportControlsButtonPressedEventArgs,
    SystemMediaTransportControlsTimelineProperties,
};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;

/// The event the page listens for. Its payload is one of the names below.
pub const PRESSED: &str = "now-playing";

/// What is playing, as the page sees it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playing {
    /// The film, without its extension. Empty means nothing is open.
    pub title: String,
    /// Under the title: who it is by, or which of how many when a folder of
    /// video is being played.
    pub subtitle: String,
    /// The record it is from. Empty for anything that is not music.
    pub album: String,
    /// Whether Windows should file this under music rather than video.
    ///
    /// Not cosmetic. The panel draws a different card for each, music gets a
    /// square sleeve, an artist line and an album line; video gets a wide
    /// still and neither, and a track filed as video is a track whose artist
    /// Windows has nowhere to put.
    pub music: bool,
    pub playing: bool,
    pub duration: f64,
    pub position: f64,
    pub has_next: bool,
    pub has_previous: bool,
    /// A picture of the record on somebody else's server, for the places that
    /// can only show one from a URL. Empty unless the page went looking, which
    /// it does only when asked to. Windows has the file itself and reads the
    /// sleeve out of it, so nothing here uses this.
    #[serde(default)]
    pub artwork: String,
}

/// The controls for this window, once taken.
pub struct NowPlaying(Mutex<Option<SystemMediaTransportControls>>);

impl NowPlaying {
    /// Nothing taken yet. Taking needs a window, which does not exist when the
    /// state is registered.
    pub fn idle() -> Self {
        Self(Mutex::new(None))
    }

    /// Take the panel for a window, and forward its buttons to the page.
    ///
    /// Done once. The controls belong to the window and outlive every file
    /// played through it.
    pub fn attach(&self, app: &tauri::AppHandle) -> Result<(), String> {
        let mut held = self.0.lock().map_err(|_| "controls are poisoned")?;
        if held.is_some() {
            return Ok(());
        }

        let window = app
            .get_webview_window("main")
            .ok_or("there is no main window")?;
        let handle = window.hwnd().map_err(|err| err.to_string())?;

        // The panel is a WinRT idea and a window is a Win32 one; this is the
        // interface that introduces them.
        let interop: ISystemMediaTransportControlsInterop = windows::core::factory::<
            SystemMediaTransportControls,
            ISystemMediaTransportControlsInterop,
        >()
        .map_err(|err| err.to_string())?;

        // Safety: the handle came from the window this call is about, and is
        // valid for as long as that window is.
        let controls: SystemMediaTransportControls =
            unsafe { interop.GetForWindow(HWND(handle.0 as *mut _)) }
                .map_err(|err| err.to_string())?;

        let to_page = app.clone();
        controls
            .ButtonPressed(&TypedEventHandler::<
                SystemMediaTransportControls,
                SystemMediaTransportControlsButtonPressedEventArgs,
            >::new(move |_, args| {
                let Some(args) = args.as_ref() else {
                    return Ok(());
                };
                let pressed = match args.Button()? {
                    SystemMediaTransportControlsButton::Play => "play",
                    SystemMediaTransportControlsButton::Pause => "pause",
                    SystemMediaTransportControlsButton::Stop => "pause",
                    SystemMediaTransportControlsButton::Next => "next",
                    SystemMediaTransportControlsButton::Previous => "previous",
                    // Fast forward and rewind are held rather than pressed, and
                    // arrive here as a press with no way to know when it ended.
                    _ => return Ok(()),
                };
                // The page owns the engine, so the press is a message rather
                // than an action. A failure here means the window has gone,
                // which is not something this handler can do anything about.
                let _ = to_page.emit(PRESSED, pressed);
                Ok(())
            }))
            .map_err(|err| err.to_string())?;

        controls.SetIsEnabled(true).map_err(|e| e.to_string())?;
        *held = Some(controls);
        Ok(())
    }

    /// Say what is playing.
    pub fn update(&self, state: &Playing) -> Result<(), String> {
        let held = self.0.lock().map_err(|_| "controls are poisoned")?;
        let Some(controls) = held.as_ref() else {
            return Ok(());
        };

        let show = |result: windows::core::Result<()>| result.map_err(|err| err.to_string());

        // Nothing open. The panel is left enabled but says so, rather than
        // disappearing and reappearing between one video and the next.
        if state.title.is_empty() {
            return show(controls.SetPlaybackStatus(MediaPlaybackStatus::Closed));
        }

        show(controls.SetPlaybackStatus(if state.playing {
            MediaPlaybackStatus::Playing
        } else {
            MediaPlaybackStatus::Paused
        }))?;
        show(controls.SetIsPlayEnabled(true))?;
        show(controls.SetIsPauseEnabled(true))?;
        // Greyed rather than hidden when there is nowhere to go, which is what
        // the panel does with them and what the control bar does too.
        show(controls.SetIsNextEnabled(state.has_next))?;
        show(controls.SetIsPreviousEnabled(state.has_previous))?;

        let updater = controls.DisplayUpdater().map_err(|e| e.to_string())?;

        /* Two different cards, and which one Windows draws is decided here.
        The properties are not interchangeable: setting the video ones while
        the type says music leaves the panel with nothing to show, so the type
        is set first and only the matching half is filled in. */
        if state.music {
            show(updater.SetType(MediaPlaybackType::Music))?;
            let music = updater.MusicProperties().map_err(|e| e.to_string())?;
            show(music.SetTitle(&HSTRING::from(&state.title)))?;
            show(music.SetArtist(&HSTRING::from(&state.subtitle)))?;
            show(music.SetAlbumTitle(&HSTRING::from(&state.album)))?;
        } else {
            show(updater.SetType(MediaPlaybackType::Video))?;
            let video = updater.VideoProperties().map_err(|e| e.to_string())?;
            show(video.SetTitle(&HSTRING::from(&state.title)))?;
            show(video.SetSubtitle(&HSTRING::from(&state.subtitle)))?;
        }
        show(updater.Update())?;

        // The scrubber. Only worth sending for something with a length: a live
        // stream has a position and no end, and a panel drawing that as a bar
        // would be drawing a guess.
        if state.duration.is_finite() && state.duration > 0.0 {
            let timeline =
                SystemMediaTransportControlsTimelineProperties::new().map_err(|e| e.to_string())?;
            let end = seconds(state.duration);
            show(timeline.SetStartTime(seconds(0.0)))?;
            show(timeline.SetMinSeekTime(seconds(0.0)))?;
            show(timeline.SetPosition(seconds(state.position.clamp(0.0, state.duration))))?;
            show(timeline.SetMaxSeekTime(end))?;
            show(timeline.SetEndTime(end))?;
            show(controls.UpdateTimelineProperties(&timeline))?;
        }

        Ok(())
    }
}

/// Seconds as WinRT counts time, in ten-millionths of one.
fn seconds(value: f64) -> TimeSpan {
    TimeSpan {
        Duration: (value * 10_000_000.0) as i64,
    }
}
