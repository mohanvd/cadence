import { Download } from './icons';
import { INSTALLER_URL } from '../links';
import Mark from './Mark';

/**
 * The second and last offer of the download.
 *
 * Twice on the page and no more: once at the top for whoever arrived already
 * convinced, once here for whoever read what was in between. A page that
 * repeats its call to action every screenful is saying it does not trust the
 * copy between them.
 *
 * It used to draw as a box floating in the middle of the column, which was not
 * a decision: the column centres its children and this section never claimed a
 * width, so it shrank to fit its own text and its rule-off line stopped a third
 * of the way across the page. The width is now stated, and the finale is a band
 * that runs the full measure with the light gathered behind it.
 */
export default function Closing({ installerSize }: { installerSize: string }) {
  return (
    <section className="ld-close">
      <div className="ld-close__glow" aria-hidden />

      <span className="ld-close__mark" aria-hidden>
        <Mark size={56} cut="full" />
      </span>

      <h2 className="ld-close__title">Open a file and it plays</h2>

      <p className="ld-close__sub">
        No account, no administrator rights, and nothing to configure before the
        first thing you drop on it works.
      </p>

      <a className="button button--primary button--lg" href={INSTALLER_URL}>
        <Download size={17} aria-hidden />
        Download for Windows
      </a>

      <p className="ld-close__meta">
        Free · Windows 10 and 11 · 64-bit · {installerSize}
      </p>

      <p className="ld-close__aside">
        macOS and Linux are not built yet. The shell supports them; nobody has
        done the packaging.
      </p>
    </section>
  );
}
