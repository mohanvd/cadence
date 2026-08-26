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
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use discord_rich_presence::activity::{Activity, ActivityType, Assets, Button, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use serde::{Deserialize, Serialize};

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
    /* There is no `album_art` here on purpose. The page decides whether to look
    a cover up, because the page is the side that can reach the internet, and
    this side only ever receives a URL or an empty string. Serde ignores the
    field the page sends, which is the right amount of coupling: one end holds
    the setting, the other holds the result. */
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
    /// A picture Discord can fetch, or empty for the fixed logo. Never a path:
    /// Discord loads this from its own servers, and nothing on this disk is
    /// reachable from there.
    pub artwork: String,
}

enum Message {
    Show(Snapshot),
    Configure(Settings),
}

/// What the presence is doing, for the settings panel to say out loud.
///
/// Everything in this module fails quietly, because a player must not stop for
/// Discord. That is right while a film is running and useless while somebody is
/// trying to work out why their profile is blank: a switch that is on, a
/// Discord that is closed and a card that was refused all look identical from
/// the outside. This is the difference.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    /// The switch is off.
    #[default]
    Off,
    /// On, but nothing is playing.
    Idle,
    /// On, something is playing, and Discord cannot be reached. Almost always
    /// means Discord is not running.
    Waiting,
    /// On your profile now.
    Showing,
    /// Discord took the connection and rejected the card.
    Refused,
}

/// The handle the rest of the program holds.
pub struct Presence {
    send: Option<SyncSender<Message>>,
    status: Arc<Mutex<Status>>,
}

impl Presence {
    /// Start the thread that owns the connection.
    pub fn start() -> Self {
        let (send, receive) = std::sync::mpsc::sync_channel(8);
        let status = Arc::new(Mutex::new(Status::Off));
        let reported = Arc::clone(&status);
        let spawned = std::thread::Builder::new()
            .name("discord-presence".to_owned())
            .spawn(move || serve(receive, reported))
            .is_ok();
        Self {
            send: spawned.then_some(send),
            status,
        }
    }

    /// What it is doing right now.
    pub fn status(&self) -> Status {
        self.status.lock().map(|held| *held).unwrap_or_default()
    }

    /// Report what is playing. Never blocks and never fails: a full channel
    /// means the thread is busy with a pipe, and the next report supersedes
    /// this one anyway.
    pub fn show(&self, snapshot: Snapshot) {
        if let Some(send) = &self.send {
            let _ = send.try_send(Message::Show(snapshot));
        }
    }

    pub fn configure(&self, settings: Settings) {
        if let Some(send) = &self.send {
            let _ = send.try_send(Message::Configure(settings));
        }
    }
}

/// The two lines Discord draws, and the clock under them.
struct Card {
    kind: i32,
    /// The first line, and the biggest.
    details: String,
    /// The second.
    state: String,
    /// The third, and the tooltip on the picture. Discord draws it as a line
    /// of its own under the other two, which is the room a record needs: a
    /// title, who made it, and what it came from, each said once.
    hover: String,
    artwork: String,
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

fn card(playing: &Snapshot, settings: &Settings) -> Card {
    let (kind, details, state, mut hover) = if playing.music {
        /* Artist on the second line and record on the third, rather than both
        joined on the second. They were joined while the third line was thought
        to be a tooltip nobody reads; it is drawn, so the record had been
        printed twice. */
        let artist = playing.subtitle.trim();
        let album = playing.album.trim();
        let (state, hover) = if artist.is_empty() {
            (album.to_owned(), String::new())
        } else {
            (artist.to_owned(), album.to_owned())
        };
        (LISTENING, playing.title.clone(), state, hover)
    } else if settings.video_titles {
        (
            WATCHING,
            playing.title.clone(),
            playing.subtitle.clone(),
            String::new(),
        )
    } else {
        // The switch is off, so the card says that something is playing and
        // refuses to say what. Still worth showing: it is the difference
        // between "here, and busy" and nothing at all.
        (
            WATCHING,
            "Watching something".to_owned(),
            String::new(),
            String::new(),
        )
    };

    // A paused film has no clock to draw. Dropping the timestamps stops the
    // bar rather than leaving it running over a picture that is not moving,
    // and the word goes on the line underneath so the stop is legible.
    let (start, end) = if playing.playing {
        let start = now() - playing.position.max(0.0) as i64;
        let end = (playing.duration.is_finite() && playing.duration > 0.0)
            .then(|| start + playing.duration as i64);
        (Some(start), end)
    } else {
        /* Discord has no way to draw a stopped bar: a bar with timestamps
        advances, and one without has no bar at all. So a pause drops them and
        says the word instead, on the third line, which leaves the title and
        the artist where they were rather than rewriting the line somebody is
        reading. */
        hover = "Paused".to_owned();
        (None, None)
    };

    if hover.is_empty() {
        hover = "Cadence".to_owned();
    }

    Card {
        kind,
        details,
        state,
        hover,
        artwork: playing.artwork.clone(),
        start,
        end,
    }
}

/// Turn a card into the thing Discord is sent.
///
/// One function rather than one at each call site, so that the diagnostic below
/// puts up the same card the player does. It used to build its own by hand, and
/// went on showing a layout that had already been fixed.
fn build(card: &Card) -> Activity<'_> {
    let cover = !card.artwork.is_empty();
    let large = if cover { &card.artwork } else { ARTWORK };
    let mut assets = Assets::new().large_image(large).large_text(&card.hover);
    if cover {
        // The logo steps aside for the record and comes back as the badge,
        // which is the only work it still has: saying which player this is.
        assets = assets.small_image(ARTWORK).small_text("Cadence");
    }

