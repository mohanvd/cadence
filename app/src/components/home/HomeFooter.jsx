import { useLayoutEffect, useRef } from 'react';

const WORDMARK = 'Cadence';

/** Size the word is measured at. Any value works; this one keeps the ratio
 *  readable in devtools. */
const PROBE_PX = 100;

/**
 * The name at the size of a sign, and nothing else.
 *
 * The size is measured rather than hardcoded. A fixed `cqw` value encodes one
 * particular word in one particular face, so it overflows the moment either
 * changes, which is what happened when "Xenon" became "Cadence".
 *
 * What gets measured is the word's width *in em* at a known font size. That
 * ratio is a property of the word and the typeface, not of the viewport, so it
 * is measured once and handed to CSS as `calc(100cqw / ratio)`. Resizing is
 * then the browser's job. An observer re-fitting on every resize would do the
 * same work worse: it needs frames to be delivered, and re-runs layout on each
 * one, to arrive at the number CSS can hold on its own.
 */
/**
 * @param {{ version?: string }} props `version` is passed by the application
 *   and omitted by the landing page. The site is deployed on its own schedule,
 *   so the version it was built from is not necessarily the one on the
 *   releases page, and a number that is confidently wrong is worse in a bug
 *   report than no number at all.
 */
export default function HomeFooter({ version }) {
  const wordRef = useRef(null);

  useLayoutEffect(() => {
    const word = wordRef.current;
    if (!word) return;

    const fit = () => {
      word.style.fontSize = `${PROBE_PX}px`;
      const natural = word.getBoundingClientRect().width;
      if (!natural) return;
      // 100cqw is the footer's content box, which is exactly the space the
      // word has to fill.
      word.style.fontSize = `calc(100cqw / ${(natural / PROBE_PX).toFixed(4)})`;
    };

    fit();

    // The first measurement can land before the webfont arrives, in which case
    // it measured the fallback face. Re-fit once the real one is ready.
    document.fonts?.ready.then(fit).catch(() => {});
  }, []);

  return (
    <footer className="xn-footer">
      <p className="xn-footer__wordmark" aria-hidden>
        <span className="xn-footer__word" ref={wordRef}>
          {WORDMARK}
        </span>
      </p>
      {/* Small, and the first thing a bug report asks for. */}
      {version && <p className="xn-footer__version">Version {version}</p>}
    </footer>
  );
}
