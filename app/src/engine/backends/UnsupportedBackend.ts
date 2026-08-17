import { BaseBackend } from '../BaseBackend';
import { isWasmOnlyCodec } from '../capabilities';
import type { BackendKind, ProbeResult } from '../types';

/**
 * Placeholder for sources that need full software decoding.
 *
 * The remux path covers any codec the browser can decode; what lands here is
 * specifically the set no browser decoder accepts: AC3, DTS, TrueHD, VC-1 and
 * friends. Rather than handing the user a black screen, this backend reports
 * exactly which codec is responsible and which track is at fault.
 *
 * The planned replacement is *not* a full WebCodecs render loop. The cheaper
 * and more robust design is a partial transcode: copy the video stream
 * untouched so it keeps hardware decoding, and re-encode only the offending
 * audio track to AAC through libav before handing the result to the existing
 * remux pipeline. That reuses everything in `RemuxBackend` and keeps A/V sync
 * the browser's problem rather than ours.
 */
export class UnsupportedBackend extends BaseBackend {
  readonly kind: BackendKind = 'decode';

  private readonly probe: ProbeResult;

  constructor(probe: ProbeResult) {
    super();
    this.probe = probe;
    this._tracks = [...probe.tracks];
  }

  protected onAttach(): void {
    this.setState({ loading: false }, true);
  }

  async load(): Promise<void> {
    this.setState({ loading: false }, true);
    this.fail(this.buildMessage(), true);
  }

  /** Name the specific codec and track so the message is actionable. */
  private buildMessage(): string {
    const blockers = this.probe.tracks.filter(
      (t) => (t.type === 'video' || t.type === 'audio') && isWasmOnlyCodec(t.codec),
    );

    if (blockers.length === 0) {
      return `This file needs software decoding, which is not available yet (${this.probe.reason}).`;
    }

    const names = [...new Set(blockers.map((t) => t.codec.toUpperCase()))].join(' and ');
    const kinds = [...new Set(blockers.map((t) => t.type))].join(' and ');

    const altAudio = this.probe.tracks.some(
      (t) => t.type === 'audio' && !isWasmOnlyCodec(t.codec),
    );

    return altAudio
      ? `The default ${kinds} track uses ${names}, which no browser can decode. This file has another audio track that will work. Pick it from the track menu.`
      : `This file's ${kinds} uses ${names}, which no browser can decode. Software decoding for it is not implemented yet.`;
  }

  async play(): Promise<void> {}
  pause(): void {}
  seek(): void {}
  setVolume(): void {}
  setMuted(): void {}
  setRate(): void {}
  selectTrack(): void {}

  getVideoElement(): HTMLVideoElement | null {
    return null;
  }

  getRenderSurface(): null {
    return null;
  }

  protected onDestroy(): void {}
}
