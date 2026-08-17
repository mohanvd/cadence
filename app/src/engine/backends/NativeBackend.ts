import { BaseBackend } from '../BaseBackend';
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
    } else {
      // Needed for canvas screenshots and the ambient layer to not taint.
      video.crossOrigin = 'anonymous';
      video.src = source.url;
    }
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
