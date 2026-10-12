import AuvaMark from './AuvaMark';
import GithubMark from './GithubMark';
import Mark from './Mark';
import {
  BRAND_URL,
  CHANGELOG_URL,
  CONTACT_EMAIL,
  CONTACT_URL,
  INSTALLER_URL,
  ISSUES_URL,
  LICENCE_URL,
  RELEASES_URL,
  REPO_URL,
  SECURITY_URL,
} from '../links';

const COLUMNS = [
  {
    title: 'Get it',
    links: [
      { label: 'Download for Windows', href: INSTALLER_URL },
      { label: 'All releases', href: RELEASES_URL },
      { label: 'Changelog', href: CHANGELOG_URL },
    ],
  },
  {
    title: 'Project',
    links: [
      { label: 'Source', href: REPO_URL },
      { label: 'Report a problem', href: ISSUES_URL },
      { label: 'Security', href: SECURITY_URL },
      { label: 'Brand', href: BRAND_URL },
    ],
  },
  {
    title: 'Contact',
    links: [
      { label: CONTACT_EMAIL, href: CONTACT_URL },
      { label: 'Licence', href: LICENCE_URL },
    ],
  },
];

/**
 * The end of the page: who made it, where everything else is, and the name at
 * the size of a sign.
 *
 * The name used to be the whole footer, in a script face, with two links above
 * it. It was the most memorable thing on the page and it was not the brand:
 * the face appeared nowhere else, and the links people come to a footer for,
 * the changelog, the issue tracker, the licence, had nowhere to go.
 *
 * The giant name is sized by CSS alone, because this page ships no JavaScript.
 * 4.05 is the width of "Cadence" in Schibsted Grotesk Bold, at the tracking it
 * is set with, in em: measured from the font, not guessed. See `landing.css`.
 */
export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__top">
        <div className="footer__brand">
          <a className="lockup lockup--footer" href="#top" aria-label="Cadence, back to the top">
            <Mark size={26} cut="small" />
            <span className="lockup__word">Cadence</span>
          </a>
          <p className="footer__line">Everything plays.</p>
          <p className="footer__desc">
            A keyboard-first media player for Windows. Films and music in one
            quiet window.
          </p>
        </div>

        <nav className="footer__columns" aria-label="Footer">
          {COLUMNS.map(({ title, links }) => (
            <div key={title} className="footer__column">
              <p className="footer__heading">{title}</p>
              <ul>
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <a className="footer__link" href={href}>
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="footer__base">
        {/* "Built by" is not the link. Only the mark is, because only the mark
            is Auva. */}
        <span className="footer__credit">
          Built by
          <a className="footer__auva" href="https://auva.dev" aria-label="Auva">
            <AuvaMark className="footer__auva-mark" />
          </a>
        </span>
        <span className="footer__fine">
          © 2026 Mohanad Tarek · Cadence {__APP_VERSION__}
          <a className="footer__github" href={REPO_URL} aria-label="Cadence on GitHub">
            <GithubMark size={15} />
          </a>
        </span>
      </div>

      {/* Aria-hidden, because to a screen reader this is the word "Cadence"
          read out a second time at the end of a page that has already said it.
          It is a sign, not a heading. */}
      <p className="footer__sign" aria-hidden>
        <span>Cadence</span>
      </p>
    </footer>
  );
}
