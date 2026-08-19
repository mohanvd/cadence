/**
 * The one place the audio leaves the media element.
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
 * pasted link is exactly that. So nothing here is built until something is
 * actually asked for, and the caller has to say whether the source can take
 * it; guessing wrong costs the user their audio for the rest of the file.
 *
 * And it is one graph rather than one per feature, because an element can only
 * be captured once. The equalizer and the amplifier each used to build their
 * own, which meant whichever was switched on second was refused and did
 * nothing at all, silently. They share these nodes now:
 *
 *     element → equalizer bands → amplifier → limiter → soft clip → output
 */

/** The most the chain will amplify. Past this there is more hiss than film. */
export const MAX_BOOST = 3;

/** The equalizer's bands, in the order their sliders appear. */
export const EQ_BANDS = [
  { freq: 60, label: '60', type: 'lowshelf' },
  { freq: 250, label: '250', type: 'peaking' },
  { freq: 1000, label: '1K', type: 'peaking' },
  { freq: 4000, label: '4K', type: 'peaking' },
  { freq: 16000, label: '16K', type: 'highshelf' },
] as const;

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

export class AudioChain {
  private source: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private bands: BiquadFilterNode[] = [];
  /* Remembered for the same reason as the boost: the equalizer's settings are
     restored from disk before any file is open, and must survive until there
     is a graph to put them in. */
  private eqGains: number[] = EQ_BANDS.map(() => 0);
  private video: HTMLVideoElement | null = null;
  private routable = false;
  /** Remembered so a boost set before the file loaded is not lost. */
  private wanted = 1;

  /**
   * Name the element and say whether it may be routed.
   *
   * Called on every load, because a backend builds a new element per file.
   */
  attach(video: HTMLVideoElement, routable: boolean): void {
    if (this.video === video && this.routable === routable) return;
    // Unconditional: this is the handover to a new element, and the graph
    // belonging to the previous one is exactly what should go.
    this.release(null);
    this.video = video;
    this.routable = routable;
    /* Flat for the new file. The equalizer reports itself off when the element
       changes, and carrying the previous curve into a graph the menu says is
       off would make the two disagree. The boost is not reset with it: it is a
       property of the speakers, not of the film. */
    this.eqGains = EQ_BANDS.map(() => 0);
    if (this.wanted > 1) this.apply(this.wanted);
  }

  /**
   * Bring the graph into existence for a feature other than the amplifier.
   *
   * @returns whether the audio is now going through it.
   */
  async ensure(): Promise<boolean> {
    if (this.gain) return true;
    if (!this.routable || !this.video) return false;
    const ctx = context();
    if (!ctx) return false;
    /* Awaited rather than fired and forgotten. Resuming resolves on the
       gesture that is already in progress, but not before this function would
       have returned, and a caller told "no" turns into a menu item that does
       nothing the first time it is pressed and works the second. */
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }
    return this.build();
  }

  /**
   * Set one equalizer band, in decibels.
   *
   * Kept even when there is no graph yet, so the stored curve is not lost
   * between being restored and being connected.
   */
  setEqGain(index: number, db: number): void {
    if (index < 0 || index >= EQ_BANDS.length) return;
    this.eqGains[index] = db;
    const band = this.bands[index];
    if (band && sharedContext) {
      band.gain.setTargetAtTime(db, sharedContext.currentTime, 0.01);
    }
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
    // it, so a boost of exactly 1 never builds one on its own. Nothing is
    // gained by routing a signal through a chain that multiplies it by one.
    if (multiplier <= 1 && !this.gain) return;
    if (!this.routable || !this.video) return;

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

    /* Built flat, and flat biquads are arithmetically transparent, so they
       cost a little CPU and change nothing until the equalizer is used. That
       is worth more than the alternative, which is rebuilding the graph when
       the equalizer is switched on and having to re-capture an element that
       can only be captured once. */
    this.bands = EQ_BANDS.map((band, i) => {
      const filter = ctx.createBiquadFilter();
      filter.type = band.type;
      filter.frequency.value = band.freq;
      filter.gain.value = this.eqGains[i] ?? 0;
      if (band.type === 'peaking') filter.Q.value = 1.4;
      return filter;
    });

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

    /* The amplifier sits after the equalizer and before the limiter, which is
       the only order that works: a band raised by 8 dB is as capable of
       clipping as the amplifier is, so the limiter has to see the result of
       both, not of one. */
    let node: AudioNode = this.source;
    for (const band of this.bands) {
      node.connect(band);
      node = band;
    }
    node.connect(this.gain);
    this.gain.connect(limiter);
    limiter.connect(shaper);
    shaper.connect(ctx.destination);
    return true;
  }

  /**
   * Drop the graph, but only if it still belongs to the element named.
   *
   * A backend tears itself down after the next one has already attached, so an
   * unconditional release here would dismantle the graph that was just built
   * for the file now playing.
   */
  release(video: HTMLVideoElement | null): void {
    if (video && this.video !== video) return;
    try {
      this.source?.disconnect();
      this.gain?.disconnect();
      for (const band of this.bands) band.disconnect();
    } catch {
      /* Already gone. */
    }
    this.source = null;
    this.gain = null;
    this.bands = [];
    this.video = null;
    this.routable = false;
  }
}

/**
 * The application's audio graph.
 *
 * A singleton because an element can be captured only once and only one plays
 * at a time: a chain per feature is what made the equalizer and the amplifier
 * cancel each other out.
 */
export const audioChain = new AudioChain();
