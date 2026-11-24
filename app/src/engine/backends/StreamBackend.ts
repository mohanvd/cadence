import { streamUrl } from '@/lib/desktop';
import { BaseBackend } from '../BaseBackend';
import { audioChain } from '../audioChain';
import { createVideoElement } from '../createVideoElement';
import { mseCodecString } from '../capabilities';
import { fallbackFor } from '../probe';
import type { BackendKind, MediaSourceInput, MediaTrack, ProbeResult } from '../types';

/**
 * Plays a file by asking the shell for it as fragmented MP4.
 *
 * FFmpeg does the demuxing in its own process and writes fragments to a socket;
 * this appends them to a Media Source and lets the browser decode. The picture
 * is still a `<video>` element, which is what keeps the screenshot, the ambient
 * glow, the equaliser and the filters working: every one of them reaches for
 * the element, and a native renderer would have taken it away.
 *
 * Two things are unlike an ordinary media element, and both follow from the
 * stream being produced on demand:
 *
 *   - It has no length. `duration` comes from the inspection done beforehand,
 *     not from the fragments, which describe only themselves.
 *   - A seek is a new stream. There is no byte to range over, so the shell
 *     restarts FFmpeg at a timestamp and the fragments that come back are
 *     shifted into place with `timestampOffset`.
 *
 * The second one is where most of the care below goes. Rebuilding the source
 * resets the element: it pauses, its speed goes back to the default, its clock
 * reads zero for a moment. None of that is anything the viewer did, so none of
 * it is allowed to reach the state. Whether the film should be playing is kept
 * here, as the viewer's intent, and the element is brought back into line with
 * it once the new stream is ready.
 */

/** Stop pulling fragments once this many seconds are buffered ahead. */
const BUFFER_TARGET_SECONDS = 30;
/** Start pulling again once the cushion is down to this share of the target. */
const BUFFER_RESUME_RATIO = 0.4;
/** The least the cushion is allowed to shrink to when memory runs short. */
const MIN_TARGET_SECONDS = 6;
/**
 * How long a seek out of the buffer waits for the next one before FFmpeg is
 * restarted. A drag along the timeline, or a key held down, is dozens of seeks
 * a second, and each of them used to start and kill a process.
 */
const SEEK_SETTLE_MS = 140;
/** A stream that stops this far short of the end has not finished. */
const EARLY_END_SECONDS = 2;
/** How many times a broken stream is picked up again before giving up. */
const MAX_STREAM_RETRIES = 4;
/** Playing this far past the last recovery earns the retries back. */
const RETRY_RESET_SECONDS = 60;

class AppendRejected extends Error {}

export class StreamBackend extends BaseBackend {
  readonly kind: BackendKind = 'stream';

  private video: HTMLVideoElement | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;
  private detachListeners: (() => void) | null = null;
  private readonly chain = audioChain;

  private path = '';
  private duration = 0;
  private audioStreamIndex: number | null = null;

  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private abort: AbortController | null = null;

  /**
   * Bumped whenever the stream being played stops being the one wanted. A pump
   * that was in flight checks this before appending, so fragments from the
   * stream the viewer just left cannot land in the buffer for the one they went
   * to.
   */
  private generation = 0;

  /** Whether the viewer wants this playing, whatever the element is doing. */
  private wantPlaying = false;
  /**
   * True from the moment a new stream is decided on until the element has been
   * pointed at it and told where to be. In between, the element's own events
   * describe the source being thrown away and are not passed on.
   */
  private rebuilding = false;
  private seekTimer: number | null = null;
  /** The speed asked for, put back after every rebuild. */
  private rate = 1;
  /** Whether anything has played: see `NativeBackend.presented`. */
  private presented = false;
  /** How far ahead to buffer; lowered when the browser runs out of room. */
  private targetAhead = BUFFER_TARGET_SECONDS;
  private retries = 0;
  /** Where the last recovery picked the stream up. */
  private lastRecoveryAt = 0;
  /** How far the last stream got before it stopped short. */
  private lastStopEnd = -1;

  private readonly probedTracks: readonly MediaTrack[];
  private readonly copyVideo: boolean;
  private readonly copyAudio: boolean;
  /** What a converted audio track arrives as, by stream index. */
  private readonly audioFallbacks: Record<string, string>;

  constructor(probe: ProbeResult) {
    super();
    this.probedTracks = probe.tracks;
    this.duration = probe.durationHint ?? 0;
    this.copyVideo = probe.copyVideo;
    this.copyAudio = probe.copyAudio;
    this.audioFallbacks = probe.audioFallbacks;
  }

