//! What music is on this machine, and what it says it is.
//!
//! A film is watched once and found by its name. Music is not: nobody
//! remembers which file an album track is in, and a folder listing of
//! `01 - Track.flac` is not a library, it is a filing cabinet. So the tags are
//! read once, kept, and handed to the page as records that know their artist
//! and their album.
//!
//! Two things make this worth writing down.
//!
//! The first is that reading a tag costs a process. There is no library linked
//! in here — the pipeline is the bundled FFmpeg binaries, called as programs —
//! so every file is one `ffprobe`, and one `ffprobe` is about seventy
//! milliseconds almost all of which is Windows starting a program. Ten
//! thousand tracks read one after another is twelve minutes. They are read
//! several at a time instead, and the answers are kept on disk, so the twelve
//! minutes happen once and a later scan pays only for what changed.
//!
//! The second is that tags are not written the way their formats promise.
//! Vorbis comments arrive upper-case, MP4 atoms arrive lower-case, Matroska
//! puts them on the stream rather than the file, and a track number is as
//! likely to read `4/12` as `4`. Every read below goes through the same
//! forgiving lookup for that reason.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// Extensions the library walks for.
///
/// Narrower than the list Cadence will *play*: a folder of films is not a
/// music library, and walking one to say so would cost an ffprobe per film.
/// Matroska audio is here under `.mka` only, which is the extension people use
/// when they mean sound.
pub const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "m4a", "m4b", "flac", "wav", "opus", "ogg", "oga", "aac", "wma", "aiff", "aif", "ape",
    "wv", "mka",
];

/// Folders never worth walking into, whatever is in them.
///
/// Music players and rippers leave caches of their own beside the music, and a
/// folder of ten thousand thumbnail JPEGs is ten thousand files to reject one
/// at a time. Skipping the folder is cheaper than skipping its contents.
const SKIPPED: &[&str] = &[
    "$recycle.bin",
    "system volume information",
    ".git",
    "node_modules",
    ".cache",
];

/// One track, as the library knows it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    pub path: String,
    /// The file's own name, extension and all. What to show when there are no
    /// tags worth showing, and what a person recognises in an error message.
    pub file: String,
    /// The tag's title, or the file name with its extension taken off.
    ///
    /// Never empty and never null, because this is what a list is drawn from
    /// and a row with nothing in it is a row nobody can click on purpose.
    pub title: String,
    pub artist: Option<String>,
    /// Who the *album* is by, which is not always who the track is by. A
    /// compilation has a different artist on every track and one album artist
    /// across all of them, and grouping by the wrong one of those turns one
    /// album into eighteen.
    pub album_artist: Option<String>,
    pub album: Option<String>,
    pub track: Option<u32>,
    pub disc: Option<u32>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub duration: f64,
    /// Whether a sleeve is embedded in the file.
    pub art: bool,
    /// Last modified, in whole seconds since the epoch. Half of what decides
    /// whether a later scan needs to read this file again.
    pub modified: u64,
    pub size: u64,
}

impl Song {
    /// Build a record from an ffprobe reading of the file.
    ///
    /// Everything is optional except the path, the file name and the title,
    /// because everything else genuinely can be absent: a rip made in a hurry
    /// has no tags at all, and it is still a track somebody wants to play.
    pub fn read(path: &Path, probe: &serde_json::Value, modified: u64, size: u64) -> Self {
        let tags = collect_tags(probe);

        let file = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        let stem = path
            .file_stem()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| file.clone());

        let title = tag(&tags, &["title"])
            .map(str::to_owned)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(stem);

        Song {
            path: path.to_string_lossy().into_owned(),
            file,
            title,
            artist: text(&tags, &["artist", "author", "performer"]),
            album_artist: text(&tags, &["album_artist", "albumartist", "album artist"]),
            album: text(&tags, &["album"]),
            track: tag(&tags, &["track", "tracknumber"]).and_then(number),
            disc: tag(&tags, &["disc", "discnumber", "disk"]).and_then(number),
            year: tag(&tags, &["date", "year", "originalyear", "originaldate"]).and_then(year),
            genre: text(&tags, &["genre"]),
            duration: probe
                .get("format")
                .and_then(|format| format.get("duration"))
                .and_then(|value| value.as_str())
                .and_then(|value| value.parse::<f64>().ok())
                .filter(|value| value.is_finite() && *value > 0.0)
                .unwrap_or(0.0),
            art: has_art(probe),
            modified,
            size,
        }
    }
}

