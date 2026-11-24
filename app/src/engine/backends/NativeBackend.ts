import { toPlayableUrl } from '@/lib/desktop';
import { BaseBackend } from '../BaseBackend';
import { audioChain } from '../audioChain';
import { createVideoElement } from '../createVideoElement';
import type { BackendKind, MediaSourceInput, MediaTrack, ProbeResult } from '../types';

/**
 * Plays a source with a plain `<video>` element.
 *
 * Zero overhead and full hardware decode. Used whenever the browser can demux
 * the container itself, which covers the majority of MP4 and WebM content.
 */
export class NativeBackend extends BaseBackend {
  readonly kind: BackendKind = 'native';

  private video: HTMLVideoElement | null = null;
  private objectUrl: string | null = null;
  private detachListeners: (() => void) | null = null;
  private readonly chain = audioChain;
  /**
   * What inspection found, for the questions the element cannot answer.
   *
   * A plain element will say how wide the picture is and nothing else: not the
   * codec, not the channel count, not whether there is a second audio track it
   * has quietly chosen between. FFmpeg has already been asked all of that by
   * the time a backend exists, and throwing the answer away to re-derive a
   * worse one from the element is how an album came to be described as a video
   * track in a codec called "native".
   */
  private readonly probed: readonly MediaTrack[];

  /** The speed asked for, re-applied whenever the element could have lost it. */
  private rate = 1;
  /**
   * Where the viewer last asked to go while the element was still busy going
   * somewhere else. Applied when that seek lands, so a drag along the timeline
   * is one seek at a time, each to wherever the pointer is by then, rather
   * than a pile of them each cancelling the last before a frame is shown.
   */
  private pendingSeek: number | null = null;
  /** Where to start once the length is known, for a retry resuming mid-film. */
  private startAt = 0;
  /**
   * Whether anything has actually played. A failure before it is the browser
   * refusing the file; a failure after it is something going wrong with a
   * file the browser was already playing, and says nothing about the codec.
   */
  private presented = false;

  constructor(probe?: ProbeResult) {
    super();
    this.probed = probe?.tracks ?? [];
  }

  protected onAttach(container: HTMLElement): void {
    const video = createVideoElement();
    this.video = video;
    container.appendChild(video);
    this.bindEvents(video);
  }

