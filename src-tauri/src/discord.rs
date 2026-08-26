//! What is playing, on your Discord profile.
//!
//! Discord's client opens a named pipe on this machine and listens on it. There
//! is no server, no account and no network: the player tells the copy of
//! Discord already running here what it is playing, and Discord is the one that
//! decides who sees it. If Discord is not running, nothing happens at all.
//!
//! Everything below runs on its own thread. Connecting to a pipe that may not
//! exist, and writing to a program that may quit while we hold the handle, are
//! both things that can block, and the caller is the code that reports playback
//! position. It must never wait on any of this.

use std::sync::mpsc::{Receiver, RecvTimeoutError, SyncSender};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use discord_rich_presence::activity::{Activity, ActivityType, Assets, Button, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use serde::Deserialize;

/// The Discord application whose name and icon the card carries.
///
/// Public, unlike every other identifier in this project. It is compiled into
/// every copy of every program that does this and is printed in Discord's own
/// examples; it identifies the application, and grants nothing.
const APPLICATION: &str = "1542103686669672548";

/// The art asset uploaded to that application. A key, not a file: Discord
/// serves the picture, and a key it does not recognise draws nothing and
/// reports no error.
const ARTWORK: &str = "cadence";

const SITE: &str = "https://cadence.auva.dev";

/// Discord discards activity updates sent faster than roughly one every four
/// seconds. Sending more often does not update sooner, it updates less.
const FLOOR: Duration = Duration::from_secs(4);

/// How far the real position may drift from the one Discord is drawing before
/// it is worth an update. Below this it is the clock running; above it,
/// somebody moved.
const DRIFT: f64 = 3.0;

/// How long to wait before trying the pipe again. Discord not being installed
/// is an ordinary state, not a failure, and retrying it in a tight loop would
/// be the only expensive thing this module ever did.
const RETRY: Duration = Duration::from_secs(15);

/* `ActivityType` is not `Copy`, and a card is compared against the last one
before it is sent, so the kind travels as its wire value and becomes the
enum again only at the moment the activity is built. */
const LISTENING: i32 = ActivityType::Listening as i32;
const WATCHING: i32 = ActivityType::Watching as i32;

fn activity_type(code: i32) -> ActivityType {
    if code == LISTENING {
        ActivityType::Listening
    } else {
        ActivityType::Watching
    }
}

/// How much of what is playing may be said out loud.
///
/// Off unless asked for, and video off even then. A film's file name says far
/// more about the person watching it than a song's title does about the person
/// listening, and the two deserve separate answers rather than one switch that
/// covers both.
#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub enabled: bool,
    pub video_titles: bool,
}

/// What is playing, as much of it as this module needs.
#[derive(Clone, Default, PartialEq)]
pub struct Snapshot {
    pub title: String,
    pub subtitle: String,
    pub album: String,
    pub music: bool,
    pub playing: bool,
    pub duration: f64,
    pub position: f64,
}

enum Message {
    Show(Snapshot),
    Configure(Settings),
}

/// The handle the rest of the program holds.
pub struct Presence(Option<SyncSender<Message>>);

impl Presence {
    /// Start the thread that owns the connection.
    pub fn start() -> Self {
        let (send, receive) = std::sync::mpsc::sync_channel(8);
        let spawned = std::thread::Builder::new()
            .name("discord-presence".to_owned())
            .spawn(move || serve(receive))
            .is_ok();
        Self(spawned.then_some(send))
    }

    /// Report what is playing. Never blocks and never fails: a full channel
    /// means the thread is busy with a pipe, and the next report supersedes
    /// this one anyway.
    pub fn show(&self, snapshot: Snapshot) {
        if let Some(send) = &self.0 {
            let _ = send.try_send(Message::Show(snapshot));
        }
    }

    pub fn configure(&self, settings: Settings) {
        if let Some(send) = &self.0 {
            let _ = send.try_send(Message::Configure(settings));
        }
    }
}

/// The two lines Discord draws, and the clock under them.
struct Card {
    kind: i32,
    details: String,
    state: String,
    hover: String,
    /// Unix seconds. Discord animates the bar from these by itself, which is
    /// why a position that is merely advancing needs no update at all.
    start: Option<i64>,
    end: Option<i64>,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_secs() as i64)
        .unwrap_or(0)
}