  protected onAttach(container: HTMLElement): void {
    const video = createVideoElement();
    this.video = video;
    container.appendChild(video);
    this.bindEvents(video);
  }

  async load(source: MediaSourceInput, startAt = 0): Promise<void> {
    /* A link is an input like any other as far as FFmpeg is concerned, and it
       is the reason this accepts one: a video the browser will not open is
       still a video the shell can demux and hand back in fragments. A `File`
       has no name outside the page, so there is nothing to pass on. */
    if (source.kind === 'file') {
      this.fail('This source cannot be streamed.');
      return;
    }
    this.path = source.kind === 'path' ? source.path : source.url;
    this._tracks = [...this.probedTracks];

    const audio = this.probedTracks.find((track) => track.type === 'audio');
    this.audioStreamIndex = audio ? Number(audio.id) : null;

    await this.openAt(this.clamp(startAt));
  }

  private clamp(seconds: number): number {
    const value = Number.isFinite(seconds) ? seconds : 0;
    return Math.max(0, this.duration > 0 ? Math.min(value, this.duration) : value);
  }

  /** The state's idea of paused: the viewer's intent while a rebuild is on. */
  private syncPaused(): void {
    const video = this.video;
    if (!video) return;
    const paused = this.rebuilding ? !this.wantPlaying : video.paused;
    this.setState(paused ? { paused } : { paused, ended: false }, true);
  }

  /**
   * Start leaving the current stream.
   *
   * The element is paused so the film does not carry on, audibly, from the
   * place the viewer has just asked to leave. The state does not see that
   * pause: it is still showing whatever the viewer last asked for.
   */
  private beginRebuild(): void {
    this.generation += 1;
    if (!this.rebuilding) {
      this.rebuilding = true;
      this.video?.pause();
    }
    this.syncPaused();
  }

  private clearSeekTimer(): void {
    if (this.seekTimer !== null) {
      window.clearTimeout(this.seekTimer);
      this.seekTimer = null;
    }
  }

  /**
   * Point the element at a fresh stream beginning `seconds` in.
   *
   * The whole Media Source is rebuilt rather than the buffer reused. FFmpeg
   * emits a new initialisation segment for every run, and a SourceBuffer that
   * has already been given one will not take another describing different
   * parameters. Rebuilding costs a few milliseconds and cannot get this wrong.
   */
  private async openAt(seconds: number): Promise<void> {
    const video = this.video;
    if (!video || this.destroyed) return;

    this.clearSeekTimer();
    this.beginRebuild();
    const generation = this.generation;
    const stale = () => this.destroyed || generation !== this.generation;

    await this.teardownStream();
    if (stale()) return;

    this.setState({ loading: true, ended: false, currentTime: seconds, buffered: 0 }, true);

    const url = await streamUrl(this.path, {
      start: seconds,
      audio: this.audioStreamIndex ?? undefined,
      copyVideo: this.copyVideo,
      copyAudio: this.copyAudio,
    });
    if (stale()) return;
    if (!url) {
      this.fail('Playback support is missing from this installation.');
      return;
    }

    const mediaSource = new MediaSource();
    this.mediaSource = mediaSource;
    this.objectUrl = URL.createObjectURL(mediaSource);
    video.src = this.objectUrl;
    /* A new source puts the speed back to the default; the default is ours,
       but say it again in case anything else touched it. */
    this.applyRate();
    /* Idempotent, and this runs again on every seek that rebuilds the source:
       the element is the same one, so the routing is not rebuilt with it. */
    this.chain.attach(video, true);

    mediaSource.addEventListener(
      'sourceopen',
      () => {
        if (stale()) return;
        // Known from inspection, and the only place it can come from: the
        // fragments carry no total.
        if (this.duration > 0) {
          try {
            mediaSource.duration = this.duration;
          } catch {
            /* Refused only mid-update, which it cannot be yet. */
          }
        }
        /* The playhead is moved here rather than by whoever asked for the
           seek. Before the duration is set the element believes the media is
           zero seconds long and clamps anything asked of it back to the
           start. */
        if (seconds > 0) video.currentTime = seconds;

        this.rebuilding = false;
        if (this.wantPlaying) this.startElement();
        this.syncPaused();

        void this.pump(url, seconds, generation);
      },
      { once: true },
    );
  }

