import { toPlayableUrl } from '@/lib/desktop';
import { BaseBackend } from '../BaseBackend';
import { audioChain } from '../audioChain';
import { createVideoElement } from '../createVideoElement';
import type { BackendKind, MediaSourceInput, MediaTrack } from '../types';

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
    };
    const onTimeUpdate = () => {
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
    const onSeeking = () => this.setState({ seeking: true }, true);
    const onSeeked = () => this.setState({ seeking: false }, true);
    const onWaiting = () => this.setState({ loading: true });
    const onPlaying = () => this.setState({ loading: false }, true);
    const onEnded = () => {
      this.setState({ ended: true, paused: true }, true);
      this.emit('ended', undefined);
    };
    const onError = () => {
      const code = video.error?.code;
      this.fail(
        code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? 'This file uses a format the browser cannot play.'
          : (video.error?.message ?? 'Playback failed.'),
        true,
        video.error,
      );
    };
    const onRateChange = () => this.setState({ rate: video.playbackRate });
    const onVolumeChange = () =>
      this.setState({ volume: video.volume, muted: video.muted });

    const pairs: [string, EventListener][] = [
      ['loadedmetadata', onLoadedMetadata],
      ['timeupdate', onTimeUpdate],
      ['progress', onProgress],
      ['play', onPlay],
      ['pause', onPause],
      ['seeking', onSeeking],
      ['seeked', onSeeked],
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

  /**
   * Enumerate tracks the browser exposes.
   *
   * `audioTracks` is still unshipped in Chrome, so most native sources report a
   * single implicit track. That is accurate rather than limiting: a container
   * the browser demuxes natively is one whose extra tracks it also hides.
   */
  private readNativeTracks(video: HTMLVideoElement): MediaTrack[] {
    const tracks: MediaTrack[] = [];

    const audioTracks = (video as unknown as { audioTracks?: ArrayLike<{
      id: string;
      label: string;
      language: string;
      enabled: boolean;
    }> }).audioTracks;

    if (audioTracks && audioTracks.length > 0) {
      for (let i = 0; i < audioTracks.length; i += 1) {
        const t = audioTracks[i]!;
        tracks.push({
          id: t.id || String(i),
          type: 'audio',
          codec: 'native',
          language: t.language || undefined,
          label: t.label || undefined,
          default: t.enabled,
          playable: true,
        });
      }
    } else {
      tracks.push({
        id: '0',
        type: 'audio',
        codec: 'native',
        label: 'Default',
        default: true,
        playable: true,
      });
    }

    tracks.push({
      id: 'v0',
      type: 'video',
      codec: 'native',
      width: video.videoWidth,
      height: video.videoHeight,
      default: true,
      playable: true,
    });

    return tracks;
  }

  async load(source: MediaSourceInput): Promise<void> {
    const video = this.video;
    if (!video) throw new Error('NativeBackend.load called before attach');

    this.releaseObjectUrl();
    this.setState({ loading: true, ended: false, currentTime: 0, buffered: 0 }, true);

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
  }

  private releaseObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  async play(): Promise<void> {
    await this.video?.play();
  }

  pause(): void {
    this.video?.pause();
  }

  seek(seconds: number): void {
    const video = this.video;
    if (!video) return;
    const target = Math.max(0, Math.min(seconds, video.duration || 0));
    video.currentTime = target;
    // Reflect immediately so the scrubber does not snap back while the element
    // works through the seek.
    this.setState({ currentTime: target, seeking: true }, true);
  }

  setVolume(volume: number): void {
    if (this.video) this.video.volume = Math.max(0, Math.min(1, volume));
  }

  setBoost(multiplier: number): void {
    this.chain.setBoost(multiplier);
  }

  setMuted(muted: boolean): void {
    if (this.video) this.video.muted = muted;
  }

  setRate(rate: number): void {
    if (!this.video) return;
    this.video.playbackRate = rate;
    // Keep pitch stable when speeding through lectures.
    this.video.preservesPitch = true;
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
