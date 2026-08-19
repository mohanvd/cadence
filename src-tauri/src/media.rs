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

/// Audio a browser will play from an MP4 fragment. Everything else, chiefly
/// AC-3 and DTS, is re-encoded, which costs almost nothing beside video.
pub const COPYABLE_AUDIO: &[&str] = &["aac", "mp3"];

/// Subtitle codecs that are text, and can therefore be lifted out as WebVTT.
///
/// The fragments carry no subtitles at all, so a track inside the container
/// reaches the viewer only by being extracted separately. That works for these
/// because they are words: converting them is a re-encoding of the same
/// sentences into different punctuation.
///
/// What is missing from this list is the bitmap formats — PGS on a Blu-ray rip,
/// VobSub on a DVD one. Those are pictures of words. Turning them back into
/// words is OCR, which is a different program and a different order of
/// difficulty, so they are reported and marked unusable rather than offered and
/// found empty.
pub const TEXT_SUBTITLES: &[&str] = &["subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "text"];

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
        })
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
        args.push("0:v:0".into());
        args.push("-map".into());
        match req.audio {
            Some(index) => args.push(format!("0:{index}")),
            // `?` makes it optional: a film with no audio track should play, not
            // fail at the muxer.
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
/// arrives then names a file nobody has — which broke every video with a space
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
    if route != "/stream" && route != "/frame" {
        return Ok(text(StatusCode::NOT_FOUND, "Cadence serves two routes."));
    }

    let params = query(request.uri());

    /* Checked before the path is even read. The port is reachable by anything
    running as this user, and on the other side of it are the user's own
    files, so an unauthenticated request never gets as far as naming one. */
    if params.get("token").map(String::as_str) != Some(media.token.as_str()) {
        return Ok(text(StatusCode::FORBIDDEN, "Not for you."));
    }

    let Some(path) = params.get("path").cloned() else {
        return Ok(text(StatusCode::BAD_REQUEST, "No path."));
    };

    let start = params
        .get("t")
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(0.0);

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

        let codec_of = |kind: &str| -> Option<&str> {
            streams
                .iter()
                .find(|stream| stream.get("codec_type").and_then(|v| v.as_str()) == Some(kind))
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

    /// Which subtitle streams can be lifted out of the container as text.
    ///
    /// By stream index, because that is what selecting one has to pass back.
    fn text_subtitles(probe: &serde_json::Value) -> Vec<u64> {
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
                                .is_some_and(|name| TEXT_SUBTITLES.contains(&name))
                    })
                    .filter_map(|stream| stream.get("index").and_then(|v| v.as_u64()))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// A file's streams, with what Cadence intends to do about them attached.
    pub async fn describe(&self, path: &str) -> Result<serde_json::Value, String> {
        let mut probe = self.probe(path).await?;
        let (copy_video, copy_audio) = Self::decisions(&probe);
        let subtitles = Self::text_subtitles(&probe);

        if let Some(fields) = probe.as_object_mut() {
            fields.insert(
                "cadence".to_owned(),
                serde_json::json!({
                    "copyVideo": copy_video,
                    "copyAudio": copy_audio,
                    "subtitles": subtitles,
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

        Ok(StreamRequest {
            path,
            start,
            audio,
            copy_video: copy_video && allow_copy_video,
            copy_audio: copy_audio && allow_copy_audio,
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
            ]
        })
    }

    #[test]
    fn text_subtitles_are_offered_and_bitmaps_are_not() {
        assert_eq!(Media::text_subtitles(&probe()), vec![2, 4]);
    }

    #[test]
    fn a_file_without_subtitles_offers_none() {
        let bare = serde_json::json!({
            "streams": [{ "index": 0, "codec_type": "video", "codec_name": "h264" }]
        });
        assert!(Media::text_subtitles(&bare).is_empty());
    }

    /// An unreadable probe must answer "none" rather than panic: it is reached
    /// on every file, including the damaged ones.
    #[test]
    fn nothing_readable_offers_none() {
        assert!(Media::text_subtitles(&serde_json::json!({})).is_empty());
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
        assert_eq!(super::form_decode("Disc%2B1.mkv").as_deref(), Some("Disc+1.mkv"));
        assert_eq!(super::form_decode("C%2B%2B+talk.mkv").as_deref(), Some("C++ talk.mkv"));
    }

    /// Non-ASCII names go through the same encoder and have to come back whole.
    #[test]
    fn an_arabic_filename_comes_back_intact() {
        let encoded = "%D9%81%D9%8A%D9%84%D9%85+%D8%B9%D8%B1%D8%A8%D9%8A.mkv";
        assert_eq!(super::form_decode(encoded).as_deref(), Some("فيلم عربي.mkv"));
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
