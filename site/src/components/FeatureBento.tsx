import { Boxes, Captions, Cpu, RotateCcw, Tags } from 'lucide-react';

/**
 * The five things worth stopping for.
 *
 * A page that lists thirty features gives each of them a thirtieth of the
 * visitor's attention. So it is tiered instead: the handful of capabilities
 * worth choosing this player for get a card with room to explain themselves,
 * the library gets a section of its own, and the long tail goes to
 * `CapabilityList` as a scannable index.
 *
 * The grid is twelve columns, split 7/5 then 4/4/4. Two unequal cards on the
 * first row establish which one is the headline without needing a badge to say
 * so; three equal cards below settle back into a rhythm.
 */

/** Containers the engine maps. Order runs common → exotic. */
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
    id: 'subtitles',
    icon: Captions,
    span: 'third',
    lede: 'Subtitles',
    title: 'Every track the file already carries',
    body: 'Listed by name and language: plain text, styled ASS drawn by libass, or Blu-ray pictures. Drop an .srt or .vtt on top instead, and nudge its timing while the film runs rather than fixing the file and reloading.',
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
    id: 'tags',
    icon: Tags,
    span: 'third',
    lede: 'Tags',
    title: 'Fix what a file says it is',
    body: 'Title, artist, album, year, sleeve, for one track or a whole record. The correction is written into the file itself, so every other player sees it too, and nothing is re-encoded to do it.',
  },
];

export default function FeatureBento() {
  return (
    <section className="xn-section" id="features">
      <header className="xn-section__head rise">
        <h2 className="xn-section__title">
          Built around the part everything else gets wrong
        </h2>
      </header>

      <div className="xn-bento">
        {FEATURES.map(({ id, icon: Icon, span, lede, title, body, note, formats, accent }) => (
          <article
            key={id}
            className={`xn-feat rise xn-feat--${span}${accent ? ' xn-feat--accent' : ''}`}
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
