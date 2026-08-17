import { BaseBackend } from '../BaseBackend';
import { createVideoElement } from '../createVideoElement';
import { mseMimeFor, remuxFormatFor, type RemuxFormat } from '../capabilities';
import { getLibAV, nextVirtualFilename } from '../libav';
import type { BackendKind, MediaSourceInput, MediaTrack } from '../types';

/**
 * Plays containers the browser cannot demux by repackaging them into
 * fragmented MP4 and feeding Media Source Extensions.
 *
 * Critically this is a *remux*, not a transcode: packets are copied bit for bit
 * and the browser still decodes in hardware. That makes it cheap enough to run
 * in real time on a laptop and keeps quality identical to the source. It is the
 * path that makes the common case (an MKV holding H.264 + AAC) just work.
 *
 * The pipeline is demand-driven:
 *
 *   libav demux -> libav mux (fMP4) -> onwrite chunks -> SourceBuffer.appendBuffer
 *
 * and pauses whenever the buffer runs far enough ahead of the playhead, so a
 * 4GB lecture never gets pulled into memory at once.
 */

/** Stop demuxing once this many seconds are buffered ahead of the playhead. */
const BUFFER_TARGET_SECONDS = 30;
/** Resume demuxing when the cushion falls below this. */
const BUFFER_RESUME_SECONDS = 15;
/** Bytes of muxed output to request per demux pass. */
const READ_CHUNK_BYTES = 1 << 20;

interface StreamMapping {
  /** Index in the input container. */
  inputIndex: number;
  /** Index in the fMP4 output. */
  outputIndex: number;
  timeBaseNum: number;
  timeBaseDen: number;
}

export class RemuxBackend extends BaseBackend {
  readonly kind: BackendKind = 'remux';

  private video: HTMLVideoElement | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;
  private detachListeners: (() => void) | null = null;

  /** Chunks produced by the muxer, waiting to be appended. */
  private pendingChunks: Uint8Array[] = [];
  private appending = false;

  private inputName: string | null = null;
  private outputName: string | null = null;
  private formatCtx = 0;
  private outputCtx = 0;
  private avioCtx = 0;
  private packetPtr = 0;
  private mappings: StreamMapping[] = [];

  private pumping = false;
  private reachedEof = false;
  /** Generation counter so an in-flight pump aborts after a seek. */
  private generation = 0;

  private readonly probedTracks: readonly MediaTrack[];

  constructor(probedTracks: readonly MediaTrack[]) {
    super();
    this.probedTracks = probedTracks;
  }

  protected onAttach(container: HTMLElement): void {
    const video = createVideoElement();
    this.video = video;
    container.appendChild(video);
    this.bindEvents(video);
  }

