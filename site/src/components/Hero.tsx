import { ArrowRight, Download } from 'lucide-react';
import GithubMark from './GithubMark';
import { RELEASES_URL, INSTALLER_URL } from '../links';

/**
 * The top of the page, and the only thing most visitors will read.
 *
 * The download button carries its own facts rather than deferring them to a
 * section further down: what it costs, what it needs, and that it will not ask
 * for administrator rights. Those are the three questions that stop someone
 * clicking, and none of them is worth a scroll.
 *
 * The size arrives as a prop because it is measured, not written down: the
 * page reads it off the release the button links to. See `resolveInstallerSize`.
 */
export default function Hero({ installerSize }: { installerSize: string }) {
  return (
    <section className="ld-hero">
      {/* A link rather than a badge, because a pill announcing a feature and
          then not going to it is an advert. It carried a small pulsing accent
          dot and does not any more: a coloured dot throbbing beside the words
          "now" is the house style of every product announcement of the last two
          years, and it made a true sentence read like a generated one. */}
      <a className="ld-pill" href="#music">
        Now plays your music library
        <ArrowRight size={13} strokeWidth={2.2} aria-hidden />
      </a>

      <h1 className="ld-hero__title">
        A real media player
        <br />
        for the files that refuse to open
      </h1>

      <p className="ld-hero__sub">
        Cadence carries its own decoder, so the MKV that stalls everywhere else
        simply plays. Your music lives in the same window, and every control is
        one key away.
      </p>

      <div className="ld-hero__actions">
        <a className="ld-cta" href={INSTALLER_URL}>
          <Download size={17} strokeWidth={2.2} aria-hidden />
          Download for Windows
        </a>
        <a className="ld-ghost" href={RELEASES_URL}>
          <GithubMark size={15} />
          All releases
        </a>
      </div>

      <p className="ld-hero__meta">
        Windows 10 and 11 · 64-bit · {installerSize} · no administrator rights
      </p>
    </section>
  );
}