    let mut activity = Activity::new()
        .activity_type(activity_type(card.kind))
        .details(&card.details)
        .assets(assets)
        .buttons(vec![Button::new("Get Cadence", SITE)]);

    if !card.state.is_empty() {
        activity = activity.state(&card.state);
    }

    if let Some(start) = card.start {
        let mut timestamps = Timestamps::new().start(start);
        if let Some(end) = card.end {
            timestamps = timestamps.end(end);
        }
        activity = activity.timestamps(timestamps);
    }

    activity
}

/// What Discord is currently showing, and when it was told.
struct Shown {
    details: String,
    state: String,
    hover: String,
    artwork: String,
    kind: i32,
    start: Option<i64>,
    at: Instant,
}

impl Shown {
    /// Whether the card in hand differs from this one by anything a viewer
    /// could see.
    fn differs_from(&self, card: &Card) -> bool {
        if self.details != card.details
            || self.state != card.state
            || self.hover != card.hover
            || self.artwork != card.artwork
            || self.kind != card.kind
        {
            return true;
        }
        match (self.start, card.start) {
            (Some(was), Some(is)) => (was - is).abs() as f64 > DRIFT,
            (was, is) => was.is_some() != is.is_some(),
        }
    }
}

fn serve(receive: Receiver<Message>, status: Arc<Mutex<Status>>) {
    let report = |next: Status| {
        if let Ok(mut held) = status.lock() {
            *held = next;
        }
    };

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
            report(if settings.enabled {
                Status::Idle
            } else {
                Status::Off
            });
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
                // Almost always means Discord is not running. It is not an
                // error worth showing as one, but it is worth being able to see.
                report(Status::Waiting);
                continue;
            }
            connected = true;
            /* Nothing is carried over from the last connection: whatever
            Discord was showing died with the old pipe. `shown` is not cleared
            here only because every path out of this loop body sets it. */
        }

        if !connected {
            report(Status::Waiting);
            continue;
        }

        if client.set_activity(build(&wanted)).is_err() {
            report(Status::Refused);
            // Discord quit, or restarted and handed us a dead pipe. Drop it and
            // let the retry above pick it up.
            let _ = client.close();
            connected = false;
            shown = None;
            continue;
        }

        report(Status::Showing);
        shown = Some(Shown {
            details: wanted.details,
            state: wanted.state,
            hover: wanted.hover,
            artwork: wanted.artwork,
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
            artwork: String::new(),
        }
    }

    /// Three lines, each saying one thing. They were two, with the record
    /// glued to the artist, until a card in the wild showed the third line
    /// being drawn and the record appearing twice.
    #[test]
    fn a_track_names_itself_once_per_line() {
        let card = card(&track(true), &Settings::default());
        assert_eq!(card.details, "First Light");
        assert_eq!(card.state, "Auva");
        assert_eq!(card.hover, "Ascent");
        assert_eq!(card.kind, LISTENING);
    }

    /// A track with no artist tag still has somewhere to put the record.
    #[test]
    fn an_untagged_artist_does_not_leave_a_blank_line() {
        let mut anonymous = track(true);
        anonymous.subtitle = String::new();
        let card = card(&anonymous, &Settings::default());
        assert_eq!(card.state, "Ascent");
        assert_eq!(card.hover, "Cadence");
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
        // The title and the artist stay put. Only the third line changes, so
        // the two lines somebody is reading do not rewrite themselves.
        assert_eq!(card.details, "First Light");
        assert_eq!(card.state, "Auva");
        assert_eq!(card.hover, "Paused");
    }

    /// A cover arriving a moment after the track it belongs to has to count as
    /// a change, or it would be found and then never shown.
    #[test]
    fn a_cover_that_arrives_late_still_counts() {
        let bare = card(&track(true), &Settings::default());
        let showing = Shown {
            details: bare.details.clone(),
            state: bare.state.clone(),
            hover: bare.hover.clone(),
            artwork: bare.artwork.clone(),
            kind: bare.kind,
            start: bare.start,
            at: Instant::now(),
        };

        let mut dressed = track(true);
        dressed.artwork = "https://example.invalid/sleeve.jpg".to_owned();
        assert!(showing.differs_from(&card(&dressed, &Settings::default())));
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
            hover: base.hover.clone(),
            artwork: base.artwork.clone(),
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

    /// Put a real card up, so a human can look at it.
    ///
    /// This one publishes. It exists because every failure in this module is
    /// deliberately silent (a player must not stop for Discord), and silence is
    /// indistinguishable from a card nobody switched on.
    ///
    /// It builds the card through `card` and `build`, the same two functions
    /// the player uses, so what appears is what will appear. An earlier version
    /// assembled its own activity and went on showing a layout that had already
    /// been corrected, which is a diagnostic lying to the person reading it.
    ///
    ///     CADENCE_DISCORD_HOLD=180 CADENCE_DISCORD_ART=<url> \
    ///       cargo test a_card_a_person_can_look_at -- --ignored --nocapture
    #[test]
    #[ignore = "publishes a real activity"]
    fn a_card_a_person_can_look_at() {
        let env = |name: &str| std::env::var(name).ok().filter(|value| !value.is_empty());

        let playing = Snapshot {
            title: env("CADENCE_DISCORD_TITLE").unwrap_or("First Light".to_owned()),
            subtitle: env("CADENCE_DISCORD_ARTIST").unwrap_or("Auva".to_owned()),
            album: env("CADENCE_DISCORD_ALBUM").unwrap_or("Ascent".to_owned()),
            music: true,
            playing: env("CADENCE_DISCORD_PAUSED").is_none(),
            duration: 225.0,
            position: env("CADENCE_DISCORD_POSITION")
                .and_then(|value| value.parse().ok())
                .unwrap_or(0.0),
            artwork: env("CADENCE_DISCORD_ART").unwrap_or_default(),
        };

        let wanted = card(&playing, &Settings::default());
        println!("line 1: {}", wanted.details);
        println!("line 2: {}", wanted.state);
        println!("line 3: {}", wanted.hover);
        println!(
            "picture: {}",
            if wanted.artwork.is_empty() {
                "the logo"
            } else {
                &wanted.artwork
            }
        );

        let mut client = DiscordIpcClient::new(APPLICATION);
        client.connect().expect("connected");
        match client.set_activity(build(&wanted)) {
            Ok(()) => println!("SET OK. Look at your profile now."),
            Err(err) => panic!("Discord refused the activity: {err}"),
        }

        let hold: u64 = env("CADENCE_DISCORD_HOLD")
            .and_then(|value| value.parse().ok())
            .unwrap_or(20);
        println!("holding for {hold}s");
        std::thread::sleep(Duration::from_secs(hold));
        let _ = client.clear_activity();
        let _ = client.close();
        println!("cleared");
    }

    /// Drive the whole shell-side path the way the player does, and say where
    /// it stops.
    ///
    /// `Presence::start`, a `configure`, a `show`, and then the thread on its
    /// own. If this reaches `Showing`, everything below the page is working and
    /// a blank profile is the page not asking. If it stops earlier, it stops
    /// somewhere this prints.
    ///
    ///     cargo test the_presence_thread_reaches_discord -- --ignored --nocapture
    #[test]
    #[ignore = "publishes a real activity"]
    fn the_presence_thread_reaches_discord() {
        let presence = Presence::start();
        println!("start:     {:?}", presence.status());

        presence.configure(Settings {
            enabled: true,
            video_titles: false,
        });
        presence.show(Snapshot {
            title: "First Light".to_owned(),
            subtitle: "Auva".to_owned(),
            album: "Ascent".to_owned(),
            music: true,
            playing: true,
            duration: 225.0,
            position: 30.0,
            artwork: String::new(),
        });

        let mut last = presence.status();
        for _ in 0..40 {
            std::thread::sleep(Duration::from_millis(250));
            let now = presence.status();
            if now != last {
                println!("became:    {now:?}");
                last = now;
            }
            if now == Status::Showing {
                break;
            }
        }

        println!("finished:  {last:?}");
        std::thread::sleep(Duration::from_secs(15));
        assert_eq!(last, Status::Showing, "the presence never reached Discord");
    }
}