  /** Ask the element to play, and own up if it will not. */
  private startElement(): void {
    const video = this.video;
    if (!video) return;
    const generation = this.generation;
    video.play().catch((err: unknown) => {
      if (this.destroyed || generation !== this.generation) return;
      // Interrupted by a pause or a new stream, both of which speak for
      // themselves.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      this.wantPlaying = false;
      this.syncPaused();
    });
  }

  /**
   * Read the stream and append it, pausing whenever playback is far enough
   * ahead. A film is tens of gigabytes and the buffer is memory.
   */
  private async pump(url: string, offset: number, generation: number): Promise<void> {
    const mediaSource = this.mediaSource;
    if (!mediaSource || !this.video) return;
    const stale = () => this.destroyed || generation !== this.generation;

    const abort = new AbortController();
    this.abort = abort;

    try {
      let response: Response;
      try {
        response = await fetch(url, { signal: abort.signal });
      } catch (err) {
        if (abort.signal.aborted || stale()) return;
        this.fail('Could not reach the playback pipeline.', true, err);
        return;
      }

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => '');
        if (stale()) return;
        this.fail(detail || 'The file could not be opened.');
        return;
      }

      const reader = response.body.getReader();
      this.reader = reader;

      try {
        for (;;) {
          if (stale()) return;

          await this.waitForRoom(generation);
          if (stale()) return;

          const { done, value } = await reader.read();
          if (done) break;
          if (!value?.byteLength) continue;
          if (stale()) return;

          const buffer = this.sourceBuffer ?? this.openBuffer(offset);
          if (!buffer || stale()) return;

          await this.appendWithRoom(buffer, value, generation);
        }
      } catch (err) {
        if (abort.signal.aborted || stale()) return;
        /* A fragment the decoder would not take puts the element itself in
           error, and its own report is the one that knows whether this was
           a codec or a bad patch of file. */
        if (err instanceof AppendRejected) return;
        void this.streamStopped(generation, err);
        return;
      }

