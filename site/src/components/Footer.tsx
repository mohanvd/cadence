import AuvaMark from './AuvaMark';
import GithubMark from './GithubMark';
import { CONTACT_URL, RELEASES_URL, REPO_URL } from '../links';

/**
 * The name at the size of a sign, over the few links that had nowhere else to
 * go.
 *
 * The player's own footer measures the word at runtime and solves for the font
 * size that fills the line, because that name has been changed three times and
 * a hardcoded value would be wrong after the next one. This page cannot do
 * that: it ships no JavaScript, and adding a `client:` directive to run one
 * measurement would start sending React again for the sake of a footer.
 *
 * Here the word is fixed, so the ratio can be too. 3.838 is the width of
 * "Cadence" in Agbalumo expressed in em: measured, not guessed, and confirmed
 * against the font's own metrics. CSS holds it from there and the browser
 * handles every resize. See `landing.css` for the two numbers that come out of
 * those metrics and what each one is for.
 */
export default function Footer() {
  return (
    <footer className="xn-footer">
      <div className="xn-footer__links">
        {/* "Built by" is not the link. Only the mark is, because only the mark
            is Auva. Wrapping the whole phrase made two ordinary English words
            part of somebody's logotype, and made the hover target a sentence. */}
        <span className="xn-footer__credit">
          Built by
          <a className="xn-footer__auva" href="https://auva.dev" aria-label="Auva">
            <AuvaMark className="xn-footer__auva-mark" />
          </a>
        </span>

        <nav className="xn-footer__nav">
          <a className="xn-footer__link" href={RELEASES_URL}>
            Releases
          </a>
          <a className="xn-footer__link" href={CONTACT_URL}>
            Contact
          </a>
          <a className="xn-footer__link" href={REPO_URL} aria-label="Cadence releases on GitHub">
            <GithubMark size={15} />
          </a>
        </nav>
      </div>

      {/* Aria-hidden, because to a screen reader this is the word "Cadence"
          read out a second time at the end of a page that has already said it
          in the navigation. It is a sign, not a heading. */}
      <p className="xn-footer__wordmark" aria-hidden>
        <span className="xn-footer__word">Cadence</span>
      </p>
    </footer>
  );
}