/// Every tag in the file, from wherever the container keeps them.
///
/// The file's own tags first and the audio stream's after, filling only what
/// the first left empty. Most formats keep everything in the first place;
/// Matroska is the one that routinely uses both, and there the file is the
/// better witness — a stream title in an `.mka` is as often the codec's name
/// as the song's.
///
/// Keys are lower-cased on the way in, which is what lets every lookup below
/// spell a tag one way and find it however it was written.
fn collect_tags(probe: &serde_json::Value) -> HashMap<String, String> {
    let mut tags: HashMap<String, String> = HashMap::new();

    let mut absorb = |value: Option<&serde_json::Value>| {
        let Some(map) = value.and_then(|tags| tags.as_object()) else {
            return;
        };
        for (key, value) in map {
            if let Some(text) = value.as_str() {
                tags.entry(key.to_lowercase()).or_insert_with(|| {
                    // Some rippers pad fixed-width fields with spaces or nulls.
                    text.trim_matches(|c: char| c.is_whitespace() || c == '\0')
                        .to_owned()
                });
            }
        }
    };

    absorb(probe.get("format").and_then(|format| format.get("tags")));

    if let Some(streams) = probe.get("streams").and_then(|value| value.as_array()) {
        for stream in streams {
            if stream.get("codec_type").and_then(|v| v.as_str()) == Some("audio") {
                absorb(stream.get("tags"));
            }
        }
    }

    tags
}

/// The first of these names that the file actually carries.
fn tag<'a>(tags: &'a HashMap<String, String>, names: &[&str]) -> Option<&'a str> {
    names
        .iter()
        .find_map(|name| tags.get(*name))
        .map(String::as_str)
}

/// The same, as an owned string, with blanks treated as absent.
///
/// A tag written as an empty string is how a tagger says "I did not fill this
/// in", and carrying it forward as `Some("")` produces a library of albums
/// called nothing.
fn text(tags: &HashMap<String, String>, names: &[&str]) -> Option<String> {
    tag(tags, names)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

/// A track or disc number, from any of the ways one is written.
///
/// `4`, `04`, and `4/12` all mean four. The part after the slash is how many
/// there are in total, which is a fact about the album rather than the track.
fn number(value: &str) -> Option<u32> {
    value
        .split(['/', '-'])
        .next()?
        .trim()
        .parse::<u32>()
        .ok()
        .filter(|number| *number > 0)
}

/// A year, from a tag that may be a year or may be a whole date.
///
/// `2026`, `2026-05-01` and `2026/05/01` all mean 2026. Anything that does not
/// start with four digits is not a date this can read, and guessing at it would
/// put albums in the wrong decade rather than in no decade.
fn year(value: &str) -> Option<i32> {
    let digits: String = value
        .trim()
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    if digits.len() != 4 {
        return None;
    }
    digits.parse::<i32>().ok().filter(|year| *year > 0)
}

/// Whether a sleeve is embedded in the file.
///
/// The `attached_pic` flag rather than the presence of a video stream: cover
/// art *is* a video stream as far as the container is concerned, and so is the
/// video in a music video. Only one of the two is a sleeve.
fn has_art(probe: &serde_json::Value) -> bool {
    probe
        .get("streams")
        .and_then(|value| value.as_array())
        .is_some_and(|streams| {
            streams.iter().any(|stream| {
                stream
                    .get("disposition")
                    .and_then(|disposition| disposition.get("attached_pic"))
                    .and_then(|value| value.as_u64())
                    == Some(1)
            })
        })
}

/// Whether this file is one the library should read.
pub fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
}

/// Every audio file under `root`, however deep.
///
/// Iterative rather than recursive, because a music folder is a user's own
/// folder and a symlink loop in one should not be a stack overflow in here.
/// Depth is capped for the same reason: a cycle that survives everything else
/// still terminates.
pub fn walk(root: &Path, limit: usize) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut pending = vec![(root.to_path_buf(), 0usize)];

    while let Some((folder, depth)) = pending.pop() {
        if depth > 12 {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&folder) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                // A leading dot is a folder its owner has asked not to be shown.
                if SKIPPED.contains(&name.as_str()) || name.starts_with('.') {
                    continue;
                }
                pending.push((path, depth + 1));
            } else if kind.is_file() && is_audio(&path) {
                found.push(path);
                if found.len() >= limit {
                    return found;
                }
            }
        }
    }

    found
}

/// A sleeve sitting beside the music rather than inside it.
///
/// The convention every ripper and every download follows, in the order they
/// are worth trying. Only used for a file with nothing embedded, because what
/// is in the file is about the track and what is in the folder is about the
/// folder — and they disagree on a compilation.
const SLEEVE_NAMES: &[&str] = &["cover", "folder", "front", "album", "albumart", "art"];
const SLEEVE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp"];

