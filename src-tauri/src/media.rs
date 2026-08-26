//! Playback plumbing: FFmpeg on one side, the page's media element on the other.
//!
//! The picture is still drawn by the webview, because a webview cannot show a
//! native window behind it and no arrangement of z-order or transparency on
//! Windows changes that. What the webview can do is decode, in hardware,
//! anything handed to it in a container it understands.
//!
//! So the container is the part that moves here. FFmpeg opens the file,
//! repackages the streams into fragmented MP4, and writes them to a socket the
//! page reads. Nothing is re-encoded unless the codec inside genuinely cannot
//! reach a browser, which is rarer than it sounds: an MKV holding H.264 or HEVC
//! is copied through untouched and still decodes on the graphics card.
//!
//! It travels over a loopback socket rather than the Tauri IPC because this is
//! a stream, gigabytes of it, arriving for as long as the film plays. The IPC
//! is built for messages.

use std::collections::HashMap;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use crate::pgs;

use bytes::Bytes;
use http_body_util::combinators::BoxBody;
use http_body_util::{BodyExt, Full, StreamBody as HttpStreamBody};
use hyper::body::Frame;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use percent_encoding::percent_decode_str;
use serde::Serialize;
use tokio::io::AsyncReadExt;
use tokio::net::TcpListener;
use tokio::process::Command;

/// Names the temporary file a tag edit writes through, uniquely.
///
/// A counter rather than a timestamp: an album-wide change edits a dozen files
/// inside the same second, and a name made from the clock would collide.
static EDITS: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// Hides the console window Windows would otherwise flash for each child.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Codecs an MP4 fragment can carry that a browser will then decode itself.
///
/// HEVC is on the list on purpose. Windows decodes it in hardware when the
/// platform extension is installed, and re-encoding it to H.264 on the way past
/// would trade a free hardware decode for a busy one.
pub const COPYABLE_VIDEO: &[&str] = &["h264", "hevc", "av1"];

/// Where in a file a representative frame is taken from, as a fraction of its
/// length. Far enough in to clear titles, fades and distributor logos.
const POSTER_FRACTION: f64 = 0.12;

/// Audio a browser will play from an MP4 fragment.
///
/// FLAC and Opus are on the list because of music. They used to be re-encoded
/// to AAC, which for a film is a cost nobody can hear beside the video and for
/// an album is the whole point of the file being thrown away: a lossless track
/// arriving at the speakers as 192k AAC is not the track that was on the disk.
/// Both go into an MP4 fragment unchanged, and this webview decodes both.
///
/// What is left over is chiefly AC-3 and DTS, which no browser decodes.
pub const COPYABLE_AUDIO: &[&str] = &["aac", "mp3", "flac", "opus"];

/// Audio that carries every sample that was recorded.
///
/// What this decides is what a track is converted *to* when it cannot be
/// copied: FLAC rather than AAC. The same samples in a container the webview
/// reads, at a larger size and at no cost to what was recorded. Everything not
/// named here was already lossy before Cadence saw it, and converting it again
/// to AAC loses nothing the first encoder had not already discarded.
///
/// FLAC is on the list even though it is also copyable, because the list is a
/// statement about the codec rather than about what happens to it. Answering
/// "lossy" for FLAC would be false in a way that is invisible until the day
/// something else asks.
///
/// `pcm_` is a prefix rather than a name because there are dozens of them,
/// one per width, sign and byte order, and they are all uncompressed.
const LOSSLESS_AUDIO: &[&str] = &["flac", "alac", "wavpack", "tta", "mlp", "truehd", "ape"];

/// Whether re-encoding this codec would be the second time it lost something.
fn is_lossless(codec: &str) -> bool {
    codec.starts_with("pcm_") || LOSSLESS_AUDIO.contains(&codec)
}

/// Subtitle codecs that are plain words, and can be lifted out as WebVTT.
///
/// The fragments carry no subtitles at all, so a track inside the container
/// reaches the viewer only by being extracted separately. That works for these
/// because they are words and nothing else: converting one is a re-encoding of
/// the same sentences into different punctuation, and nothing is lost because
/// there was nothing else there.
pub const TEXT_SUBTITLES: &[&str] = &["subrip", "srt", "mov_text", "webvtt", "text"];

/// Subtitles that are a script: text, and instructions for drawing it.
///
/// ASS carries where each line sits, in what font, at what angle, in what
/// colour, and how it moves, which is how a translated sign appears on the
/// wall it is written on rather than as a caption underneath. Converting one to
/// WebVTT keeps the sentences and throws all of that away, which this player
/// used to do, so a translated sign arrived as a line of text at the bottom of
/// the screen with no clue what it was labelling.
///
/// They are handed to libass instead, which is the program that renders these
/// everywhere else they are rendered properly.
pub const SCRIPT_SUBTITLES: &[&str] = &["ass", "ssa"];

/// Attachment formats that are fonts.
///
/// A script names the fonts it wants and a rip carries them, because the
/// alternative is a sign that reads correctly and looks nothing like the sign.
/// Anything else attached, cover art, a text file, the release notes, is not
/// wanted here.
pub const FONT_ATTACHMENTS: &[&str] = &["ttf", "otf", "woff", "woff2"];

/// Subtitles that are pictures, and can be shown as pictures.
///
/// It is easy to believe these need OCR, and this player believed it. They do
/// not. OCR is what turns a picture of a sentence back into the sentence, which
/// is needed to search it or restyle it and is not needed to look at it. A
/// Blu-ray disc shows these without reading them, and so can a player.
///
/// Missing here is VobSub, the DVD format, which is a different encoding inside
/// a different container and is left for its own day. It stays listed and
/// unusable, which is at least now true for a reason that is about the work and
/// not about a mistake.
pub const PICTURE_SUBTITLES: &[&str] = &["hdmv_pgs_subtitle", "pgssub"];

/// H.264 encoders in the order they are worth trying: the three vendor blocks
/// on the graphics card, then Media Foundation, which covers whatever card is
/// installed, and only then software.
const VIDEO_ENCODERS: &[&str] = &[
    "h264_nvenc",
    "h264_qsv",
    "h264_amf",
    "h264_mf",
    "libopenh264",
];

pub struct Media {
    ffmpeg: PathBuf,
    ffprobe: PathBuf,
    /// Guards the socket. Any process on the machine can reach a loopback port,
    /// and what this one serves is whole films from the user's disk.
    token: String,
    port: u16,
    /// Chosen once, because choosing means running FFmpeg to ask what it has.
    encoder: String,
    /// Inspections already done, by path.
    ///
    /// Every seek opens a new stream and every stream has to know whether it
    /// can copy, so without this a scrub down a timeline runs ffprobe once per
    /// jump. Held for the life of the process: a file that changes underneath a
    /// player mid-viewing is not a case worth paying for on every seek.
    probed: std::sync::Mutex<HashMap<String, serde_json::Value>>,
    /// The picture subtitle track currently in use, decoded.
    ///
    /// One, not a table of them. A film's worth of subtitle images is a few
    /// megabytes, and nobody watches two tracks at once; keeping every track
    /// ever chosen would spend that repeatedly to save a second on a switch
    /// back that mostly does not happen.
    pictures: std::sync::Mutex<Option<(String, Arc<pgs::Track>)>>,
}

