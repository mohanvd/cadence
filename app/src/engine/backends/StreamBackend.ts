import { streamUrl } from '@/lib/desktop';
import { BaseBackend } from '../BaseBackend';
import { createVideoElement } from '../createVideoElement';
import { mseCodecString } from '../capabilities';
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
 */

/** Stop pulling fragments once this many seconds are buffered ahead. */
const BUFFER_TARGET_SECONDS = 30;
/** Start pulling again when the cushion falls below this. */
const BUFFER_RESUME_SECONDS = 12;

export class StreamBackend extends BaseBackend {
  readonly kind: BackendKind = 'stream';

  private video: HTMLVideoElement | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;
  private detachListeners: (() => void) | null = null;

  private path = '';
  private duration = 0;
  private audioStreamIndex: number | null = null;

  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private abort: AbortController | null = null;

  /**
   * Bumped on every seek. A pump that was in flight when the seek happened
   * checks this before appending, so fragments from the stream the viewer just
   * left cannot land in the buffer for the one they went to.
   */
  private generation = 0;

  private readonly probedTracks: readonly MediaTrack[];
  private readonly copyVideo: boolean;
  private readonly copyAudio: boolean;

  constructor(probe: ProbeResult) {
    super();
    this.probedTracks = probe.tracks;
    this.duration = probe.durationHint ?? 0;
    this.copyVideo = probe.copyVideo;
    this.copyAudio = probe.copyAudio;
  }

  protected onAttach(container: HTMLElement): void {
    const video = createVideoElement();
    this.video = video;
    container.appendChild(video);
    this.bindEvents(video);
  }

  async load(source: MediaSourceInput): Promise<void> {
    if (source.kind !== 'path') {
      this.fail('This source cannot be streamed.');
      return;
    }
    this.path = source.path;
    this._tracks = [...this.probedTracks];

    const audio = this.probedTracks.find((track) => track.type === 'audio');
    this.audioStreamIndex = audio ? Number(audio.id) : null;

    await this.openAt(0);
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
    if (!video) return;

    this.generation += 1;
    const generation = this.generation;

    await this.teardownStream();
    if (this.destroyed || generation !== this.generation) return;

    this.setState({ loading: true }, true);

    const url = await streamUrl(this.path, {
      start: seconds,
      audio: this.audioStreamIndex ?? undefined,
    });
    if (!url) {
      this.fail('Playback support is missing from this installation.');
      return;
    }
    if (this.destroyed || generation !== this.generation) return;

    const mediaSource = new MediaSource();
    this.mediaSource = mediaSource;
    this.objectUrl = URL.createObjectURL(mediaSource);
    video.src = this.objectUrl;

    mediaSource.addEventListener(
      'sourceopen',
      () => {
        if (generation !== this.generation) return;
        // Known from inspection, and the only place it can come from: the
        // fragments carry no total.
        if (this.duration > 0) {
          try {
            mediaSource.duration = this.duration;
          } catch {
            /* Refused only mid-update, which it cannot be yet. */
          }
        }
        void this.pump(url, seconds, generation);
      },
      { once: true },
    );
  }

  /**
   * Read the stream and append it, pausing whenever playback is far enough
   * ahead. A film is tens of gigabytes and the buffer is memory.
   */
  private async pump(url: string, offset: number, generation: number): Promise<void> {
    const mediaSource = this.mediaSource;
    if (!mediaSource || !this.video) return;

    const abort = new AbortController();
    this.abort = abort;

    let response: Response;
    try {
      response = await fetch(url, { signal: abort.signal });
    } catch (err) {
      if (abort.signal.aborted) return;
      this.fail('Could not reach the playback pipeline.', true, err);
      return;
    }

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      this.fail(detail || 'The file could not be opened.');
      return;
    }

    const reader = response.body.getReader();
    this.reader = reader;

    try {
      for (;;) {
        if (this.destroyed || generation !== this.generation) return;

        await this.waitForRoom(generation);
        if (this.destroyed || generation !== this.generation) return;

        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;

        const buffer = this.sourceBuffer ?? this.openBuffer(offset);
        if (!buffer || generation !== this.generation) return;

        await this.append(buffer, value);
      }

      if (generation === this.generation && mediaSource.readyState === 'open') {
        mediaSource.endOfStream();
      }
    } catch (err) {
      if (abort.signal.aborted || this.destroyed) return;
      this.fail('The stream stopped unexpectedly.', true, err);
    }
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

