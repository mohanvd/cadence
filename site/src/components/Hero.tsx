import { Download } from 'lucide-react';
import GithubMark from './GithubMark';
import { RELEASES_URL, INSTALLER_URL, INSTALLER_SIZE } from '../links';

/**
 * The top of the page, and the only thing most visitors will read.
 *
 * The download button carries its own facts rather than deferring them to a
 * section further down: what it costs, what it needs, and that it will not ask
 * for administrator rights. Those are the three questions that stop someone
 * clicking, and none of them is worth a scroll.
 */
export default function Hero() {
  return (
    <section className="ld-hero">
      <h1 className="ld-hero__title">
        A real video player
        <br />
        for the files that refuse to open
      </h1>

      <p className="ld-hero__sub">
        Cadence opens what other players hand back, from a native window, with
        every control one key away.
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
        Windows 10 and 11 · 64-bit · {INSTALLER_SIZE} · no administrator rights
      </p>
    </section>
  );
}