#[derive(Serialize, Clone)]
pub struct Endpoint {
    pub base: String,
    pub token: String,
}

fn ffmpeg_command(program: &PathBuf) -> Command {
    let mut command = Command::new(program);
    command.stdin(Stdio::null());
    // tokio's Command carries this itself on Windows, so no trait import.
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

impl Media {
    /// Resolve the bundled binaries and choose an encoder.
    pub async fn prepare(dir: PathBuf) -> Result<Self, String> {
        let ffmpeg = dir.join("ffmpeg.exe");
        let ffprobe = dir.join("ffprobe.exe");
        if !ffmpeg.exists() {
            return Err(format!("no ffmpeg at {}", ffmpeg.display()));
        }

        let encoder = pick_encoder(&ffmpeg).await;

        Ok(Self {
            ffmpeg,
            ffprobe,
            token: uuid::Uuid::new_v4().to_string(),
            port: 0,
            encoder,
            probed: std::sync::Mutex::new(HashMap::new()),
            pictures: std::sync::Mutex::new(None),
        })
    }

    /// A `Media` with no binaries behind it, for the tests that only ask it
    /// to assemble arguments. `prepare` cannot be used there: it insists on
    /// finding FFmpeg on disk, and building the arguments does not need it.
    #[cfg(test)]
    fn for_tests() -> Self {
        Self {
            ffmpeg: PathBuf::from("ffmpeg"),
            ffprobe: PathBuf::from("ffprobe"),
            token: String::new(),
            port: 0,
            encoder: "libopenh264".to_owned(),
            probed: std::sync::Mutex::new(HashMap::new()),
            pictures: std::sync::Mutex::new(None),
        }
    }

    pub fn endpoint(&self) -> Endpoint {
        Endpoint {
            base: format!("http://127.0.0.1:{}", self.port),
            token: self.token.clone(),
        }
    }

    /// Read a file's streams, duration and metadata.
    pub async fn probe(&self, path: &str) -> Result<serde_json::Value, String> {
        if let Ok(cache) = self.probed.lock() {
            if let Some(hit) = cache.get(path) {
                return Ok(hit.clone());
            }
        }

        let output = ffmpeg_command(&self.ffprobe)
            .args([
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                path,
            ])
            .output()
            .await
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(format!("ffprobe could not read {path}"));
        }

        let probe: serde_json::Value =
            serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;

        if let Ok(mut cache) = self.probed.lock() {
            cache.insert(path.to_owned(), probe.clone());
        }

        Ok(probe)
    }

    /// The FFmpeg invocation that turns `path` into a fragment stream on stdout.
    ///
    /// `-ss` goes before `-i` so the seek lands on a keyframe without decoding
    /// everything before it, which is the difference between a seek in a 4GB
    /// film taking a moment and taking a minute. It also rebases the output
    /// clock to zero, so the page shifts the fragments back into place itself.
    pub fn stream_args(&self, req: &StreamRequest) -> Vec<String> {
        let mut args: Vec<String> = vec!["-hide_banner".into(), "-loglevel".into(), "error".into()];

        if req.start > 0.0 {
            args.push("-ss".into());
            args.push(format!("{:.3}", req.start));
        }

        args.push("-i".into());
        args.push(req.path.clone());

        args.push("-map".into());
        /* Capital `V` is video that is really video. The lower-case selector
        also matches an attached picture, the cover art on an MP3, which
        ffprobe reports as a single mjpeg frame, and muxing that into the
        fragments produces a stream the page is then told has a video track,
        which is a black rectangle where a record sleeve belongs.

        `?` makes the whole thing optional, because an album track has no
        video at all and should play rather than fail at the muxer. */
        args.push("0:V:0?".into());
        args.push("-map".into());
        match req.audio {
            Some(index) => args.push(format!("0:{index}")),
            // Optional for the same reason on the other side: a film with no
            // audio track should play.
            None => args.push("0:a:0?".into()),
        }

        args.push("-c:v".into());
        if req.copy_video {
            args.push("copy".into());
        } else {
            args.push(self.encoder.clone());
        }

        args.push("-c:a".into());
        if req.copy_audio {
            args.push("copy".into());
        } else if req.lossless {
            // Nothing to choose here. FLAC is the same samples, and a bitrate
            // would only be a bitrate to ignore.
            args.push("flac".into());
        } else {
            args.extend(["aac".into(), "-b:a".into(), "192k".into()]);
        }

        args.extend([
            "-movflags".into(),
            "+frag_keyframe+empty_moov+default_base_moof".into(),
            /* A fragment is normally cut at each keyframe, and a fragment's
            header is written after its contents, so nothing can be played
            until the whole fragment has arrived. That is fine at the two to
            ten seconds most films put between keyframes and ruinous at the
            other end: a screen recording or an animation can run minutes
            without one, and playback would wait all of it. Cutting on
            elapsed time as well bounds the wait to this. */
            "-frag_duration".into(),
            "2000000".into(),
            // Media Source rejects a fragment whose timestamps run backwards,
            // which is what a mid-GOP cut produces without this.
            "-avoid_negative_ts".into(),
            "make_zero".into(),
            "-f".into(),
            "mp4".into(),
            "pipe:1".into(),
        ]);

        args
    }
}

/// One request for a stream, already validated.
pub struct StreamRequest {
    pub path: String,
    pub start: f64,
    pub audio: Option<u32>,
    pub copy_video: bool,
    pub copy_audio: bool,
    /// The source audio is lossless, so converting it must not be to AAC.
    /// Read only when `copy_audio` is false.
    pub lossless: bool,
}

/// Ask FFmpeg which encoders this build and this machine actually offer.
///
/// Each candidate is made to encode a frame rather than merely appear in
/// `-encoders`. The listing describes the build, which is the same on every
/// machine Cadence is installed on; whether `h264_nvenc` can open a session
/// depends on there being an NVIDIA card in front of it. Choosing off the
/// listing picks the same encoder everywhere and fails everywhere it is wrong,
/// and it now fails visibly: converting is how HEVC reaches the browser, not a
/// rare path taken for unusual audio.
///
/// The cost is a handful of sub-second processes, once, on a background task
/// started before the window is shown.
async fn pick_encoder(ffmpeg: &PathBuf) -> String {
    for name in VIDEO_ENCODERS {
        let works = ffmpeg_command(ffmpeg)
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=black:s=256x144",
                "-c:v",
                name,
                "-frames:v",
                "1",
                "-f",
                "null",
                "-",
            ])
            .output()
            .await
            .map(|out| out.status.success())
            .unwrap_or(false);

        if works {
            return (*name).to_string();
        }
    }

    // Every candidate refused, which leaves nothing to convert with. Naming the
    // software encoder anyway keeps the failure at the file that needs it
    // rather than at startup, and says what was missing in FFmpeg's own words.
    "libopenh264".to_string()
}