/// The picture file beside `path`, if the folder has one.
pub fn sleeve_beside(path: &Path) -> Option<PathBuf> {
    let folder = path.parent()?;
    for name in SLEEVE_NAMES {
        for extension in SLEEVE_EXTENSIONS {
            let candidate = folder.join(format!("{name}.{extension}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// The library as it stands, and where it is kept between launches.
///
/// One list of songs and one list of folders they were found in. Both are
/// written out whole rather than updated in place: a library is a few megabytes
/// of text at the sizes people have, and a format that can be half-written is a
/// format that eventually is.
#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Index {
    /// Folders the user has asked to be watched.
    pub folders: Vec<String>,
    pub songs: Vec<Song>,
}

pub struct Library {
    index: Mutex<Index>,
    file: PathBuf,
    /// True while a scan is running, so a second one cannot start on top of it.
    scanning: Mutex<bool>,
}

impl Library {
    /// Read the library from disk, or start an empty one.
    ///
    /// A file that will not parse is treated as no library rather than as an
    /// error: the songs in it are a cache of what is on the disk, and the disk
    /// is still there to be read again. Refusing to start over a corrupt cache
    /// would be refusing to start over something disposable.
    pub fn open(dir: PathBuf) -> Self {
        let file = dir.join("library.json");
        let index = std::fs::read(&file)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Index>(&bytes).ok())
            .unwrap_or_default();
        Self {
            index: Mutex::new(index),
            file,
            scanning: Mutex::new(false),
        }
    }

    pub fn snapshot(&self) -> Index {
        self.index
            .lock()
            .map(|held| held.clone())
            .unwrap_or_default()
    }

    pub fn folders(&self) -> Vec<String> {
        self.index
            .lock()
            .map(|held| held.folders.clone())
            .unwrap_or_default()
    }

    /// Add a folder to watch. Returns false if it was already being watched.
    ///
    /// A folder inside one already watched is refused too. Watching both would
    /// walk its contents twice and file every track in it under two folders,
    /// and removing the outer one would then half-remove the inner.
    pub fn watch(&self, folder: String) -> Result<bool, String> {
        let mut held = self.index.lock().map_err(|_| "the library is poisoned")?;
        if held.folders.iter().any(|known| covers(known, &folder)) {
            return Ok(false);
        }
        // The reverse: a folder that contains one already watched replaces it.
        held.folders.retain(|known| !covers(&folder, known));
        held.folders.push(folder);
        held.folders.sort();
        self.write(&held);
        Ok(true)
    }

    /// Stop watching a folder, and forget the songs found under it.
    pub fn unwatch(&self, folder: &str) -> Result<(), String> {
        let mut held = self.index.lock().map_err(|_| "the library is poisoned")?;
        held.folders.retain(|known| known != folder);
        held.songs.retain(|song| !covers(folder, &song.path));
        self.write(&held);
        Ok(())
    }

    /// Replace the library's songs with a freshly walked set.
    pub fn replace(&self, songs: Vec<Song>) -> Result<(), String> {
        let mut held = self.index.lock().map_err(|_| "the library is poisoned")?;
        held.songs = songs;
        self.write(&held);
        Ok(())
    }

    /// What is already known, by path, so a scan can skip what has not changed.
    pub fn known(&self) -> HashMap<String, Song> {
        self.snapshot()
            .songs
            .into_iter()
            .map(|song| (song.path.clone(), song))
            .collect()
    }

    /// Whether a scan may start, and a guard that ends it.
    ///
    /// Two scans at once would read every file twice and race each other to
    /// write the result, and the losing one would be the answer kept.
    pub fn begin_scan(&self) -> Option<ScanGuard<'_>> {
        let mut held = self.scanning.lock().ok()?;
        if *held {
            return None;
        }
        *held = true;
        Some(ScanGuard(self))
    }

    /// Write the index out, best effort.
    ///
    /// A library that cannot be saved is still a library for this session, and
    /// stopping the scan over it would trade something for nothing.
    fn write(&self, index: &Index) {
        if let Some(folder) = self.file.parent() {
            let _ = std::fs::create_dir_all(folder);
        }
        if let Ok(bytes) = serde_json::to_vec(index) {
            let _ = std::fs::write(&self.file, bytes);
        }
    }
}

pub struct ScanGuard<'a>(&'a Library);

impl Drop for ScanGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut held) = self.0.scanning.lock() {
            *held = false;
        }
    }
}