/// Join the parts of a line, skipping the ones this file did not carry.
fn join(parts: [&str; 2]) -> String {
    parts
        .iter()
        .filter(|part| !part.trim().is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join(" \u{b7} ")
}

fn card(playing: &Snapshot, settings: &Settings) -> Card {
    let (kind, details, state) = if playing.music {
        (
            LISTENING,
            playing.title.clone(),
            join([&playing.subtitle, &playing.album]),
        )
    } else if settings.video_titles {
        (WATCHING, playing.title.clone(), playing.subtitle.clone())
    } else {
        // The switch is off, so the card says that something is playing and
        // refuses to say what. Still worth showing: it is the difference
        // between "here, and busy" and nothing at all.
        (WATCHING, "Watching something".to_owned(), String::new())
    };

    // A paused film has no clock to draw. Dropping the timestamps stops the
    // bar rather than leaving it running over a picture that is not moving,
    // and the word goes on the line underneath so the stop is legible.
    let (start, end, state) = if playing.playing {
        let start = now() - playing.position.max(0.0) as i64;
        let end = (playing.duration.is_finite() && playing.duration > 0.0)
            .then(|| start + playing.duration as i64);
        (Some(start), end, state)
    } else {
        let state = if state.is_empty() {
            "Paused".to_owned()
        } else {
            format!("{state} (paused)")
        };
        (None, None, state)
    };

    let hover = if playing.album.trim().is_empty() {
        "Cadence".to_owned()
    } else {
        playing.album.clone()
    };

    Card {
        kind,
        details,
        state,
        hover,
        start,
        end,
    }
}

/// What Discord is currently showing, and when it was told.
struct Shown {
    details: String,
    state: String,
    kind: i32,
    start: Option<i64>,
    at: Instant,
}

impl Shown {
    /// Whether the card in hand differs from this one by anything a viewer
    /// could see.
    fn differs_from(&self, card: &Card) -> bool {
        if self.details != card.details || self.state != card.state || self.kind != card.kind {
            return true;
        }
        match (self.start, card.start) {
            (Some(was), Some(is)) => (was - is).abs() as f64 > DRIFT,
            (was, is) => was.is_some() != is.is_some(),
        }
    }
}

fn serve(receive: Receiver<Message>) {
    let mut client = DiscordIpcClient::new(APPLICATION);
    let mut connected = false;
    let mut tried: Option<Instant> = None;

    let mut settings = Settings::default();
    let mut latest: Option<Snapshot> = None;
    let mut shown: Option<Shown> = None;

    loop {
        // Half a second, so that a change arriving during the rate-limit floor
        // is pushed as soon as the floor lifts rather than waiting for the next
        // report from the page.
        match receive.recv_timeout(Duration::from_millis(500)) {
            Ok(Message::Show(snapshot)) => latest = Some(snapshot),
            Ok(Message::Configure(next)) => settings = next,
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }

        let wanted = latest
            .as_ref()
            .filter(|_| settings.enabled)
            .filter(|snapshot| !snapshot.title.trim().is_empty())
            .map(|snapshot| card(snapshot, &settings));

        // Nothing to say. Let go of the pipe rather than sitting on it: a
        // player left open overnight with the setting off should not be
        // holding a handle to Discord.
        let Some(wanted) = wanted else {
            if connected {
                let _ = client.clear_activity();
                let _ = client.close();
                connected = false;
            }
            shown = None;
            continue;
        };

        if let Some(showing) = &shown {
            if !showing.differs_from(&wanted) || showing.at.elapsed() < FLOOR {
                continue;
            }
        }

        if !connected {
            if tried.is_some_and(|at| at.elapsed() < RETRY) {
                continue;
            }
            tried = Some(Instant::now());
            if client.connect().is_err() {
                continue;
            }
            connected = true;
            /* Nothing is carried over from the last connection: whatever
            Discord was showing died with the old pipe. `shown` is not cleared
            here only because every path out of this loop body sets it. */
        }

        let mut activity = Activity::new()
            .activity_type(activity_type(wanted.kind))
            .details(&wanted.details)
            .assets(Assets::new().large_image(ARTWORK).large_text(&wanted.hover))
            .buttons(vec![Button::new("Get Cadence", SITE)]);

        if !wanted.state.is_empty() {
            activity = activity.state(&wanted.state);
        }

        if let Some(start) = wanted.start {
            let mut timestamps = Timestamps::new().start(start);
            if let Some(end) = wanted.end {
                timestamps = timestamps.end(end);
            }
            activity = activity.timestamps(timestamps);
        }

        if client.set_activity(activity).is_err() {
            // Discord quit, or restarted and handed us a dead pipe. Drop it and
            // let the retry above pick it up.
            let _ = client.close();
            connected = false;
            shown = None;
            continue;
        }

        shown = Some(Shown {
            details: wanted.details,
            state: wanted.state,
            kind: wanted.kind,
            start: wanted.start,
            at: Instant::now(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(playing: bool) -> Snapshot {
        Snapshot {
            title: "First Light".to_owned(),
            subtitle: "Auva".to_owned(),
            album: "Ascent".to_owned(),
            music: true,
            playing,
            duration: 225.0,
            position: 107.0,
        }
    }

    /// Artist and album share the second line, because Discord draws two lines
    /// and a record has three things worth naming.
    #[test]
    fn a_track_names_itself_over_two_lines() {
        let card = card(&track(true), &Settings::default());
        assert_eq!(card.details, "First Light");
        assert_eq!(card.state, "Auva \u{b7} Ascent");
        assert_eq!(card.kind, LISTENING);
    }

    /// The bar is drawn from the timestamps, so they have to describe a track
    /// that started before now and ends after it.
    #[test]
    fn the_clock_starts_where_the_track_did() {
        let card = card(&track(true), &Settings::default());
        let start = card.start.expect("a playing track has a start");
        let end = card.end.expect("a track of known length has an end");
        assert_eq!(end - start, 225);
        assert!(start <= now() && start >= now() - 108);
    }

    /// A paused track has no clock. Leaving one would draw a bar advancing
    /// across a track that is not moving.
    #[test]
    fn pausing_stops_the_clock_and_says_so() {
        let card = card(&track(false), &Settings::default());
        assert_eq!(card.start, None);
        assert_eq!(card.end, None);
        assert!(card.state.ends_with("(paused)"));
    }

    /// The default answer for video is that something is playing, without
    /// saying what. Turning titles on is a separate decision from turning the
    /// presence on.
    #[test]
    fn a_film_keeps_its_name_until_told_otherwise() {
        let film = Snapshot {
            title: "Some Private Thing".to_owned(),
            music: false,
            playing: true,
            ..Snapshot::default()
        };

        let quiet = card(&film, &Settings::default());
        assert_eq!(quiet.details, "Watching something");
        assert!(!quiet.details.contains("Private"));
        assert_eq!(quiet.kind, WATCHING);

        let told = card(
            &film,
            &Settings {
                enabled: true,
                video_titles: true,
            },
        );
        assert_eq!(told.details, "Some Private Thing");
    }

    /// A position that is merely advancing is the clock Discord is already
    /// drawing. Only a jump is worth an update.
    #[test]
    fn advancing_is_not_a_change_but_seeking_is() {
        let base = card(&track(true), &Settings::default());
        let showing = Shown {
            details: base.details.clone(),
            state: base.state.clone(),
            kind: base.kind,
            start: base.start,
            at: Instant::now(),
        };

        let mut later = track(true);
        later.position = 109.0;
        assert!(!showing.differs_from(&card(&later, &Settings::default())));

        let mut sought = track(true);
        sought.position = 12.0;
        assert!(showing.differs_from(&card(&sought, &Settings::default())));
    }

    /// Proof that the pipe is there and that Discord accepts this application,
    /// run by hand rather than in CI: it needs a Discord running on the same
    /// machine, which a build server does not have.
    ///
    /// It sets no activity, so it publishes nothing. The handshake and a clear
    /// are enough to tell a wrong application id from a right one, and the
    /// look of the card is a thing to judge with eyes anyway.
    ///
    ///     cargo test the_pipe_accepts_this_application -- --ignored --nocapture
    #[test]
    #[ignore = "needs Discord running on this machine"]
    fn the_pipe_accepts_this_application() {
        let mut client = DiscordIpcClient::new(APPLICATION);
        client.connect().expect("Discord accepted the handshake");
        client
            .clear_activity()
            .expect("the connection carries commands");
        client.close().expect("the pipe closed cleanly");
    }
}