// ── The socket ──

type StreamBody = BoxBody<Bytes, std::io::Error>;

fn text(status: StatusCode, message: &str) -> Response<StreamBody> {
    Response::builder()
        .status(status)
        .header("access-control-allow-origin", "*")
        .header("content-type", "text/plain; charset=utf-8")
        .body(
            Full::new(Bytes::from(message.to_owned()))
                .map_err(|never| match never {})
                .boxed(),
        )
        .expect("a text response is always well formed")
}

/// Decode one `application/x-www-form-urlencoded` component.
///
/// The plus sign is a space in that encoding, and a space is exactly what it
/// means here: these URLs are built by `URLSearchParams`, which is what writes
/// the plus. Percent-decoding alone leaves it standing, and the path that
/// arrives then names a file nobody has, which broke every video with a space
/// anywhere in its path, meaning very nearly every video anybody owns.
///
/// The order matters and is the reason this is a function rather than a call.
/// A plus that is genuinely in a filename is sent as `%2B`; percent-decoding
/// first would turn it into a plus and this step would then turn that into a
/// space. Replacing before decoding cannot make that mistake.
fn form_decode(value: &str) -> Option<String> {
    let spaced = value.replace('+', " ");
    Some(percent_decode_str(&spaced).decode_utf8().ok()?.into_owned())
}

fn query(uri: &hyper::Uri) -> HashMap<String, String> {
    uri.query()
        .unwrap_or_default()
        .split('&')
        .filter(|pair| !pair.is_empty())
        .filter_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            Some((form_decode(key)?, form_decode(value)?))
        })
        .collect()
}

async fn handle(
    request: Request<hyper::body::Incoming>,
    media: Arc<Media>,
) -> Result<Response<StreamBody>, Infallible> {
    let route = request.uri().path().to_owned();
    if !matches!(
        route.as_str(),
        "/stream" | "/frame" | "/artwork" | "/subtitle-image" | "/attachment" | "/font"
    ) {
        return Ok(text(StatusCode::NOT_FOUND, "Cadence does not serve that."));
    }

    let params = query(request.uri());

    /* Checked before the path is even read. The port is reachable by anything
    running as this user, and on the other side of it are the user's own
    files, so an unauthenticated request never gets as far as naming one. */
    if params.get("token").map(String::as_str) != Some(media.token.as_str()) {
        return Ok(text(StatusCode::FORBIDDEN, "Not for you."));
    }

    /* A font off this machine, by the name a script asked for. Named rather
    than pathed: what may be served is exactly what was found installed, so
    there is nothing here for a made-up path to reach. */
    if route == "/font" {
        let wanted = params.get("name").and_then(|name| crate::fonts::path(name));

        let Some(file) = wanted else {
            return Ok(text(StatusCode::NOT_FOUND, "No such font."));
        };

        return Ok(match std::fs::read(file) {
            Ok(bytes) => Response::builder()
                .status(StatusCode::OK)
                .header("content-type", "font/ttf")
                .header("access-control-allow-origin", "*")
                .header("cache-control", "max-age=86400")
                .body(
                    Full::new(Bytes::from(bytes))
                        .map_err(|never| match never {})
                        .boxed(),
                )
                .expect("a font response is always well formed"),
            Err(err) => text(StatusCode::UNPROCESSABLE_ENTITY, &err.to_string()),
        });
    }

    let Some(path) = params.get("path").cloned() else {
        return Ok(text(StatusCode::BAD_REQUEST, "No path."));
    };

    let start = params
        .get("t")
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(0.0);

    /* A sleeve. Its own route rather than a case of `/frame`, because the two
    look for different things in different places: a film's thumbnail is a
    moment part-way through a video stream, and a sleeve is a still with no
    timeline, which may not be in the file at all. */
    if route == "/artwork" {
        let width = params
            .get("w")
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or(640);

        return Ok(match media.artwork(&path, width).await {
            Ok(jpeg) => Response::builder()
                .status(StatusCode::OK)
                .header("content-type", "image/jpeg")
                .header("access-control-allow-origin", "*")
                // A sleeve does not change while the app is open, and a library
                // view asks for the same eighty of them every time it is
                // scrolled back to.
                .header("cache-control", "max-age=86400")
                .body(
                    Full::new(Bytes::from(jpeg))
                        .map_err(|never| match never {})
                        .boxed(),
                )
                .expect("an artwork response is always well formed"),
            // Not an error worth a page: most files simply have no sleeve, and
            // the tile has a placeholder for exactly this.
            Err(_) => text(StatusCode::NOT_FOUND, "No artwork."),
        });
    }

    if route == "/frame" {
        let width = params
            .get("w")
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or(420);
        let at = (start > 0.0).then_some(start);

        return Ok(match media.frame(&path, at, width).await {
            Ok(jpeg) => Response::builder()
                .status(StatusCode::OK)
                .header("content-type", "image/jpeg")
                .header("access-control-allow-origin", "*")
                // Keyed by path and timestamp, so the same request always has
                // the same answer. Letting the webview keep it is what makes
                // scrubbing back over a stretch of timeline free.
                .header("cache-control", "max-age=86400")
                .body(
                    Full::new(Bytes::from(jpeg))
                        .map_err(|never| match never {})
                        .boxed(),
                )
                .expect("a frame response is always well formed"),
            Err(err) => text(StatusCode::UNPROCESSABLE_ENTITY, &err),
        });
    }

    /* A font out of the film. A script names the fonts it wants, and a rip
    carries them precisely because the machine playing it will not have them.
    Serving them from here rather than passing them through a message keeps a
    twelve-megabyte CJK face off the IPC and lets the webview cache it. */
    if route == "/attachment" {
        let Some(index) = params
            .get("index")
            .and_then(|value| value.parse::<u32>().ok())
        else {
            return Ok(text(StatusCode::BAD_REQUEST, "No such attachment."));
        };

        return Ok(match media.attachment(&path, index).await {
            Ok(font) => Response::builder()
                .status(StatusCode::OK)
                .header("content-type", "font/ttf")
                .header("access-control-allow-origin", "*")
                .header("cache-control", "max-age=86400")
                .body(
                    Full::new(Bytes::from(font))
                        .map_err(|never| match never {})
                        .boxed(),
                )
                .expect("an attachment response is always well formed"),
            Err(err) => text(StatusCode::UNPROCESSABLE_ENTITY, &err),
        });
    }

    /* One picture out of a subtitle track. The page asks for these by number
    as they come due, rather than being handed the whole track at once: a film
    carries a thousand or so, and a message big enough to hold them all would
    be paid for in full by everyone who watches the first five minutes. */
    if route == "/subtitle-image" {
        let wanted = params
            .get("index")
            .and_then(|value| value.parse::<u32>().ok())
            .zip(
                params
                    .get("cue")
                    .and_then(|value| value.parse::<usize>().ok()),
            );

        let Some((index, number)) = wanted else {
            return Ok(text(StatusCode::BAD_REQUEST, "No such subtitle."));
        };

        let track = match media.pictures(&path, index).await {
            Ok(track) => track,
            Err(err) => return Ok(text(StatusCode::UNPROCESSABLE_ENTITY, &err)),
        };

        let Some(cue) = track.cues.get(number) else {
            return Ok(text(StatusCode::NOT_FOUND, "No such subtitle."));
        };

        return Ok(Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "image/png")
            .header("access-control-allow-origin", "*")
            // A cue is the same picture every time it is asked for, and it is
            // asked for again on every seek back over it. Letting the webview
            // keep it is what stops a rewatched scene decoding twice.
            .header("cache-control", "max-age=86400")
            .body(
                Full::new(Bytes::from(cue.png.clone()))
                    .map_err(|never| match never {})
                    .boxed(),
            )
            .expect("a subtitle response is always well formed"));
    }

    let audio = params
        .get("audio")
        .and_then(|value| value.parse::<u32>().ok());
    /* Absent means yes. The page sends these only to *refuse* a copy, having
    found that its browser will not decode what would arrive. */
    let allow_copy_video = params.get("copyv").map(String::as_str) != Some("0");
    let allow_copy_audio = params.get("copya").map(String::as_str) != Some("0");

    let plan = match media
        .plan(path, start, audio, allow_copy_video, allow_copy_audio)
        .await
    {
        Ok(plan) => plan,
        Err(err) => return Ok(text(StatusCode::UNPROCESSABLE_ENTITY, &err)),
    };

    let mut child = match ffmpeg_command(&media.ffmpeg)
        .args(media.stream_args(&plan))
        .stdout(Stdio::piped())
        // FFmpeg writes diagnostics to stderr and nothing here reads them.
        // Piping without draining would fill the pipe buffer and stall the
        // process partway through a film, so they go nowhere on purpose.
        .stderr(Stdio::null())
        // The client closing the connection is the signal to stop working. The
        // body below owns the child, so dropping one kills the other.
        .kill_on_drop(true)
        .spawn()
    {
        Ok(child) => child,
        Err(err) => {
            return Ok(text(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("could not start ffmpeg: {err}"),
            ))
        }
    };

    let Some(stdout) = child.stdout.take() else {
        return Ok(text(
            StatusCode::INTERNAL_SERVER_ERROR,
            "ffmpeg gave no output",
        ));
    };

    let fragments =
        futures_util::stream::unfold((child, stdout), |(child, mut stdout)| async move {
            let mut chunk = vec![0u8; 64 * 1024];
            match stdout.read(&mut chunk).await {
                // End of stream. Dropping the state here is what reaps the child.
                Ok(0) | Err(_) => None,
                Ok(read) => {
                    chunk.truncate(read);
                    Some((Ok(Frame::data(Bytes::from(chunk))), (child, stdout)))
                }
            }
        });

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "video/mp4")
        .header("access-control-allow-origin", "*")
        .header("cache-control", "no-store")
        .body(HttpStreamBody::new(fragments).boxed())
        .expect("a stream response is always well formed"))
}

