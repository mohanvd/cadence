import { ArrowRight, Download } from 'lucide-react';
import GithubMark from './GithubMark';
import { RELEASES_URL, INSTALLER_URL } from '../links';

/**
 * The top of the page, and the only thing most visitors will read.
 *
 * Two words, because the brand's whole promise fits in two words, and a
 * sentence underneath that says how: the decoder is in the box. The line used
 * to be "A real media player for the files that refuse to open", which said the
 * same thing at three times the length and spent its first half defending the
 * word "real".
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
    <section className="hero">
      {/* A link rather than a badge, because a pill announcing a feature and
          then not going to it is an advert. The tag is the version, not "New":
          the library is several releases old, and a page that calls everything
          new teaches its reader to skip the word. */}
      <a className="hero__pill" href="#music">
        <span className="hero__pill-tag">{__APP_VERSION__}</span>
        Films and music, in one window
        <ArrowRight size={13} strokeWidth={2.2} aria-hidden />
      </a>

      <h1 className="hero__title">
        Everything <span className="hero__title-accent">plays.</span>
      </h1>

      <p className="hero__sub">
        Cadence carries its own decoder, so the MKV that stalls everywhere else
        plays here. Your music lives in the same window, and every control is one
        key away.
      </p>

      <div className="hero__actions">
        <a className="button button--primary" href={INSTALLER_URL}>
          <Download size={17} strokeWidth={2.2} aria-hidden />
          Download for Windows
        </a>
        <a className="button button--ghost" href={RELEASES_URL}>
          <GithubMark size={15} />
          All releases
        </a>
      </div>

      <p className="hero__meta">
        Free · Windows 10 and 11 · 64-bit · {installerSize} · no administrator rights
      </p>
    </section>
  );
}