  private bindEvents(video: HTMLVideoElement): void {
    const onLoadedMetadata = () => {
      this._tracks = this.readNativeTracks(video);
      this.setState({ duration: video.duration || 0, loading: false }, true);
      this.emit('loadedmetadata', {
        duration: video.duration || 0,
        tracks: this._tracks,
      });
      if (this.startAt > 0) {
        const at = this.startAt;
        this.startAt = 0;
        this.seek(at);
      }
    };
    const onTimeUpdate = () => {
      /* Mid-seek the element reports where it was, not where it is going, and
         passing that on is what made the thumb snap back for a moment after
         every release. The target is already in the state. */
      if (video.seeking || this.pendingSeek !== null) return;
      this.setState({ currentTime: video.currentTime });
      this.emit('timeupdate', { currentTime: video.currentTime });
    };
    const onProgress = () => {
      if (video.buffered.length === 0) return;
      // Report the range covering the playhead, not simply the last range,
      // after a seek backwards the final range can be far ahead of playback.
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
    /* A new source pauses the element without a pause event, only this one.
       Read the element rather than trust the last event, or the button and
       the picture disagree about whether anything is playing, and the next
       press does nothing at all. */
    const onEmptied = () => this.setState({ paused: video.paused }, true);
    const onSeeking = () => this.setState({ seeking: true }, true);
    const onSeeked = () => {
      if (this.pendingSeek !== null) {
        const next = this.pendingSeek;
        this.pendingSeek = null;
        video.currentTime = next;
        return;
      }
      this.setState({ seeking: false, currentTime: video.currentTime }, true);
      this.emit('timeupdate', { currentTime: video.currentTime });
    };
    const onWaiting = () => this.setState({ loading: true });
    const onPlaying = () => {
      this.presented = true;
      this.setState({ loading: false, paused: video.paused }, true);
    };
    const onCanPlay = () => {
      if (!video.seeking) this.setState({ loading: false });
    };
    const onEnded = () => {
      this.setState({ ended: true, paused: true }, true);
      this.emit('ended', undefined);
    };
    const onError = () => {
      const code = video.error?.code;
      const refused =
        code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || code === MediaError.MEDIA_ERR_DECODE;
      this.fail(
        code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? 'This file uses a format the browser cannot play.'
          : (video.error?.message ?? 'Playback failed.'),
        true,
        video.error,
        refused && !this.presented,
      );
    };
    /* The element puts its speed back to `defaultPlaybackRate` whenever it is
       given a source, which is how a film came to drop to normal speed by
       itself. Anything other than what was asked for is put back. */
    const onRateChange = () => {
      if (Math.abs(video.playbackRate - this.rate) > 1e-3) this.applyRate();
    };
    const onVolumeChange = () =>
      this.setState({ volume: video.volume, muted: video.muted });

    const pairs: [string, EventListener][] = [
      ['loadedmetadata', onLoadedMetadata],
      ['timeupdate', onTimeUpdate],
      ['progress', onProgress],
      ['play', onPlay],
      ['pause', onPause],
      ['emptied', onEmptied],
      ['seeking', onSeeking],
      ['seeked', onSeeked],
      ['waiting', onWaiting],
      ['playing', onPlaying],
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

  /**
   * Enumerate the tracks this source has.
   *
   * The inspection first, because it is the better answer to every part of the
   * question: real codec names, real channel counts, and, the part that
   * matters most here, no video track for a file that has none. A plain
   * element hides all of that. `audioTracks` is still unshipped in Chrome, so
   * asking the element yields one nameless entry regardless of what is inside.
   *
   * What is left is the case with no inspection to draw on: a `File` handed in
   * through a browser tab, where there is no shell to ask and the element is
   * the only witness there is. Then it is asked, and the picture is claimed
   * only if there is one, a video track invented for an audio file is what
   * puts a black rectangle where the now-playing card belongs.
   */
  private readNativeTracks(video: HTMLVideoElement): MediaTrack[] {
    if (this.probed.length > 0) return [...this.probed];

    const tracks: MediaTrack[] = [
      {
        id: '0',
        type: 'audio',
        codec: 'native',
        label: 'Default',
        default: true,
        playable: true,
      },
    ];

    if (video.videoWidth > 0) {
      tracks.push({
        id: 'v0',
        type: 'video',
        codec: 'native',
        width: video.videoWidth,
        height: video.videoHeight,
        default: true,
        playable: true,
      });
    }

    return tracks;
  }

  async load(source: MediaSourceInput, startAt = 0): Promise<void> {
    const video = this.video;
    if (!video) throw new Error('NativeBackend.load called before attach');

    this.releaseObjectUrl();
    this.pendingSeek = null;
    this.presented = false;
    this.startAt = Math.max(0, startAt);
    this.setState(
      { loading: true, ended: false, currentTime: this.startAt, buffered: 0 },
      true,
    );

    if (source.kind === 'file') {
      const url = URL.createObjectURL(source.file);
      this.objectUrl = url;
      video.src = url;
    } else if (source.kind === 'path') {
      /* Asked for so canvas screenshots and the ambient layer do not taint. The
         asset protocol is ours and answers it, so this costs nothing here. */
      video.crossOrigin = 'anonymous';
      /* A path becomes an asset URL, which streams from disk and honours range
         requests. Reading the file in first would mean holding a whole film in
         memory to play it. */
      video.src = await toPlayableUrl(source.path);
    } else {
      /* A pasted link gets no `crossOrigin`, and that is the whole fix for
         links: asking for it makes the request cross-origin, and a server that
         does not answer with the matching header has its video rejected before
         a byte is decoded. Most video hosts do not send that header, so every
         link but a handful failed with what looked like a codec error.
         Screenshots and the ambient glow are what a remote file gives up in
         exchange, and it is the right way round: playing is the feature. */
      video.src = source.url;
    }
    /* A link is the one source that cannot be amplified: routing it into Web
       Audio is what the missing permission forbids, and the penalty is silence
       rather than an error. Everything else is ours to route. */
    this.chain.attach(video, source.kind !== 'url');
    video.load();
    this.applyRate();
  }

  private releaseObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  async play(): Promise<void> {
    const video = this.video;
    if (!video) return;
    try {
      await video.play();
    } catch (err) {
      // Refused or interrupted: say what the element is really doing.
      this.setState({ paused: video.paused }, true);
      throw err;
    }
  }

  pause(): void {
    const video = this.video;
    if (!video) return;
    video.pause();
    this.setState({ paused: true }, true);
  }

  seek(seconds: number): void {
    const video = this.video;
    if (!video || !Number.isFinite(seconds)) return;
    /* Clamped only once there is a length to clamp to. Before the metadata the
       element reports NaN, and clamping to that sent every early seek, a
       resume among them, back to the start. */
    const known = Number.isFinite(video.duration) && video.duration > 0;
    const target = Math.max(0, known ? Math.min(seconds, video.duration) : seconds);
    // Reflect immediately so the scrubber does not snap back while the element
    // works through the seek.
    this.setState({ currentTime: target, seeking: true, ended: false }, true);

    if (video.seeking) {
      this.pendingSeek = target;
      return;
    }
    this.pendingSeek = null;
    video.currentTime = target;
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

  /**
   * Both rates, not only the live one. The default is what the element falls
   * back to on every new source, so setting it too is what makes a speed stay
   * set rather than last until the next load.
   */
  private applyRate(): void {
    const video = this.video;
    if (!video) return;
    video.defaultPlaybackRate = this.rate;
    video.playbackRate = this.rate;
    this.setState({ rate: this.rate });
  }

  selectTrack(type: 'audio' | 'subtitle', id: string | null): void {
    const video = this.video;
    if (!video) return;

    if (type === 'audio') {
      const audioTracks = (video as unknown as { audioTracks?: ArrayLike<{
        id: string;
        enabled: boolean;
      }> }).audioTracks;
      if (!audioTracks) return;
      for (let i = 0; i < audioTracks.length; i += 1) {
        const track = audioTracks[i]!;
        track.enabled = track.id === id || String(i) === id;
      }
      return;
    }

    for (let i = 0; i < video.textTracks.length; i += 1) {
      const track = video.textTracks[i]!;
      track.mode = id !== null && (track.id === id || String(i) === id)
        ? 'showing'
        : 'disabled';
    }
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  getRenderSurface(): HTMLVideoElement | null {
    return this.video;
  }

  protected onDestroy(): void {
    this.chain.release(this.video);
    this.detachListeners?.();
    this.detachListeners = null;

    const video = this.video;
    if (video) {
      video.pause();
      // Clearing `src` alone leaves the resource loaded in some builds; the
      // removeAttribute + load pair is what actually frees the decoder.
      video.removeAttribute('src');
      video.load();
      video.remove();
    }
    this.releaseObjectUrl();
    this.video = null;
  }
}