impl Media {
    /// Whether the video and audio can be copied rather than re-encoded.
    ///
    /// This is the one judgement in the pipeline the page also needs, because
    /// copying and converting are different enough to tell the viewer apart.
    /// It is answered here rather than in both places: two copies of a codec
    /// list drift, and the one that drifts is always the one nobody ran.
    fn decisions(probe: &serde_json::Value) -> (bool, bool) {
        let empty = Vec::new();
        let streams = probe
            .get("streams")
            .and_then(|value| value.as_array())
            .unwrap_or(&empty);

        /* An attached picture is not a video track, however much ffprobe's
        `codec_type` insists it is. Cover art on an MP3 is one mjpeg frame with
        `attached_pic` set, and reading it as the file's video is how an album
        ends up reported as a film in a codec no browser copies. */
        let codec_of = |kind: &str| -> Option<&str> {
            streams
                .iter()
                .find(|stream| {
                    stream.get("codec_type").and_then(|v| v.as_str()) == Some(kind)
                        && stream
                            .get("disposition")
                            .and_then(|d| d.get("attached_pic"))
                            .and_then(|v| v.as_u64())
                            != Some(1)
                })
                .and_then(|stream| stream.get("codec_name").and_then(|v| v.as_str()))
        };

        // Absent means there is no such track, and no such track means nothing
        // to re-encode. The flag then picks between two `-c:` values the muxer
        // will never reach.
        (
            codec_of("video")
                .map(|name| COPYABLE_VIDEO.contains(&name))
                .unwrap_or(true),
            codec_of("audio")
                .map(|name| COPYABLE_AUDIO.contains(&name))
                .unwrap_or(true),
        )
    }

