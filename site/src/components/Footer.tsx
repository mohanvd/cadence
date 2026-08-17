/**
 * The name at the size of a sign, and nothing else.
 *
 * The player's own footer measures the word at runtime and solves for the font
 * size that fills the line, because that name has been changed three times and
 * a hardcoded value would be wrong after the next one. This page cannot do
 * that: it ships no JavaScript, and adding a `client:` directive to run one
 * measurement would start sending React again for the sake of a footer.
 *
 * Here the word is fixed, so the ratio can be too. 0.408 is "Cadence" in
 * Agbalumo, measured once: width in em at a known size, which is a property of
 * the word and the typeface rather than of the viewport. CSS holds it from
 * there and the browser handles every resize.
 */
export default function Footer() {
  return (
    <footer className="xn-footer">
      <p className="xn-footer__wordmark" aria-hidden>
        <span className="xn-footer__word ld-footer__word">Cadence</span>
      </p>
    </footer>
  );
}