  private bindEvents(video: HTMLVideoElement): void {
    const onTimeUpdate = () => {
      this.setState({ currentTime: video.currentTime });
      this.emit('timeupdate', { currentTime: video.currentTime });
      // Playback advancing is what frees buffer headroom, so this is the
      // natural place to consider resuming the demuxer.
      void this.maybeResumePump();
    };
    const onPlay = () => this.setState({ paused: false, ended: false }, true);
    const onPause = () => this.setState({ paused: true }, true);
    const onSeeking = () => this.setState({ seeking: true }, true);
    const onSeeked = () => this.setState({ seeking: false }, true);
    const onWaiting = () => this.setState({ loading: true });
    const onPlaying = () => this.setState({ loading: false }, true);
    const onProgress = () => this.setState({ buffered: this.bufferedEnd() });
    const onEnded = () => {
      this.setState({ ended: true, paused: true }, true);
      this.emit('ended', undefined);
    };
    const onError = () =>
      this.fail(video.error?.message ?? 'Playback failed after remuxing.', true, video.error);
    const onRateChange = () => this.setState({ rate: video.playbackRate });
    const onVolumeChange = () =>
      this.setState({ volume: video.volume, muted: video.muted });

    const pairs: [string, EventListener][] = [
      ['timeupdate', onTimeUpdate],
      ['play', onPlay],
      ['pause', onPause],
      ['seeking', onSeeking],
      ['seeked', onSeeked],
      ['waiting', onWaiting],
      ['playing', onPlaying],
      ['progress', onProgress],
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

  private bufferedEnd(): number {
    const video = this.video;
    if (!video || video.buffered.length === 0) return 0;
    const t = video.currentTime;
    for (let i = 0; i < video.buffered.length; i += 1) {
      if (video.buffered.start(i) <= t + 0.5 && video.buffered.end(i) >= t) {
        return video.buffered.end(i);
      }
    }
    return video.buffered.end(video.buffered.length - 1);
  }

  async load(source: MediaSourceInput): Promise<void> {
    const video = this.video;
    if (!video) throw new Error('RemuxBackend.load called before attach');

    this.setState({ loading: true, ended: false, currentTime: 0, buffered: 0 }, true);

    const mime = this.mseMime();
    if (!mime) {
      this.fail('No playable video or audio track found in this file.', true);
      return;
    }

    const mediaSource = new MediaSource();
    this.mediaSource = mediaSource;
    const url = URL.createObjectURL(mediaSource);
    this.objectUrl = url;
    video.src = url;

    await new Promise<void>((resolve) => {
      mediaSource.addEventListener('sourceopen', () => resolve(), { once: true });
    });

    try {
      const sourceBuffer = mediaSource.addSourceBuffer(mime);
      // Timestamps come straight from the source container, already ordered.
      sourceBuffer.mode = 'segments';
      sourceBuffer.addEventListener('updateend', () => {
        this.appending = false;
        this.setState({ buffered: this.bufferedEnd() });
        void this.drainChunks();
      });
      sourceBuffer.addEventListener('error', () =>
        this.fail('The browser rejected the remuxed stream.', true),
      );
      this.sourceBuffer = sourceBuffer;
    } catch (err) {
      this.fail('This codec combination cannot be played after remuxing.', true, err);
      return;
    }

    try {
      await this.openPipeline(source);
      await this.pump();
    } catch (err) {
      this.fail(
        err instanceof Error ? err.message : 'Failed to remux this file.',
        true,
        err,
      );
    }
  }

  /** Codecs of the tracks being copied into the output. */
  private outputCodecs(): string[] {
    const video = this.probedTracks.find((t) => t.type === 'video' && t.playable);
    const audio = this.probedTracks.find((t) => t.type === 'audio' && t.playable);
    return [video?.codec, audio?.codec].filter((c): c is string => Boolean(c));
  }

  /** Full MSE MIME type for the remuxed output. */
  private mseMime(): string | null {
    const codecs = this.outputCodecs();
    return codecs.length > 0 ? mseMimeFor(codecs) : null;
  }

  /** Container the output is muxed into: MP4 for H.26x, WebM for the VP family. */
  private outputFormat(): RemuxFormat {
    return remuxFormatFor(this.outputCodecs());
  }

  /** Open the demuxer, create the fMP4 muxer, and write the init segment. */
  private async openPipeline(source: MediaSourceInput): Promise<void> {
    const libav = await getLibAV();

    const inputName = nextVirtualFilename(source.name);
    this.inputName = inputName;
    const blob =
      source.kind === 'file'
        ? source.file
        : await fetch(source.url).then((r) => r.blob());
    await libav.mkreadaheadfile(inputName, blob);

    const [formatCtx, streams] = await libav.ff_init_demuxer_file(inputName);
    this.formatCtx = formatCtx;

    // Copy only the tracks the browser agreed to decode.
    const wanted = new Set(
      this.probedTracks
        .filter((t) => t.playable && (t.type === 'video' || t.type === 'audio'))
        .map((t) => Number(t.id)),
    );

    const streamCtxs: [number, number, number][] = [];
    this.mappings = [];
    for (const stream of streams) {
      if (!wanted.has(stream.index)) continue;
      this.mappings.push({
        inputIndex: stream.index,
        outputIndex: streamCtxs.length,
        timeBaseNum: stream.time_base_num,
        timeBaseDen: stream.time_base_den,
      });
      streamCtxs.push([stream.codecpar, stream.time_base_num, stream.time_base_den]);
    }

    if (streamCtxs.length === 0) {
      throw new Error('No playable tracks to remux.');
    }

    const format = this.outputFormat();
    const outputName = `out-${inputName}.${format}`;
    this.outputName = outputName;

    // A writer device turns muxer output into `onwrite` callbacks instead of a
    // file, which is what lets chunks stream into MSE as they are produced.
    await libav.mkwriterdev(outputName);
    libav.onwrite = (filename, _position, buffer) => {
      if (filename !== outputName) return;
      // The callback hands back a view into the WASM heap; it must be copied
      // before the next libav call reuses that memory.
      this.pendingChunks.push(new Uint8Array(buffer));
    };

    const [outputCtx, , avioCtx] = await libav.ff_init_muxer(
      { filename: outputName, open: true, codecpars: true, format_name: format },
      streamCtxs,
    );
    this.outputCtx = outputCtx;
    this.avioCtx = avioCtx;

    // These flags are what make the output *fragmented* and therefore
    // streamable: no seekable index, and a playable moov written up front.
    // Only MP4 has movflags; WebM fragments by default.
    let optionsPtr = 0;
    if (format === 'mp4') {
      const dict = await libav.av_dict_set_js(
        0,
        'movflags',
        'frag_keyframe+empty_moov+default_base_moof',
        0,
      );
      // `avformat_write_header` takes AVDictionary**, not AVDictionary*.
      // Passing the dictionary directly makes libav dereference the dict's
      // first field as an address, which reliably crashes the WASM heap.
      optionsPtr = await libav.ff_malloc_int32_list([dict]);
    }
    await libav.avformat_write_header(outputCtx, optionsPtr);

    this.packetPtr = await libav.av_packet_alloc();
    await this.drainChunks();
  }

  /**
   * Read a batch of packets, mux them, and hand the output to MSE.
   * Re-arms itself until the buffer cushion is satisfied or the file ends.
   */
  private async pump(): Promise<void> {
    if (this.pumping || this.reachedEof || this.destroyed) return;
    this.pumping = true;
    const generation = this.generation;

    try {
      const libav = await getLibAV();

      while (!this.destroyed && generation === this.generation && !this.reachedEof) {
        if (this.bufferedAhead() >= BUFFER_TARGET_SECONDS) break;

        const [result, packets] = await libav.ff_read_frame_multi(
          this.formatCtx,
          this.packetPtr,
          { limit: READ_CHUNK_BYTES },
        );

        if (generation !== this.generation) break;

        // Rewrite input stream indices to output indices before muxing.
        const toWrite = [];
        for (const mapping of this.mappings) {
          const streamPackets = packets[mapping.inputIndex];
          if (!streamPackets) continue;
          for (const packet of streamPackets) {
            toWrite.push({ ...packet, stream_index: mapping.outputIndex });
          }
        }

        if (toWrite.length > 0) {
          // Interleaved write keeps audio and video in decode order.
          await libav.ff_write_multi(this.outputCtx, this.packetPtr, toWrite);
          await this.drainChunks();
        }

        // libav returns EOF as a negative result; anything else means more to read.
        if (result < 0 && result !== -libav.EAGAIN) {
          this.reachedEof = true;
          await this.finishStream();
          break;
        }
      }
    } catch (err) {
      if (!this.destroyed) {
        this.fail(
          err instanceof Error ? err.message : 'Remuxing failed mid-stream.',
          true,
          err,
        );
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Seconds of contiguous data buffered ahead of the playhead. */
  private bufferedAhead(): number {
    const video = this.video;
    if (!video) return 0;
    return Math.max(0, this.bufferedEnd() - video.currentTime);
  }

  private async maybeResumePump(): Promise<void> {
    if (this.reachedEof || this.pumping) return;
    if (this.bufferedAhead() > BUFFER_RESUME_SECONDS) return;
    await this.pump();
  }

  /** Append queued chunks to the SourceBuffer one at a time. */
  private async drainChunks(): Promise<void> {
    const sourceBuffer = this.sourceBuffer;
    if (!sourceBuffer || this.appending || this.destroyed) return;
    if (this.pendingChunks.length === 0) return;
    if (sourceBuffer.updating) return;

    // Concatenate what is queued so MSE parses fewer, larger appends.
    const total = this.pendingChunks.reduce((sum, c) => sum + c.byteLength, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.pendingChunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.pendingChunks = [];

    try {
      this.appending = true;
      sourceBuffer.appendBuffer(merged);
    } catch (err) {
      this.appending = false;
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        // Evict everything well behind the playhead and retry on the next tick.
        this.evictBehindPlayhead();
        this.pendingChunks.unshift(merged);
        return;
      }
      this.fail('Failed to buffer the remuxed stream.', true, err);
    }
  }

  private evictBehindPlayhead(): void {
    const sourceBuffer = this.sourceBuffer;
    const video = this.video;
    if (!sourceBuffer || !video || sourceBuffer.updating) return;
    const cutoff = video.currentTime - 10;
    if (cutoff <= 0) return;
    try {
      sourceBuffer.remove(0, cutoff);
    } catch {
      // Removal is best-effort; a failure just means we retry later.
    }
  }

  private async finishStream(): Promise<void> {
    const libav = await getLibAV();
    if (this.outputCtx) {
      await libav.av_write_trailer(this.outputCtx).catch(() => {});
      await this.drainChunks();
    }
    // Wait for the final append to land before closing the stream, otherwise
    // the tail of the file is dropped.
    const sourceBuffer = this.sourceBuffer;
    const mediaSource = this.mediaSource;
    if (!mediaSource || mediaSource.readyState !== 'open') return;

    const close = () => {
      if (mediaSource.readyState === 'open' && this.pendingChunks.length === 0) {
        try {
          mediaSource.endOfStream();
        } catch {
          // Already ended or torn down.
        }
      }
    };

    if (sourceBuffer && (sourceBuffer.updating || this.pendingChunks.length > 0)) {
      sourceBuffer.addEventListener('updateend', close, { once: true });
    } else {
      close();
    }
  }

  async play(): Promise<void> {
    await this.video?.play();
  }

  pause(): void {
    this.video?.pause();
  }

  /**
   * Seeking re-runs the demuxer from the target keyframe.
   *
   * MSE can only play what has been appended, so a seek outside the buffered
   * range means discarding the buffer, repositioning the demuxer, and remuxing
   * from that point. Seeks *inside* the buffer are handled by the element.
   */
  seek(seconds: number): void {
    const video = this.video;
    if (!video) return;
    const target = Math.max(0, Math.min(seconds, this._state.duration || seconds));

    if (this.isBuffered(target)) {
      video.currentTime = target;
      this.setState({ currentTime: target, seeking: true }, true);
      return;
    }

    void this.seekAndRemux(target);
  }

  private isBuffered(time: number): boolean {
    const video = this.video;
    if (!video) return false;
    for (let i = 0; i < video.buffered.length; i += 1) {
      if (video.buffered.start(i) <= time && video.buffered.end(i) > time + 0.25) {
        return true;
      }
    }
    return false;
  }

  private async seekAndRemux(target: number): Promise<void> {
    const libav = await getLibAV();
    const video = this.video;
    const sourceBuffer = this.sourceBuffer;
    if (!video || !sourceBuffer) return;

    // Invalidate any pump still in flight so it stops appending stale packets.
    this.generation += 1;
    this.setState({ seeking: true, loading: true }, true);
    this.pendingChunks = [];
    this.reachedEof = false;

    // Wait out any append already in progress before mutating the buffer.
    while (sourceBuffer.updating) {
      await new Promise<void>((resolve) =>
        sourceBuffer.addEventListener('updateend', () => resolve(), { once: true }),
      );
    }

    try {
      const duration = this._state.duration || target + 1;
      sourceBuffer.remove(0, duration);
      await new Promise<void>((resolve) =>
        sourceBuffer.addEventListener('updateend', () => resolve(), { once: true }),
      );

      // Seek backward to the nearest keyframe so the decoder has a valid entry
      // point; decoding then runs forward to the requested time.
      // The timestamp is a 64-bit microsecond value split across two 32-bit
      // args, and anything past ~71 minutes overflows the low word alone.
      const micros = Math.floor(target * 1e6);
      await libav.avformat_seek_file_approx(
        this.formatCtx,
        -1,
        micros % 2 ** 32,
        Math.floor(micros / 2 ** 32),
        libav.AVSEEK_FLAG_BACKWARD,
      );

      // `sequence` mode retimes the new fragments to start at the seek point.
      sourceBuffer.timestampOffset = 0;
      video.currentTime = target;

      await this.pump();
      this.setState({ loading: false }, true);
    } catch (err) {
      this.fail('Seeking failed in this file.', false, err);
      this.setState({ loading: false, seeking: false }, true);
    }
  }

  setVolume(volume: number): void {
    if (this.video) this.video.volume = Math.max(0, Math.min(1, volume));
  }

  setMuted(muted: boolean): void {
    if (this.video) this.video.muted = muted;
  }

  setRate(rate: number): void {
    if (!this.video) return;
    this.video.playbackRate = rate;
    this.video.preservesPitch = true;
  }

  /**
   * Track switching requires rebuilding the output with a different stream set,
   * which means a full reload. Left to the engine layer to orchestrate.
   */
  selectTrack(type: 'audio' | 'subtitle', id: string | null): void {
    if (type === 'subtitle') {
      const video = this.video;
      if (!video) return;
      for (let i = 0; i < video.textTracks.length; i += 1) {
        const track = video.textTracks[i]!;
        track.mode = id !== null && String(i) === id ? 'showing' : 'disabled';
      }
    }
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  getRenderSurface(): HTMLVideoElement | null {
    return this.video;
  }

  protected onDestroy(): void {
    this.generation += 1;
    this.detachListeners?.();
    this.detachListeners = null;
    this.pendingChunks = [];

    const video = this.video;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
    }
    this.video = null;

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    // Tear down the WASM side without blocking teardown of the UI.
    void this.releaseLibavResources();
  }

  private async releaseLibavResources(): Promise<void> {
    try {
      const libav = await getLibAV();
      if (libav.onwrite) libav.onwrite = undefined;
      if (this.packetPtr) await libav.av_packet_free_js(this.packetPtr).catch(() => {});
      if (this.outputCtx) {
        await libav.ff_free_muxer(this.outputCtx, this.avioCtx).catch(() => {});
      }
      if (this.formatCtx) {
        await libav.avformat_close_input_js(this.formatCtx).catch(() => {});
      }
      if (this.inputName) {
        await libav.unlinkreadaheadfile(this.inputName).catch(() => {});
      }
      if (this.outputName) await libav.unlink(this.outputName).catch(() => {});
    } catch {
      // The runtime may already be gone during page teardown.
    } finally {
      this.packetPtr = 0;
      this.outputCtx = 0;
      this.avioCtx = 0;
      this.formatCtx = 0;
      this.inputName = null;
      this.outputName = null;
    }
  }
}