    /// Which subtitle streams are written in one of these codecs.
    ///
    /// By stream index, because that is what selecting one has to pass back.
    fn subtitles_in(probe: &serde_json::Value, codecs: &[&str]) -> Vec<u64> {
        probe
            .get("streams")
            .and_then(|value| value.as_array())
            .map(|streams| {
                streams
                    .iter()
                    .filter(|stream| {
                        stream.get("codec_type").and_then(|v| v.as_str()) == Some("subtitle")
                            && stream
                                .get("codec_name")
                                .and_then(|v| v.as_str())
                                .is_some_and(|name| codecs.contains(&name))
                    })
                    .filter_map(|stream| stream.get("index").and_then(|v| v.as_u64()))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Which attachment streams are fonts a script might ask for.
    ///
    /// By stream index, because that is what fetching one has to pass back.
    fn fonts_in(probe: &serde_json::Value) -> Vec<u64> {
        probe
            .get("streams")
            .and_then(|value| value.as_array())
            .map(|streams| {
                streams
                    .iter()
                    .filter(|stream| {
                        stream.get("codec_type").and_then(|v| v.as_str()) == Some("attachment")
                            && stream
                                .get("codec_name")
                                .and_then(|v| v.as_str())
                                .is_some_and(|name| FONT_ATTACHMENTS.contains(&name))
                    })
                    .filter_map(|stream| stream.get("index").and_then(|v| v.as_u64()))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Which codec each audio track would arrive as, were it converted.
    ///
    /// By stream index, and the whole map rather than one answer, because the
    /// viewer can change audio track without anything being re-inspected. A
    /// film can carry a lossy commentary beside a lossless mix, and the two
    /// convert to different things.
    ///
    /// The page has to declare what is coming before a byte of it does, so it
    /// cannot be left to infer this. It used to be able to, the answer was
    /// always AAC, and then lossless sources started converting to FLAC
    /// instead, at which point an inference would have been a declaration of
    /// AAC over a stream carrying FLAC, which Media Source refuses outright.
    fn audio_fallbacks(probe: &serde_json::Value) -> serde_json::Map<String, serde_json::Value> {
        let mut fallbacks = serde_json::Map::new();
        let Some(streams) = probe.get("streams").and_then(|value| value.as_array()) else {
            return fallbacks;
        };
        for stream in streams {
            if stream.get("codec_type").and_then(|v| v.as_str()) != Some("audio") {
                continue;
            }
            let Some(index) = stream.get("index").and_then(|v| v.as_u64()) else {
                continue;
            };
            let lossless = stream
                .get("codec_name")
                .and_then(|v| v.as_str())
                .is_some_and(is_lossless);
            fallbacks.insert(
                index.to_string(),
                serde_json::Value::from(if lossless { "flac" } else { "aac" }),
            );
        }
        fallbacks
    }

    /// A file's streams, with what Cadence intends to do about them attached.
    pub async fn describe(&self, path: &str) -> Result<serde_json::Value, String> {
        let mut probe = self.probe(path).await?;
        let (copy_video, copy_audio) = Self::decisions(&probe);
        let audio_fallbacks = Self::audio_fallbacks(&probe);
        let subtitles = Self::subtitles_in(&probe, TEXT_SUBTITLES);
        let pictures = Self::subtitles_in(&probe, PICTURE_SUBTITLES);
        let scripts = Self::subtitles_in(&probe, SCRIPT_SUBTITLES);

        if let Some(fields) = probe.as_object_mut() {
            fields.insert(
                "cadence".to_owned(),
                serde_json::json!({
                    "copyVideo": copy_video,
                    "copyAudio": copy_audio,
                    "audioFallbacks": audio_fallbacks,
                    "subtitles": subtitles,
                    /* Three lists rather than one list of what works, because
                    the page fetches each by its own route and draws each its
                    own way, words into a track element, a script into libass,
                    a picture onto the frame where the disc put it. A single
                    list would only have to be taken apart again, and the three
                    are disjoint: a codec is in exactly one of them. */
                    "pictures": pictures,
                    "scripts": scripts,
                }),
            );
        }

        Ok(probe)
    }

    /// One subtitle stream, converted to WebVTT.
    ///
    /// The whole track at once rather than in step with playback. A film's
    /// subtitles are a few tens of kilobytes of text, so there is nothing to
    /// gain by streaming them and a good deal to lose: cues that arrive late
    /// are cues that are missed, and a seek would have to re-establish them.
    ///
    /// It does cost a pass over the container, because the last line is at the
    /// end of the file and there is no index that would say where. That is
    /// seconds on a large film, once, and it is why the caller shows the track
    /// as loading rather than assuming it is instant.
    ///
    /// Encoding is not a question here, unlike a subtitle file found on disk.
    /// Matroska stores text as UTF-8 by specification and FFmpeg emits UTF-8
    /// regardless, so the Arabic that arrives as mojibake from a downloaded
    /// `.srt` arrives intact from inside the film.
    pub async fn subtitle(&self, path: &str, index: u32) -> Result<String, String> {
        let args: Vec<String> = vec![
            "-hide_banner".into(),
            "-loglevel".into(),
            "error".into(),
            "-i".into(),
            path.to_owned(),
            "-map".into(),
            format!("0:{index}"),
            "-c:s".into(),
            "webvtt".into(),
            "-f".into(),
            "webvtt".into(),
            "pipe:1".into(),
        ];

        let output = ffmpeg_command(&self.ffmpeg)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|err| err.to_string())?;

        if !output.status.success() {
            // FFmpeg's own words. It is the only party that knows whether this
            // was a stream that is not a subtitle, a codec it declined, or a
            // file that moved.
            let why = String::from_utf8_lossy(&output.stderr);
            let why = why.lines().last().unwrap_or("").trim();
            return Err(if why.is_empty() {
                format!("could not read subtitle track {index}")
            } else {
                why.to_owned()
            });
        }

        // A track that converts cleanly and holds nothing is a real case: some
        // rips carry an empty stream for a language they never subtitled. It is
        // reported rather than shown, so the viewer is not left waiting for
        // cues that are not coming.
        let text = String::from_utf8(output.stdout)
            .map_err(|_| format!("subtitle track {index} is not text"))?;
        if !text.lines().any(|line| line.contains("-->")) {
            return Err(format!("subtitle track {index} is empty"));
        }

        Ok(text)
    }

    /// One subtitle stream, as the script it already is.
    ///
    /// Unlike the WebVTT conversion beside this, nothing is discarded: the
    /// styles, the positions, the override tags and the fonts each line asks
    /// for all come out as they went in. What reads them is libass, which is
    /// what reads them in every other player that renders these correctly.
    pub async fn script(&self, path: &str, index: u32) -> Result<String, String> {
        let output = ffmpeg_command(&self.ffmpeg)
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                path,
                "-map",
                &format!("0:{index}"),
                "-c:s",
                "ass",
                "-f",
                "ass",
                "pipe:1",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|err| err.to_string())?;

        if !output.status.success() {
            let why = String::from_utf8_lossy(&output.stderr);
            let why = why.lines().last().unwrap_or("").trim();
            return Err(if why.is_empty() {
                format!("could not read subtitle track {index}")
            } else {
                why.to_owned()
            });
        }

        // An ASS file is UTF-8 by the format's own account and FFmpeg emits
        // UTF-8 regardless, so there is nothing to detect here, unlike a
        // script found loose on a disk, which declares nothing about itself.
        let text = String::from_utf8(output.stdout)
            .map_err(|_| format!("subtitle track {index} is not a script"))?;
        if !text.contains("Dialogue:") {
            return Err(format!("subtitle track {index} is empty"));
        }

        Ok(text)
    }

    /// Which attachments in a file are fonts.
    ///
    /// Asked alongside a script rather than reported with everything else: a
    /// film's fonts matter only to whoever is about to draw its signs, and the
    /// inspection this reads is already done and kept.
    pub async fn fonts(&self, path: &str) -> Result<Vec<u64>, String> {
        Ok(Self::fonts_in(&self.probe(path).await?))
    }

    /// One attachment, as bytes.
    ///
    /// FFmpeg writes attachments to a file and offers no way to have one on a
    /// pipe, so it is written and read and removed. The name is never reused,
    /// because the page may well ask for the same font twice at once and two
    /// FFmpegs writing one path would hand back whatever was left of it.
    pub async fn attachment(&self, path: &str, index: u32) -> Result<Vec<u8>, String> {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let ticket = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let scratch = std::env::temp_dir().join(format!("cadence-{}-{ticket}", self.token));

        let output = ffmpeg_command(&self.ffmpeg)
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                &format!("-dump_attachment:{index}"),
                &scratch.to_string_lossy(),
                "-i",
                path,
                "-f",
                "null",
                "-",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|err| err.to_string())?;

        let bytes = std::fs::read(&scratch);
        let _ = std::fs::remove_file(&scratch);

        bytes.map_err(|_| {
            let why = String::from_utf8_lossy(&output.stderr);
            let why = why.lines().last().unwrap_or("").trim().to_owned();
            if why.is_empty() {
                format!("could not read attachment {index}")
            } else {
                why
            }
        })
    }

    /// One picture subtitle track, decoded into images.
    ///
    /// The stream is copied out rather than decoded on the way: PGS is already
    /// a sequence of small compressed pictures, so there is nothing for FFmpeg
    /// to do here but find the packets. A whole film's subtitles are a few
    /// hundred kilobytes and come out in about the time an inspection takes.
    ///
    /// Turning them into images is this program's own work, in `pgs`. What
    /// comes back is held rather than returned, because what the page wants is
    /// not a few megabytes of PNG in a single message but a list of times and
    /// places, and then the pictures one at a time as they come up.
    pub async fn pictures(&self, path: &str, index: u32) -> Result<Arc<pgs::Track>, String> {
        let key = format!("{index} {path}");

        if let Ok(held) = self.pictures.lock() {
            if let Some((theirs, track)) = held.as_ref() {
                if theirs == &key {
                    return Ok(Arc::clone(track));
                }
            }
        }

        let output = ffmpeg_command(&self.ffmpeg)
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                path,
                "-map",
                &format!("0:{index}"),
                "-c:s",
                "copy",
                "-f",
                "sup",
                "pipe:1",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|err| err.to_string())?;

        if !output.status.success() {
            let why = String::from_utf8_lossy(&output.stderr);
            let why = why.lines().last().unwrap_or("").trim();
            return Err(if why.is_empty() {
                format!("could not read subtitle track {index}")
            } else {
                why.to_owned()
            });
        }

        let track = Arc::new(pgs::read(&output.stdout));
        // The same case as an empty text track: some rips carry a stream for a
        // language they never subtitled, and the viewer should be told that
        // rather than left waiting for pictures that are not coming.
        if track.cues.is_empty() {
            return Err(format!("subtitle track {index} is empty"));
        }

        if let Ok(mut held) = self.pictures.lock() {
            *held = Some((key, Arc::clone(&track)));
        }

        Ok(track)
    }

    /// Decide what has to happen to a file before the page can play it.
    ///
    /// `allow_copy_*` is the page's veto. Whether a stream *can* be lifted out
    /// of the container untouched is decided here; whether the browser on the
    /// other end will then decode it is something only the page can find out,
    /// and it has been wrong about often enough to be worth asking. So these
    /// narrow the decision and can never widen it: a caller cannot talk this
    /// into copying a codec it just judged uncopyable.
    async fn plan(
        &self,
        path: String,
        start: f64,
        audio: Option<u32>,
        allow_copy_video: bool,
        allow_copy_audio: bool,
    ) -> Result<StreamRequest, String> {
        let probe = self.probe(&path).await?;
        if probe
            .get("streams")
            .and_then(|value| value.as_array())
            .is_none()
        {
            return Err(format!("nothing readable in {path}"));
        }
        let (copy_video, copy_audio) = Self::decisions(&probe);

        /* Which track is about to be converted, so that converting it can be
        told what it is. `audio` names a stream index when the viewer has
        chosen one; without it the muxer takes the first, which is what this
        has to agree with to be describing the same track. */
        let lossless = probe
            .get("streams")
            .and_then(|value| value.as_array())
            .and_then(|streams| {
                let stream = match audio {
                    Some(index) => streams.iter().find(|stream| {
                        stream.get("index").and_then(|v| v.as_u64()) == Some(u64::from(index))
                    }),
                    None => streams.iter().find(|stream| {
                        stream.get("codec_type").and_then(|v| v.as_str()) == Some("audio")
                    }),
                }?;
                stream.get("codec_name").and_then(|v| v.as_str())
            })
            .is_some_and(is_lossless);

        Ok(StreamRequest {
            path,
            start,
            audio,
            copy_video: copy_video && allow_copy_video,
            copy_audio: copy_audio && allow_copy_audio,
            lossless,
        })
    }

    /// How long a file runs, from the inspection that has already been cached.
    async fn duration(&self, path: &str) -> Option<f64> {
        self.probe(path)
            .await
            .ok()?
            .get("format")?
            .get("duration")?
            .as_str()?
            .parse::<f64>()
            .ok()
            .filter(|value| value.is_finite() && *value > 0.0)
    }

    /// Write tags, and optionally a new sleeve, into a file.
    ///
    /// FFmpeg cannot edit a file in place, so this is a remux: the streams are
    /// copied into a new file beside the old one with different metadata, and
    /// the new one takes the old one's name. Nothing is re-encoded, so a
    /// lossless track stays bit-for-bit what it was; what changes is the
    /// header.
    ///
    /// The temporary file is written into the same folder rather than into the
    /// system temp directory, for two reasons. A rename within a folder is
    /// atomic and a move across volumes is a copy, which for a two-hour
    /// recording is a minute of disk and a window in which both copies exist.
    /// And a music folder is somewhere the user can write by definition,
    /// whereas the temp directory on a locked-down machine may not be.
    ///
    /// An empty value removes the tag rather than writing an empty one, which
    /// is what "clear this field" has to mean.
    pub async fn write_tags(
        &self,
        path: &str,
        tags: &std::collections::BTreeMap<String, String>,
        art: Option<&str>,
    ) -> Result<(), String> {
        let file = std::path::Path::new(path);
        if !file.is_file() {
            return Err("it is not where it was".into());
        }
        let extension = file
            .extension()
            .and_then(|ext| ext.to_str())
            .ok_or("a file with no extension has no format to write back")?;

        /* Beside the original and named so that a crash halfway leaves
        something obviously disposable rather than something that looks like a
        track. The counter is there because two edits in the same second, which
        an album-wide change is, must not choose the same name. */
        let temp = file.with_file_name(format!(
            ".cadence-writing-{}.{extension}",
            EDITS.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));

        let mut args: Vec<String> = vec![
            "-hide_banner".into(),
            "-loglevel".into(),
            "error".into(),
            "-y".into(),
            "-i".into(),
            path.to_owned(),
        ];

        if let Some(picture) = art {
            args.extend(["-i".into(), picture.to_owned()]);
            /* Sound from the first input, picture from the second, and the
            picture marked as a sleeve rather than as a video track, without
            that flag every player treats the file as a one-frame film. */
            args.extend([
                "-map".into(),
                "0:a".into(),
                "-map".into(),
                "1:v".into(),
                "-c:a".into(),
                "copy".into(),
                "-c:v".into(),
                "mjpeg".into(),
                "-disposition:v".into(),
                "attached_pic".into(),
            ]);
        } else {
            // Everything as it stands, sleeve included.
            args.extend(["-map".into(), "0".into(), "-c".into(), "copy".into()]);
        }

        for (key, value) in tags {
            args.push("-metadata".into());
            // `key=` with nothing after it is how FFmpeg is told to drop a tag.
            args.push(format!("{key}={value}"));
        }

        args.push(temp.to_string_lossy().into_owned());

        let output = ffmpeg_command(&self.ffmpeg)
            .args(&args)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|err| err.to_string())?;

        if !output.status.success() || !temp.is_file() {
            let _ = std::fs::remove_file(&temp);
            let said = String::from_utf8_lossy(&output.stderr);
            let last = said.lines().last().unwrap_or("").trim();
            return Err(if last.is_empty() {
                "the file could not be rewritten".to_owned()
            } else {
                last.to_owned()
            });
        }

        /* The replacement. A file being played is open on Windows and cannot
        be renamed over, which is the one failure worth naming precisely,
        "permission denied" sends people to look at their disk. */
        if let Err(err) = std::fs::rename(&temp, file) {
            let _ = std::fs::remove_file(&temp);
            return Err(if err.kind() == std::io::ErrorKind::PermissionDenied {
                "the file is in use, stop playing it and try again".to_owned()
            } else {
                err.to_string()
            });
        }

        // The cached inspection describes the file as it was a moment ago.
        if let Ok(mut cache) = self.probed.lock() {
            cache.remove(path);
        }
        Ok(())
    }

    /// The sleeve for a track, as a JPEG.
    ///
    /// Two places to look, and the order matters. Inside the file first,
    /// because that picture is about the *track*, on a compilation every
    /// track has its own, and the folder has one that belongs to none of them.
    /// Beside the file second, which is where every ripper and every download
    /// puts it when the tagger did not embed one.
    ///
    /// No `-ss` here, unlike a film's thumbnail. An embedded sleeve is one
    /// frame at the start of a stream that has no other frames, and seeking
    /// 12% into it lands past the end and returns nothing at all.
    ///
    /// Scaled on the way out, and that is not a nicety: sleeves are routinely
    /// stored at three thousand pixels square, and a wall of eighty album
    /// tiles at that size is several hundred megabytes of decoded bitmap held
    /// by the webview to draw squares two hundred pixels wide.
    pub async fn artwork(&self, path: &str, width: u32) -> Result<Vec<u8>, String> {
        if let Ok(embedded) = self.picture_from(path, width).await {
            return Ok(embedded);
        }

        let beside = crate::music::sleeve_beside(std::path::Path::new(path))
            .ok_or_else(|| format!("no artwork for {path}"))?;
        self.picture_from(&beside.to_string_lossy(), width).await
    }

    /// The first picture in a file, scaled. Used for both halves of `artwork`.
    async fn picture_from(&self, path: &str, width: u32) -> Result<Vec<u8>, String> {
        let output = ffmpeg_command(&self.ffmpeg)
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                path,
                "-map",
                "0:v:0",
                "-frames:v",
                "1",
                "-an",
                "-vf",
                &format!("scale={}:-2", width.clamp(16, 1920)),
                "-f",
                "image2",
                "-c:v",
                "mjpeg",
                "-q:v",
                "4",
                "pipe:1",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .await
            .map_err(|err| err.to_string())?;

        if output.stdout.is_empty() {
            return Err(format!("no picture in {path}"));
        }
        Ok(output.stdout)
    }

    /// One frame, as a JPEG, for a thumbnail.
    ///
    /// `-ss` before `-i` again, and for the same reason it matters when
    /// playing: FFmpeg jumps to the nearest keyframe rather than decoding up to
    /// the timestamp, so a frame from the middle of a four gigabyte film costs
    /// what a frame from the start of it does.
    pub async fn frame(&self, path: &str, at: Option<f64>, width: u32) -> Result<Vec<u8>, String> {
        // No timestamp asks for a frame that represents the file, which is not
        // the first one: films open on black, on a logo, or on a fade.
        let seconds = match at {
            Some(value) => value.max(0.0),
            None => self.duration(path).await.unwrap_or(0.0) * POSTER_FRACTION,
        };

        let mut args: Vec<String> = vec!["-hide_banner".into(), "-loglevel".into(), "error".into()];
        if seconds > 0.0 {
            args.push("-ss".into());
            args.push(format!("{seconds:.3}"));
        }
        args.extend([
            "-i".into(),
            path.to_owned(),
            "-map".into(),
            "0:v:0".into(),
            "-frames:v".into(),
            "1".into(),
            "-an".into(),
            // Height follows the width so the thumbnail keeps the source's
            // shape; `-2` rounds to something the encoder will accept.
            "-vf".into(),
            format!("scale={}:-2", width.clamp(16, 1920)),
            "-f".into(),
            "image2".into(),
            "-c:v".into(),
            "mjpeg".into(),
            "-q:v".into(),
            "6".into(),
            "pipe:1".into(),
        ]);

        let output = ffmpeg_command(&self.ffmpeg)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .await
            .map_err(|err| err.to_string())?;

        if output.stdout.is_empty() {
            return Err(format!("no frame at {seconds:.3}s in {path}"));
        }
        Ok(output.stdout)
    }

    /// Bind the loopback socket and start answering on it.
    pub async fn start(dir: PathBuf) -> Result<Arc<Self>, String> {
        let mut media = Self::prepare(dir).await?;

        // Port zero: the operating system picks a free one, which is the only
        // way not to collide with whatever else the user is running.
        let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
            .await
            .map_err(|err| format!("could not open a local socket: {err}"))?;
        media.port = listener.local_addr().map_err(|err| err.to_string())?.port();

        let media = Arc::new(media);
        let serving = media.clone();

        tauri::async_runtime::spawn(async move {
            loop {
                let Ok((connection, _)) = listener.accept().await else {
                    continue;
                };
                let media = serving.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = http1::Builder::new()
                        .serve_connection(
                            TokioIo::new(connection),
                            service_fn(move |request| handle(request, media.clone())),
                        )
                        .await;
                });
            }
        });

