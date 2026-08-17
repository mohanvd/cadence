import { Boxes, Languages, RotateCcw, Music, PictureInPicture2 } from 'lucide-react';

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
const FORMATS = ['MKV', 'MP4', 'MOV', 'WEBM', 'H.264', 'HEVC', 'VP9', 'AV1', 'AAC', 'OPUS', 'FLAC'];

const FEATURES = [
  {
    id: 'engine',
    icon: Boxes,
    span: 'lead',
    lede: 'The engine',
    title: 'Opens the files other players hand back',
    body: 'An MKV is rarely a codec problem, it is a container problem: the picture inside is one your hardware already decodes, the box around it is what nothing will unwrap. Cadence unwraps it, repackages the stream and feeds it straight to the hardware decoder.',
    note: 'A remux, not a transcode: packets are copied bit for bit, so nothing is re-encoded and quality is identical to the source.',
    formats: FORMATS,
    accent: true,
  },
  {
    id: 'subtitles',
    icon: Languages,
    span: 'wide',
    lede: 'Subtitles',
    title: 'Search that lands in sync',
    body: 'Find subtitles from inside the player. Your file is hashed before the search runs, so a match comes back timed to this exact encode instead of a release that drifts a second by the end.',
    note: 'Six languages, or drop in your own .srt / .vtt.',
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
    id: 'mini',
    icon: PictureInPicture2,
    span: 'third',
    lede: 'Mini player',
    title: 'Floats above everything',
    body: 'A real picture-in-picture window that stays on top while you work. The video element is moved rather than copied, so there is one decoder and one audio stream, never two drifting apart.',
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
