/**
 * Amplification past what the media element can do on its own.
 *
 * `video.volume` is capped at 1 by the HTML specification, so anything louder
 * has to leave the element and go through Web Audio. Two things make that
 * worth doing carefully rather than with a bare gain node.
 *
 * The first is clipping, and it is the whole reason boosters have a bad name.
 * A film is mastered with its loudest moments already close to full scale;
 * multiplying that by three does not make it three times louder, it makes
 * everything above a third of full scale into a square wave. That is the
 * crackle people describe when they say amplifying ruined the sound. A limiter
 * ahead of the output holds those peaks down, and a soft clip behind it bounds
 * whatever the limiter's attack was too slow to catch, so the signal reaching
 * the speakers cannot exceed full scale by construction rather than by luck.
 *
 * The second is that routing an element into Web Audio is irreversible, and
 * silences it outright when the media is cross-origin without permission. A
 * pasted link is exactly that. So nothing here is built until a boost is
 * actually asked for, and the caller has to say whether the source can take
 * one; guessing wrong costs the user their audio for the rest of the file.
 */

/** The most the chain will amplify. Past this there is more hiss than film. */
export const MAX_BOOST = 3;

/*
 * One context for the whole application.
 *
 * Browsers cap how many can exist at once, and a player opens a new element
 * for every file, so a context per element runs out during an evening of
 * watching. Source nodes are per element and cheap; the context is not.
 */
let sharedContext: AudioContext | null = null;

function context(): AudioContext | null {
  if (sharedContext) return sharedContext;
  try {
    sharedContext = new AudioContext();
    return sharedContext;
  } catch {
    // No Web Audio at all. The caller falls back to the element's own volume.
    return null;
  }
}

/**
 * A curve that is a straight line until the signal is nearly full scale, and
 * bends instead of breaking after that.
 *
 * Below the threshold this is arithmetically identity, so ordinary material
 * passes through untouched; there is no "warmth" being added to quiet parts.
 * Above it the curve approaches, but never reaches, full scale.
 */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const SAMPLES = 8192;
  const KNEE = 0.85;
  const curve = new Float32Array(new ArrayBuffer(SAMPLES * 4));
  for (let i = 0; i < SAMPLES; i += 1) {
    const x = (i / (SAMPLES - 1)) * 2 - 1;
    const magnitude = Math.abs(x);
    if (magnitude <= KNEE) {
      curve[i] = x;
    } else {
      const over = (magnitude - KNEE) / (1 - KNEE);
      const shaped = KNEE + (1 - KNEE) * Math.tanh(over);
      curve[i] = Math.sign(x) * shaped;
    }
  }
  return curve;
}

export class AudioBoost {
  private source: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private video: HTMLVideoElement | null = null;
  private boostable = false;
  /** Remembered so a boost set before the file loaded is not lost. */
  private wanted = 1;

  /**
   * Name the element and say whether it may be routed.
   *
   * Called on every load, because a backend builds a new element per file.
   */
  attach(video: HTMLVideoElement, boostable: boolean): void {
    if (this.video === video && this.boostable === boostable) return;
    this.release();
    this.video = video;
    this.boostable = boostable;
    if (this.wanted > 1) this.apply(this.wanted);
  }

  /** Whether asking for more than 1 would do anything. */
  get available(): boolean {
    return this.boostable;
  }

  /**
   * @param multiplier 1 is untouched; up to `MAX_BOOST`.
   */
  setBoost(multiplier: number): void {
    const wanted = Math.max(1, Math.min(MAX_BOOST, multiplier));
    this.wanted = wanted;
    this.apply(wanted);
  }

  private apply(multiplier: number): void {
    // Building the graph is what costs the audio on a source that cannot take
    // it, so a boost of exactly 1 never builds one. Nothing is gained by
    // routing a signal through a chain that multiplies it by one.
    if (multiplier <= 1 && !this.gain) return;
    if (!this.boostable || !this.video) return;

    const ctx = context();
    if (!ctx) return;
    /* Never build the graph around a context that is not running.
     *
     * A context created without a user gesture starts suspended, and an
     * element routed into a suspended context does not play quietly, it plays
     * silently. Since routing cannot be undone, the order matters: wait for
     * the context to be running, then take the audio. Until then the element
     * keeps its own output, which is quieter than asked for but audible, and
     * the gesture that resumes it is usually the very one that asked for the
     * boost. */
    if (ctx.state !== 'running') {
      void ctx.resume().then(() => {
        if (this.wanted > 1) this.apply(this.wanted);
      });
      return;
    }

    if (!this.gain && !this.build()) return;
    if (!this.gain) return;
    /* Ramped rather than assigned: a gain that jumps produces a click, and a
       click at three times volume is exactly the sound this feature exists to
       avoid. */
    this.gain.gain.setTargetAtTime(multiplier, ctx.currentTime, 0.015);
  }

  /** @returns whether the graph now exists. */
  private build(): boolean {
    const ctx = context();
    const video = this.video;
    if (!ctx || !video) return false;

    try {
      this.source = ctx.createMediaElementSource(video);
    } catch {
      /* Already routed, or refused. Either way the element keeps playing
         through whatever path it has; it must not be left silent. */
      return false;
    }

    this.gain = ctx.createGain();
    this.gain.gain.value = 1;

    /* Set to catch only what would otherwise clip. A film that never reaches
       full scale never touches this, so the dynamics of quiet material are
       left alone. */
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve();
    // The bend generates harmonics above the audible range; without
    // oversampling those fold back down as tones that were never in the film.
    shaper.oversample = '4x';

    this.source.connect(this.gain);
    this.gain.connect(limiter);
    limiter.connect(shaper);
    shaper.connect(ctx.destination);
    return true;
  }

  /** Drop the graph for the current element. */
  release(): void {
    try {
      this.source?.disconnect();
      this.gain?.disconnect();
    } catch {
      /* Already gone. */
    }
    this.source = null;
    this.gain = null;
    this.video = null;
    this.boostable = false;
  }
}