        Ok(media)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Shaped exactly as ffprobe reports it, including the two subtitle kinds
    /// that have to be told apart: text, which converts, and a Blu-ray bitmap,
    /// which does not.
    fn probe() -> serde_json::Value {
        serde_json::json!({
            "streams": [
                { "index": 0, "codec_type": "video", "codec_name": "h264" },
                { "index": 1, "codec_type": "audio", "codec_name": "ac3" },
                { "index": 2, "codec_type": "subtitle", "codec_name": "subrip" },
                { "index": 3, "codec_type": "subtitle", "codec_name": "hdmv_pgs_subtitle" },
                { "index": 4, "codec_type": "subtitle", "codec_name": "ass" },
                { "index": 5, "codec_type": "subtitle", "codec_name": "dvd_subtitle" },
                { "index": 6, "codec_type": "attachment", "codec_name": "ttf" },
                { "index": 7, "codec_type": "attachment", "codec_name": "mjpeg" },
            ]
        })
    }

    /// An album track: no video, cover art ffprobe files under `video`, and
    /// tags where a film would have none.
    fn album_track() -> serde_json::Value {
        serde_json::json!({
            "streams": [
                { "index": 0, "codec_type": "audio", "codec_name": "mp3" },
                {
                    "index": 1,
                    "codec_type": "video",
                    "codec_name": "mjpeg",
                    "disposition": { "attached_pic": 1 }
                },
            ]
        })
    }

