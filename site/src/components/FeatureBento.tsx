import { Boxes, Captions, RotateCcw, Music, Cpu } from 'lucide-react';

/**
 * The five things worth stopping for.
 *
 * A page that lists thirty features gives each of them a thirtieth of the
 * visitor's attention. So it is tiered instead: the handful of capabilities
 * worth choosing this player for get a card with room to explain themselves,
 * and the long tail goes to `CapabilityList` as a scannable index.
 *
 * The grid is twelve columns, split 7/5 then 4/4/4. Two unequal cards on the
 * first row establish which one is the headline without needing a badge to say
 * so; three equal cards below settle back into a rhythm.
 */

/** Containers and codecs the engine maps. Order runs common → exotic. */
const FORMATS = ['MKV', 'MP4', 'AVI', 'MOV', 'WMV', 'FLV', 'TS', 'M2TS', 'MPEG', 'WEBM'];

const FEATURES = [
  {
    id: 'engine',
    icon: Boxes,
    span: 'lead',
    lede: 'The engine',
    title: 'Opens the files other players hand back',
    body: 'An MKV is rarely a codec problem, it is a container problem: the picture inside is one your hardware already decodes, the box around it is what nothing will unwrap. Cadence carries FFmpeg, unwraps the container itself and hands the stream straight to the hardware decoder.',
    note: 'A repackage, not a transcode: H.264, HEVC and AV1 are copied through bit for bit, so nothing is re-encoded and quality is identical to the source.',
    formats: FORMATS,
    accent: true,
  },
  {
    id: 'codecs',
    icon: Cpu,
    span: 'wide',
    lede: 'Codecs',
    title: 'The card does the decoding',
    body: 'HEVC, AV1 and H.264 reach the decoder untouched, which is the whole point of unwrapping the container rather than re-encoding what is inside it. Only a codec no browser engine will take, AC-3 and DTS among them, is converted on the way past.',
    note: 'When something does have to be converted, the encoder comes from the graphics card: NVENC, Quick Sync or AMF.',
  },
  {
    id: 'memory',
    icon: RotateCcw,
    span: 'third',
    lede: 'Memory',
    title: 'Picks up where you stopped',
    body: 'Position, volume and speed are remembered per file. Reopen a lecture and it simply continues, no modal asking permission first, just a quiet way to start over.',
  },
  {
    id: 'music',
    icon: Music,
    span: 'third',
    lede: 'Music mode',
    title: 'Audio without the black rectangle',
    body: 'Switches the picture off, stops compositing frames and releases the wake lock. It engages by itself for files with no video track, so an album never plays into a void.',
  },
  {
    id: 'subtitles',
    icon: Captions,
    span: 'third',
    lede: 'Subtitles',
    title: 'Timed to your copy, not a release',
    body: 'Drop an .srt or .vtt onto the picture. A downloaded subtitle is usually out by a second or two, so the timing is adjustable while the film runs rather than something to fix and reload.',
  },
];

export default function FeatureBento() {
  return (
    <section className="xn-section">
      <header className="xn-section__head">
        <h2 className="xn-section__title">What it does</h2>
        <span className="xn-section__meta">Five things worth stopping for</span>
      </header>

      <div className="xn-bento">
        {FEATURES.map(({ id, icon: Icon, span, lede, title, body, note, formats, accent }) => (
          <article
            key={id}
            className={`xn-feat xn-feat--${span}${accent ? ' xn-feat--accent' : ''}`}
          >
            <span className="xn-feat__icon">
              <Icon size={17} strokeWidth={1.6} />
            </span>

            <p className="xn-feat__lede">{lede}</p>
            <h3 className="xn-feat__title">{title}</h3>
            <p className="xn-feat__body">{body}</p>

            {note && <p className="xn-feat__note">{note}</p>}

            {formats && (
              <p className="xn-feat__formats">
                {formats.map((format) => (
                  <span key={format} className="xn-chip">
                    {format}
                  </span>
                ))}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
