import { Download } from 'lucide-react';
import { INSTALLER_URL } from '../links';

/**
 * The second and last offer of the download.
 *
 * Twice on the page and no more: once at the top for whoever arrived already
 * convinced, once here for whoever read what was in between. A page that
 * repeats its call to action every screenful is saying it does not trust the
 * copy between them.
 */
export default function Closing() {
  return (
    <section className="ld-close">
      <h2 className="ld-close__title">Open a file and it plays</h2>
      <a className="ld-cta" href={INSTALLER_URL}>
        <Download size={17} strokeWidth={2.2} aria-hidden />
        Download for Windows
      </a>
      <p className="ld-close__meta">
        macOS and Linux are not built yet. The shell supports them; nobody has
        done the packaging.
      </p>
    </section>
  );
}