    fn plan_for(copy_audio: bool, lossless: bool) -> StreamRequest {
        StreamRequest {
            path: "album.flac".into(),
            start: 0.0,
            audio: None,
            copy_video: false,
            copy_audio,
            lossless,
        }
    }

    /// The bug: a record sleeve read as the file's video track. It cannot be
    /// copied, no browser takes mjpeg in an MP4 fragment, so the file was
    /// reported as needing its "video" converted, and the page then declared a
    /// video codec to Media Source for a stream that carries none.
    #[test]
    fn cover_art_is_not_a_video_track() {
        assert_eq!(Media::decisions(&album_track()), (true, true));
    }

    /// The same selector, in the arguments FFmpeg actually receives. Capital
    /// `V` is what excludes the sleeve; `?` is what lets a file with no
    /// picture through the muxer at all.
    #[test]
    fn an_album_track_asks_for_no_picture() {
        let args = Media::for_tests().stream_args(&plan_for(true, false));
        assert!(args.contains(&"0:V:0?".to_owned()));
        assert!(!args.iter().any(|arg| arg == "0:v:0"));
    }

    /// Lossless in, lossless out. Re-encoding an ALAC rip to 192k AAC throws
    /// away the reason somebody kept it as ALAC.
    #[test]
    fn lossless_audio_is_not_converted_to_aac() {
        let args = Media::for_tests().stream_args(&plan_for(false, true));
        assert!(args.contains(&"flac".to_owned()));
        assert!(!args.iter().any(|arg| arg == "aac"));
    }