      if (stale()) return;
      void this.streamStopped(generation, null);
    } finally {
      /* Superseded mid-read: let go of the connection, which is what tells the
         shell to stop the FFmpeg behind it. */
      if (stale()) abort.abort();
    }
  }

  /** The end of what is buffered, wherever the playhead is. */
  private bufferedEnd(): number {
    const ranges = this.sourceBuffer?.buffered ?? this.video?.buffered;
    if (!ranges || ranges.length === 0) return 0;
    return ranges.end(ranges.length - 1);
  }

  /**
   * The stream has stopped, on its own or with an error.
   *
   * At the end of the file that is the end, and the Media Source is told so.
   * Short of it, FFmpeg died or the connection dropped, and declaring the end
   * there is what cut films off part-way through: the element took the
   * shortened stream at its word and played its last frame. Instead the
   * viewer is left to play what did arrive, and the stream is picked up again
   * from where it stopped once they reach it.
   */
  private async streamStopped(generation: number, cause: unknown): Promise<void> {
    const video = this.video;
    const mediaSource = this.mediaSource;
    if (!video || !mediaSource) return;
    const stale = () => this.destroyed || generation !== this.generation;

    const end = this.bufferedEnd();
    const short = this.duration > 0 && end < this.duration - EARLY_END_SECONDS;

    if (!short && cause === null) {
      this.endStream(mediaSource);
      return;
    }

    /* Little or nothing new arrived since the last time it stopped: what is
       past this point cannot be read, and saying so beats trying forever. A
       stream that ended cleanly is taken as finished, which is also what a
       file a little shorter than its header claims looks like; one that
       failed is a failure. */
    const gained = this.lastStopEnd < 0 ? Infinity : end - this.lastStopEnd;
    if (gained < (cause === null ? 4 : 0.5) || this.retries >= MAX_STREAM_RETRIES) {
      if (cause === null) {
        this.endStream(mediaSource);
        return;
      }
      this.fail('The stream stopped unexpectedly.', true, cause);
      return;
    }
    this.lastStopEnd = end;

    // Play out what arrived, then carry on from the end of it.
    while (!stale() && video.currentTime < end - 0.5) {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    if (stale()) return;
    this.recoverAt(video.currentTime);
  }

  private endStream(mediaSource: MediaSource): void {
    if (mediaSource.readyState !== 'open') return;
    if (this.sourceBuffer?.updating) return;
    try {
      mediaSource.endOfStream();
    } catch {
      /* Already ended. */
    }
  }

  /** Pick the stream up again at `seconds`, within the retry allowance. */
  private recoverAt(seconds: number): void {
    this.retries += 1;
    this.lastRecoveryAt = seconds;
    void this.openAt(this.clamp(seconds));
  }

  /**
   * Declare what is in the stream, before any of it is appended.
   *
   * The codec string has to be right: Media Source checks it against the
   * initialisation segment and rejects the lot on a mismatch. It comes from the
   * inspection rather than a guess, and from what FFmpeg was told to produce
   * for any track being converted on the way.
   */
  private openBuffer(offset: number): SourceBuffer | null {
    const mediaSource = this.mediaSource;
    if (!mediaSource || mediaSource.readyState !== 'open') return null;

    /* Read here rather than once in the constructor: this runs again on every
       seek and on every change of audio track, and the track is what decides
       the answer. A lossless mix converts to FLAC and the commentary beside it
       to AAC, and declaring one over the other is a buffer that never opens. */
    const chosenAudio =
      this.audioStreamIndex !== null && this.audioStreamIndex !== undefined
        ? String(this.audioStreamIndex)
        : this.probedTracks.find((track) => track.type === 'audio')?.id;

    const mime = mseCodecString(this.probedTracks, {
      copyVideo: this.copyVideo,
      copyAudio: this.copyAudio,
      audioFallback: fallbackFor(this.audioFallbacks, chosenAudio),
    });
    if (!MediaSource.isTypeSupported(mime)) {
      this.fail(`The browser will not accept ${mime}.`, true, undefined, true);
      return null;
    }

    let buffer: SourceBuffer;
    try {
      buffer = mediaSource.addSourceBuffer(mime);
    } catch (err) {
      this.fail('The browser refused this stream.', true, err, true);
      return null;
    }

    buffer.mode = 'segments';
    // FFmpeg rebases a seeked stream to zero, so the fragments arrive believing
    // they are the start of the film. This puts them back where they belong.
    if (offset > 0) buffer.timestampOffset = offset;

    this.sourceBuffer = buffer;
    return buffer;
  }

  private append(buffer: SourceBuffer, chunk: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      const settle = (fn: () => void) => {
        buffer.removeEventListener('updateend', done);
        buffer.removeEventListener('error', failed);
        fn();
      };
      // `updateend` also follows an abort, which is what a detached buffer gets.
      const done = () => settle(resolve);
      const failed = () =>
        settle(() => reject(new AppendRejected('the browser rejected a fragment')));

      buffer.addEventListener('updateend', done);
      buffer.addEventListener('error', failed);

      try {
        buffer.appendBuffer(chunk as unknown as BufferSource);
      } catch (err) {
        settle(() => reject(err));
      }
    });
  }

  /**
   * Append, waiting for room when the browser's buffer is full.
   *
   * A high-bitrate file fills the browser's allowance well before the thirty
   * seconds this asks for, and the append that does not fit throws. That used
   * to stop the film with an error, and worse, the error was then read as the
   * codec's fault. The browser has already freed what it safely could behind
   * the playhead by the time it throws, so what is left is to shorten the
   * cushion to what fits and let playback use some of it up.
   */
  private async appendWithRoom(
    buffer: SourceBuffer,
    chunk: Uint8Array,
    generation: number,
  ): Promise<void> {
    const video = this.video;
    if (!video) return;
    const stale = () => this.destroyed || generation !== this.generation;

    for (let stuck = 0; ; ) {
      if (stale()) return;
      try {
        await this.append(buffer, chunk);
        return;
      } catch (err) {
        const full = err instanceof DOMException && err.name === 'QuotaExceededError';
        if (!full || stale()) throw err;

        const ahead = Math.max(0, this.bufferedEnd() - video.currentTime);
        this.targetAhead = Math.max(MIN_TARGET_SECONDS, Math.min(this.targetAhead, ahead - 2));

        // Paused, it waits as long as it takes; playing, a few seconds at a time.
        const from = video.currentTime;
        const since = performance.now();
        while (
          !stale() &&
          video.currentTime - from < 1 &&
          (video.paused || performance.now() - since < 3000)
        ) {
          await new Promise((resolve) => window.setTimeout(resolve, 200));
        }

        if (video.currentTime - from >= 1) stuck = 0;
        else if (!video.paused && (stuck += 1) > 20) throw err;
      }
    }
  }

  /** Resolve once playback has drawn the cushion down far enough to want more. */
  private waitForRoom(generation: number): Promise<void> {
    const video = this.video;
    const buffer = this.sourceBuffer;
    if (!video || !buffer) return Promise.resolve();

    const ahead = () => {
      const ranges = buffer.buffered;
      if (ranges.length === 0) return 0;
      return ranges.end(ranges.length - 1) - video.currentTime;
    };

    if (ahead() < this.targetAhead) return Promise.resolve();

    return new Promise((resolve) => {
      const timer = window.setInterval(() => {
        const stale = this.destroyed || generation !== this.generation;
        if (stale || ahead() < this.targetAhead * BUFFER_RESUME_RATIO) {
          window.clearInterval(timer);
          resolve();
        }
      }, 250);
    });
  }

  /**
   * Let go of the stream being played.
   *
   * Deliberately without `endOfStream()`. Ending the old Media Source told the
   * element the film was exactly as long as what had been buffered, and if the
   * playhead was near the end of it the element announced the film over, which
   * the queue took as its cue to move on to the next one.
   */
  private async teardownStream(): Promise<void> {
    this.abort?.abort();
    this.abort = null;

    const reader = this.reader;
    this.reader = null;
    try {
      await reader?.cancel();
    } catch {
      /* Already closed. */
    }

    this.sourceBuffer = null;
    this.mediaSource = null;

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private bindEvents(video: HTMLVideoElement): void {
    const onLoadedMetadata = () => {
      if (this.rebuilding) return;
      const duration = this.duration || video.duration || 0;
      this.setState({ duration, loading: false }, true);
      this.emit('loadedmetadata', { duration, tracks: this._tracks });
    };
    const onTimeUpdate = () => {
      if (this.rebuilding) return;
      const currentTime = video.currentTime;
      if (this.retries > 0 && currentTime > this.lastRecoveryAt + RETRY_RESET_SECONDS) {
        this.retries = 0;
        this.lastStopEnd = -1;
      }
      this.setState({ currentTime });
      this.emit('timeupdate', { currentTime });
    };
    const onProgress = () => {
      if (this.rebuilding || video.buffered.length === 0) return;
      // The range covering the playhead, not simply the last one: after a seek
      // backwards the final range can be far ahead of playback.
      let end = 0;
      for (let i = 0; i < video.buffered.length; i += 1) {
        const start = video.buffered.start(i);
        const rangeEnd = video.buffered.end(i);
        if (start <= video.currentTime + 0.5 && rangeEnd > end) end = rangeEnd;
      }
      this.setState({ buffered: end });
    };
    /* The element's own play and pause carry the viewer's intent only when
       nothing is being rebuilt, and are read off the element as it is now
       rather than as the event says: a pause queued by the rebuild can arrive
       after the new stream has already been told to play. */
    const onPlayOrPause = () => {
      if (!this.rebuilding) this.wantPlaying = !video.paused;
      this.syncPaused();
    };
    const onWaiting = () => {
      if (!this.rebuilding) this.setState({ loading: true });
    };
    const onPlaying = () => {
      if (this.rebuilding) return;
      this.presented = true;
      this.setState({ loading: false, seeking: false, paused: video.paused }, true);
    };
    const onSeeked = () => {
      if (this.rebuilding) return;
      this.setState({ seeking: false, currentTime: video.currentTime }, true);
    };
    const onCanPlay = () => {
      if (this.rebuilding || video.seeking) return;
      this.setState({ loading: false, seeking: false });
    };
    const onEnded = () => {
      if (this.rebuilding) return;
      this.wantPlaying = false;
      this.setState({ ended: true, paused: true }, true);
      this.emit('ended', undefined);
    };
    const onError = () => {
      /* The element in error over a source already thrown away is not news,
         and setting the next source clears it. */
      if (this.rebuilding || !video.error) return;
      const refused =
        video.error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ||
        video.error.code === MediaError.MEDIA_ERR_DECODE;

      /* Before anything has played, the browser is refusing what it was given,
         and the engine above is the one to try another way. After, it is a bad
         patch of file, and the thing to do is step over it. */
      if (refused && !this.presented) {
        this.fail(video.error.message || 'Playback failed.', true, video.error, true);
        return;
      }
      if (this.retries < MAX_STREAM_RETRIES) {
        this.recoverAt(video.currentTime + 1);
        return;
      }
      this.fail(video.error.message || 'Playback failed.', true, video.error);
    };
    const onRateChange = () => {
      if (Math.abs(video.playbackRate - this.rate) > 1e-3) this.applyRate();
    };
    const onVolumeChange = () =>
      this.setState({ volume: video.volume, muted: video.muted });

    const pairs: [string, EventListener][] = [
      ['loadedmetadata', onLoadedMetadata],
      ['timeupdate', onTimeUpdate],
      ['progress', onProgress],
      ['play', onPlayOrPause],
      ['pause', onPlayOrPause],
      ['emptied', onPlayOrPause],
      ['waiting', onWaiting],
      ['playing', onPlaying],
      ['seeked', onSeeked],
      ['canplay', onCanPlay],
      ['ended', onEnded],
      ['error', onError],
      ['ratechange', onRateChange],
      ['volumechange', onVolumeChange],
    ];
    for (const [name, handler] of pairs) video.addEventListener(name, handler);

    this.detachListeners = () => {
      for (const [name, handler] of pairs) video.removeEventListener(name, handler);
    };
  }

  async play(): Promise<void> {
    const video = this.video;
    if (!video) return;
    this.wantPlaying = true;

    /* Played again from the end. The element would rewind to the start by
       itself, but only what was streamed last is in its buffer, and the start
       of the film is not, so it sat there waiting for data nobody was going to
       send. */
    if (!this.rebuilding && this._state.ended) {
      void this.openAt(0);
      return;
    }

    // Mid-rebuild, intent is all there is to record: the new stream will play.
    if (this.rebuilding) {
      this.syncPaused();
      return;
    }
    this.startElement();
    this.syncPaused();
  }

  pause(): void {
    this.wantPlaying = false;
    this.video?.pause();
    this.syncPaused();
  }

  /**
   * Seek, going back to FFmpeg only when the target is somewhere the buffer
   * does not already cover. Scrubbing within the cushion is the element's own
   * seek, and costs nothing.
   */
  seek(seconds: number): void {
    const video = this.video;
    if (!video || !Number.isFinite(seconds)) return;

    const target = this.clamp(seconds);

    /* Only the stream being played can be seeked inside. Mid-rebuild, what the
       element holds is the stream being left, and landing in it put the film
       at a place the viewer had already moved on from. */
    if (!this.rebuilding) {
      const ranges = video.buffered;
      for (let i = 0; i < ranges.length; i += 1) {
        if (target >= ranges.start(i) && target <= ranges.end(i)) {
          video.currentTime = target;
          this.setState({ currentTime: target, seeking: true, ended: false }, true);
          return;
        }
      }
    }

    // The fragments are offset back onto the real timeline, so the element ends
    // up at the timestamp the viewer asked for rather than at zero.
    this.setState({ seeking: true, currentTime: target, ended: false }, true);
    this.beginRebuild();
    this.clearSeekTimer();
    this.seekTimer = window.setTimeout(() => {
      this.seekTimer = null;
      void this.openAt(target);
    }, SEEK_SETTLE_MS);
  }

  /** @param gain up to 1 the element can carry; past that the chain does. */
  setVolume(gain: number): void {
    if (this.video) this.video.volume = Math.max(0, Math.min(1, gain));
    this.chain.setBoost(gain);
  }

  setMuted(muted: boolean): void {
    if (this.video) this.video.muted = muted;
    this.setState({ muted });
  }

  setRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) return;
    this.rate = rate;
    this.applyRate();
  }

  /** Both rates: see `NativeBackend.applyRate`. Matters most here, where every
      seek out of the buffer is a new source. */
  private applyRate(): void {
    const video = this.video;
    if (!video) return;
    video.defaultPlaybackRate = this.rate;
    video.playbackRate = this.rate;
    this.setState({ rate: this.rate });
  }

  /**
   * Switch audio track by restarting the stream with a different one mapped.
   *
   * The alternative is muxing every audio track into the fragments and letting
   * the browser choose, which means carrying five languages of audio across the
   * socket in order to play one.
   */
  selectTrack(type: 'audio' | 'subtitle', id: string | null): void {
    if (type !== 'audio' || id === null) return;

    const index = Number(id);
    if (!Number.isFinite(index) || index === this.audioStreamIndex) return;

    this.audioStreamIndex = index;
    // The state's clock, not the element's: mid-rebuild the element's is zero.
    void this.openAt(this._state.currentTime);
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  getRenderSurface(): HTMLVideoElement | HTMLCanvasElement | null {
    return this.video;
  }

  protected onDestroy(): void {
    // Invalidates every pump still in flight before anything is torn down.
    this.generation += 1;
    this.clearSeekTimer();
    void this.teardownStream();
    this.chain.release(this.video);
    this.detachListeners?.();
    this.detachListeners = null;
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video.remove();
      this.video = null;
    }
  }
}
