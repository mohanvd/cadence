import { FileCode2, WifiOff, ScrollText, RefreshCw } from 'lucide-react';
import { REPO_URL } from '../links';

/**
 * The things a player has to promise before anyone lets it near their files.
 *
 * Stated plainly and near the second download prompt, because they are the
 * objections that stop an install: where the files go, what it talks to, who
 * can read the code, and what happens the next time it changes.
 */
const CLAIMS = [
  {
    icon: WifiOff,
    title: 'Your files stay on your disk',
    body: 'Cadence reads a file from where it already is. Nothing is uploaded, copied to a service, or sent anywhere at all.',
  },
  {
    icon: RefreshCw,
    title: 'Updates are signed and quiet',
    body: 'A new version is verified against a key built into the app, downloaded in the background, and applied when you restart. Never mid-film.',
  },
  {
    icon: FileCode2,
    title: 'The source is the whole thing',
    body: 'Every line that ships is on GitHub, and the installer is built from it in public by a workflow anyone can read.',
  },
  {
    icon: ScrollText,
    title: 'MIT, with no asterisk',
    body: 'Use it, fork it, ship it inside something else. Third-party components keep their own terms, listed in the repository.',
  },
];

export default function OpenSource() {
  return (
    <section className="xn-section">
      <header className="xn-section__head">
        <h2 className="xn-section__title">No catch</h2>
        <span className="xn-section__meta">
          <a className="ld-inline-link" href={REPO_URL}>
            Read the source
          </a>
        </span>
      </header>

      <ul className="ld-claims">
        {CLAIMS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="ld-claim">
            <span className="ld-claim__icon">
              <Icon size={16} strokeWidth={1.6} aria-hidden />
            </span>
            <h3 className="ld-claim__title">{title}</h3>
            <p className="ld-claim__body">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