    const mime = mseCodecString(this.probedTracks, {
      copyVideo: this.copyVideo,
      copyAudio: this.copyAudio,
    });
    if (!MediaSource.isTypeSupported(mime)) {
      this.fail(`The browser will not accept ${mime}.`);
      return null;
    }

    let buffer: SourceBuffer;
    try {
      buffer = mediaSource.addSourceBuffer(mime);
    } catch (err) {
      this.fail('The browser refused this stream.', true, err);
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
      const done = () => settle(resolve);
      const failed = () => settle(() => reject(new Error('the browser rejected a fragment')));

      buffer.addEventListener('updateend', done);
      buffer.addEventListener('error', failed);

      try {
        buffer.appendBuffer(chunk as unknown as BufferSource);
      } catch (err) {
        settle(() => reject(err));
      }
    });
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

    if (ahead() < BUFFER_TARGET_SECONDS) return Promise.resolve();

    return new Promise((resolve) => {
      const timer = window.setInterval(() => {
        const stale = this.destroyed || generation !== this.generation;
        if (stale || ahead() < BUFFER_RESUME_SECONDS) {
          window.clearInterval(timer);
          resolve();
        }
      }, 250);
    });
  }

  private async teardownStream(): Promise<void> {
    this.abort?.abort();
    this.abort = null;

    try {
      await this.reader?.cancel();
    } catch {
      /* Already closed. */
    }
    this.reader = null;

    if (this.mediaSource?.readyState === 'open') {
      try {
        this.mediaSource.endOfStream();
      } catch {
        /* Already ended. */
      }
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
      const duration = this.duration || video.duration || 0;
      this.setState({ duration, loading: false }, true);
      this.emit('loadedmetadata', { duration, tracks: this._tracks });
    };
    const onTimeUpdate = () => {
      this.setState({ currentTime: video.currentTime });
      this.emit('timeupdate', { currentTime: video.currentTime });
    };
    const onProgress = () => {
      if (video.buffered.length === 0) return;
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
    const onPlay = () => this.setState({ paused: false, ended: false }, true);
    const onPause = () => this.setState({ paused: true }, true);
    const onWaiting = () => this.setState({ loading: true });
    const onPlaying = () => this.setState({ loading: false, seeking: false }, true);
    const onEnded = () => {
      this.setState({ ended: true, paused: true }, true);
      this.emit('ended', undefined);
    };
    const onError = () =>
      this.fail(video.error?.message ?? 'Playback failed.', true, video.error);
    const onRateChange = () => this.setState({ rate: video.playbackRate });
    const onVolumeChange = () =>
      this.setState({ volume: video.volume, muted: video.muted });

    const pairs: [string, EventListener][] = [
      ['loadedmetadata', onLoadedMetadata],
      ['timeupdate', onTimeUpdate],
      ['progress', onProgress],
      ['play', onPlay],
      ['pause', onPause],
      ['waiting', onWaiting],
      ['playing', onPlaying],
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
    await this.video?.play();
  }

  pause(): void {
    this.video?.pause();
  }

  /**
   * Seek, going back to FFmpeg only when the target is somewhere the buffer
   * does not already cover. Scrubbing within the cushion is the element's own
   * seek, and costs nothing.
   */
  seek(seconds: number): void {
    const video = this.video;
    if (!video) return;

    const target = Math.max(
      0,
      this.duration > 0 ? Math.min(seconds, this.duration) : seconds,
    );

    const ranges = video.buffered;
    for (let i = 0; i < ranges.length; i += 1) {
      if (target >= ranges.start(i) && target <= ranges.end(i)) {
        video.currentTime = target;
        return;
      }
    }

    this.setState({ seeking: true, currentTime: target }, true);
    void this.openAt(target).then(() => {
      // The fragments are offset back onto the real timeline, so the element is
      // asked for the timestamp the viewer asked for rather than for zero.
      if (this.video) this.video.currentTime = target;
    });
  }

  setVolume(volume: number): void {
    if (this.video) this.video.volume = volume;
  }

  setMuted(muted: boolean): void {
    if (this.video) this.video.muted = muted;
  }

  setRate(rate: number): void {
    if (this.video) this.video.playbackRate = rate;
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
    const resumeAt = this.video?.currentTime ?? 0;
    void this.openAt(resumeAt).then(() => {
      if (this.video) this.video.currentTime = resumeAt;
    });
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
    void this.teardownStream();
    this.detachListeners?.();
    this.detachListeners = null;
    if (this.video) {
      this.video.removeAttribute('src');
      this.video.load();
      this.video.remove();
      this.video = null;
    }
  }
}