/// Whether `folder` is `path` or contains it.
///
/// Compared case-insensitively, because Windows paths are, and a folder added
/// as `D:\Music` must match a file walked up as `D:\music\...`. The separator
/// is required so that `D:\Music` does not appear to contain `D:\Music Videos`.
fn covers(folder: &str, path: &str) -> bool {
    let folder = folder.to_lowercase();
    let path = path.to_lowercase();
    if path == folder {
        return true;
    }
    let prefix = if folder.ends_with(['\\', '/']) {
        folder
    } else {
        format!("{folder}\\")
    };
    path.starts_with(&prefix) || path.starts_with(&prefix.replace('\\', "/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn probe_with(tags: serde_json::Value) -> serde_json::Value {
        serde_json::json!({
            "streams": [{ "index": 0, "codec_type": "audio", "codec_name": "flac" }],
            "format": { "duration": "241.5", "tags": tags }
        })
    }

    /// Vorbis comments arrive upper-case and MP4 atoms lower-case, and the same
    /// field is spelled three ways across the two. One reader has to find all
    /// of them or a FLAC library shows an album called nothing by nobody.
    #[test]
    fn tags_are_found_whatever_case_they_were_written_in() {
        let song = Song::read(
            Path::new("D:\\Music\\01 Opening.flac"),
            &probe_with(serde_json::json!({
                "TITLE": "Opening",
                "ARTIST": "Auva",
                "ALBUMARTIST": "Various",
                "ALBUM": "First Light",
                "DATE": "2026-05-01",
            })),
            0,
            0,
        );
        assert_eq!(song.title, "Opening");
        assert_eq!(song.artist.as_deref(), Some("Auva"));
        assert_eq!(song.album_artist.as_deref(), Some("Various"));
        assert_eq!(song.album.as_deref(), Some("First Light"));
        assert_eq!(song.year, Some(2026));
    }

    /// An untagged rip is still a track somebody wants to play, and the only
    /// name it has is the one on disk.
    #[test]
    fn an_untagged_file_is_named_after_itself() {
        let song = Song::read(
            Path::new("D:\\Music\\04 Untitled.mp3"),
            &probe_with(serde_json::json!({})),
            0,
            0,
        );
        assert_eq!(song.title, "04 Untitled");
        assert_eq!(song.file, "04 Untitled.mp3");
        assert_eq!(song.artist, None);
    }

    /// A tag filled in with nothing is a tag nobody filled in. Carrying the
    /// empty string forward produces a library grouped under a blank album.
    #[test]
    fn a_blank_tag_counts_as_no_tag() {
        let song = Song::read(
            Path::new("D:\\Music\\05 Track.mp3"),
            &probe_with(serde_json::json!({ "title": "   ", "album": "" })),
            0,
            0,
        );
        assert_eq!(song.title, "05 Track");
        assert_eq!(song.album, None);
    }

    #[test]
    fn a_track_number_may_say_how_many_there_are() {
        assert_eq!(number("4"), Some(4));
        assert_eq!(number("04"), Some(4));
        assert_eq!(number("4/12"), Some(4));
        assert_eq!(number("0"), None);
        assert_eq!(number("side b"), None);
    }

    #[test]
    fn a_year_may_be_written_as_a_whole_date() {
        assert_eq!(year("2026"), Some(2026));
        assert_eq!(year("2026-05-01"), Some(2026));
        assert_eq!(year("2026/05/01"), Some(2026));
        // Two digits is not a year this can place in a century.
        assert_eq!(year("96"), None);
        assert_eq!(year("unknown"), None);
    }

    /// A music video's picture is a video stream and so is a sleeve. Only the
    /// flag tells them apart, and reading the stream instead would put a still
    /// from the video on the tile.
    #[test]
    fn only_an_attached_picture_counts_as_a_sleeve() {
        let sleeve = serde_json::json!({
            "streams": [
                { "codec_type": "audio", "codec_name": "mp3" },
                { "codec_type": "video", "codec_name": "mjpeg",
                  "disposition": { "attached_pic": 1 } },
            ]
        });
        let video = serde_json::json!({
            "streams": [
                { "codec_type": "audio", "codec_name": "aac" },
                { "codec_type": "video", "codec_name": "h264",
                  "disposition": { "attached_pic": 0 } },
            ]
        });
        assert!(has_art(&sleeve));
        assert!(!has_art(&video));
    }

    /// The check that stops a folder being watched twice, and the near miss it
    /// has to survive: two folders whose names share a prefix are two folders.
    #[test]
    fn a_watched_folder_contains_only_what_is_under_it() {
        assert!(covers("D:\\Music", "D:\\Music\\Album\\01.flac"));
        assert!(covers("D:\\Music", "d:\\music\\album\\01.flac"));
        assert!(covers("D:\\Music", "D:\\Music"));
        assert!(!covers("D:\\Music", "D:\\Music Videos\\01.mp4"));
        assert!(!covers("D:\\Music\\Album", "D:\\Music"));
    }

    #[test]
    fn the_library_walks_only_what_it_can_read() {
        assert!(is_audio(Path::new("D:\\Music\\01.FLAC")));
        assert!(is_audio(Path::new("D:\\Music\\01.mp3")));
        assert!(!is_audio(Path::new("D:\\Music\\cover.jpg")));
        assert!(!is_audio(Path::new("D:\\Music\\Concert.mkv")));
    }
}