    /// And the other way: AC-3 was lossy before Cadence saw it, so AAC costs
    /// nothing that was still there to lose, and costs far less to store.
    #[test]
    fn lossy_audio_still_converts_to_aac() {
        let args = Media::for_tests().stream_args(&plan_for(false, false));
        assert!(args.contains(&"aac".to_owned()));
        assert!(!args.iter().any(|arg| arg == "flac"));
    }

    /// The map the page declares its buffer from. A film can carry both kinds
    /// at once, and picking the wrong one is a buffer that refuses to open.
    #[test]
    fn each_audio_track_says_what_it_would_convert_to() {
        let mixed = serde_json::json!({
            "streams": [
                { "index": 0, "codec_type": "video", "codec_name": "h264" },
                { "index": 1, "codec_type": "audio", "codec_name": "truehd" },
                { "index": 2, "codec_type": "audio", "codec_name": "ac3" },
                { "index": 3, "codec_type": "subtitle", "codec_name": "subrip" },
            ]
        });
        let fallbacks = Media::audio_fallbacks(&mixed);
        assert_eq!(fallbacks.get("1").and_then(|v| v.as_str()), Some("flac"));
        assert_eq!(fallbacks.get("2").and_then(|v| v.as_str()), Some("aac"));
        // Only audio is answered for. Nothing else is ever converted to sound.
        assert_eq!(fallbacks.len(), 2);
    }

    #[test]
    fn a_lossless_codec_is_recognised_by_name_or_by_prefix() {
        assert!(is_lossless("alac"));
        assert!(is_lossless("flac"));
        assert!(is_lossless("pcm_s24le"));
        assert!(!is_lossless("aac"));
        assert!(!is_lossless("mp3"));
    }

    #[test]
    fn the_text_tracks_are_found() {
        assert_eq!(Media::subtitles_in(&probe(), TEXT_SUBTITLES), vec![2]);
    }

    /// ASS is text and is deliberately not among the text ones. Converting it
    /// to WebVTT keeps the sentences and loses everything else the format is
    /// for, so it goes to libass instead and has to be told apart to get there.
    #[test]
    fn a_script_is_not_treated_as_plain_words() {
        assert_eq!(Media::subtitles_in(&probe(), SCRIPT_SUBTITLES), vec![4]);
        assert!(!Media::subtitles_in(&probe(), TEXT_SUBTITLES).contains(&4));
    }

    #[test]
    fn the_fonts_a_script_may_want_are_found() {
        assert_eq!(Media::fonts_in(&probe()), vec![6]);
    }

    /// The Blu-ray track is its own kind, and must not appear among the text
    /// ones: the two are fetched by different routes and painted differently.
    #[test]
    fn the_picture_tracks_are_found_and_kept_apart() {
        assert_eq!(Media::subtitles_in(&probe(), PICTURE_SUBTITLES), vec![3]);
    }

    /// The DVD track is in neither list, which is what leaves it listed and
    /// unchoosable. Being a picture is not on its own enough to be shown: it
    /// has to be a picture in a format something here can read.
    #[test]
    fn a_format_with_no_reader_is_offered_by_neither_name() {
        let text = Media::subtitles_in(&probe(), TEXT_SUBTITLES);
        let pictures = Media::subtitles_in(&probe(), PICTURE_SUBTITLES);
        assert!(!text.contains(&5));
        assert!(!pictures.contains(&5));
    }

    #[test]
    fn a_file_without_subtitles_offers_none() {
        let bare = serde_json::json!({
            "streams": [{ "index": 0, "codec_type": "video", "codec_name": "h264" }]
        });
        assert!(Media::subtitles_in(&bare, TEXT_SUBTITLES).is_empty());
        assert!(Media::subtitles_in(&bare, PICTURE_SUBTITLES).is_empty());
    }

    /// An unreadable probe must answer "none" rather than panic: it is reached
    /// on every file, including the damaged ones.
    #[test]
    fn nothing_readable_offers_none() {
        let nothing = serde_json::json!({});
        assert!(Media::subtitles_in(&nothing, TEXT_SUBTITLES).is_empty());
        assert!(Media::subtitles_in(&nothing, PICTURE_SUBTITLES).is_empty());
    }

    /// The bug this guards: `URLSearchParams` writes a space as `+`, and a
    /// path that keeps the plus names a file that does not exist. Nearly every
    /// film anyone owns has a space in its name or in a folder above it.
    #[test]
    fn a_space_survives_the_journey_from_the_page() {
        assert_eq!(
            super::form_decode(r"C:\Films\Episode+1.mkv").as_deref(),
            Some(r"C:\Films\Episode 1.mkv"),
        );
    }

    /// A plus that is really in the name is sent percent-encoded, and must not
    /// be turned into a space on the way back.
    #[test]
    fn a_real_plus_is_not_mistaken_for_a_space() {
        assert_eq!(
            super::form_decode("Disc%2B1.mkv").as_deref(),
            Some("Disc+1.mkv")
        );
        assert_eq!(
            super::form_decode("C%2B%2B+talk.mkv").as_deref(),
            Some("C++ talk.mkv")
        );
    }

    /// Non-ASCII names go through the same encoder and have to come back whole.
    #[test]
    fn an_arabic_filename_comes_back_intact() {
        let encoded = "%D9%81%D9%8A%D9%84%D9%85+%D8%B9%D8%B1%D8%A8%D9%8A.mkv";
        assert_eq!(
            super::form_decode(encoded).as_deref(),
            Some("فيلم عربي.mkv")
        );
    }

    /// The copy decisions and the subtitle list read the same stream array, and
    /// this is the pairing they are asked about together: a film whose audio
    /// must be converted and whose subtitles can be lifted out.
    #[test]
    fn decisions_are_unchanged_by_subtitle_streams() {
        let (copy_video, copy_audio) = Media::decisions(&probe());
        assert!(copy_video, "h264 is copyable");
        assert!(!copy_audio, "ac3 is not");
    }
}
