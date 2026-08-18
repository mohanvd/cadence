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

/// Audio a browser will play from an MP4 fragment. Everything else, chiefly
/// AC-3 and DTS, is re-encoded, which costs almost nothing beside video.
pub const COPYABLE_AUDIO: &[&str] = &["aac", "mp3"];

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
async fn pick_encoder(ffmpeg: &PathBuf) -> String {
    let listing = ffmpeg_command(ffmpeg)
        .args(["-hide_banner", "-encoders"])
        .output()
        .await
        .ok()
        .map(|out| String::from_utf8_lossy(&out.stdout).into_owned())
        .unwrap_or_default();

    VIDEO_ENCODERS
        .iter()
        .find(|name| listing.contains(*name))
        .map(|name| (*name).to_string())
        // Being listed is not the same as working, but a build with no H.264
        // encoder at all is not one this project ships.
        .unwrap_or_else(|| "libopenh264".to_string())
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

fn query(uri: &hyper::Uri) -> HashMap<String, String> {
    uri.query()
        .unwrap_or_default()
        .split('&')
        .filter(|pair| !pair.is_empty())
        .filter_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            let value = percent_decode_str(value).decode_utf8().ok()?.into_owned();
            Some((key.to_owned(), value))
        })
        .collect()
}

async fn handle(
    request: Request<hyper::body::Incoming>,
    media: Arc<Media>,
) -> Result<Response<StreamBody>, Infallible> {
    if request.uri().path() != "/stream" {
        return Ok(text(StatusCode::NOT_FOUND, "Cadence serves one route."));
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
    let audio = params
        .get("audio")
        .and_then(|value| value.parse::<u32>().ok());

    let plan = match media.plan(path, start, audio).await {
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

    /// A file's streams, with what Cadence intends to do about them attached.
    pub async fn describe(&self, path: &str) -> Result<serde_json::Value, String> {
        let mut probe = self.probe(path).await?;
        let (copy_video, copy_audio) = Self::decisions(&probe);

        if let Some(fields) = probe.as_object_mut() {
            fields.insert(
                "cadence".to_owned(),
                serde_json::json!({ "copyVideo": copy_video, "copyAudio": copy_audio }),
            );
        }

        Ok(probe)
    }

    /// Decide what has to happen to a file before the page can play it.
    async fn plan(
        &self,
        path: String,
        start: f64,
        audio: Option<u32>,
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
            copy_video,
            copy_audio,
        })
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
