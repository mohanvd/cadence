/**
 * The Auva logotype: ∧ ∪ ∨ ∧.
 *
 * Copied from `src/components/ui/Logo.tsx` in the Auva project rather than
 * imported, for the same reason everything else on this page is copied: `site/`
 * is what Vercel uploads, and it cannot read a file from a different repository
 * on a different machine. The paths and the optical kerning below are that
 * file's, unchanged, and it is what this is read against if the mark ever
 * changes.
 *
 * Drawn rather than set in type, which is the point: the mark is four
 * mathematical symbols, not the word "Auva" in a typeface, so writing it out as
 * text would be a different logo that happens to be spelled the same.
 *
 * Takes its colour from whatever it sits in, so the footer's hover state
 * reaches it without this needing to know about the footer.
 */
export default function AuvaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 224 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        height: '0.78em',
        width: 'auto',
        display: 'inline-block',
        verticalAlign: '-0.04em',
      }}
      aria-label="Auva"
      role="img"
    >
      {/* ∧  A */}
      <path
        d="M6 50 L27 6 L48 50"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* ∪  U */}
      <path
        d="M64 6 L64 33 C64 50 85 50 85 50 C85 50 106 50 106 33 L106 6"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />

      {/* ∨  V */}
      <path
        d="M122 6 L143 50 L164 6"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* ∧  A. A tighter gap before this one: two diagonals facing each other
          already read as further apart than they are. */}
      <path
        d="M176 50 L197 6 L218 50"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
