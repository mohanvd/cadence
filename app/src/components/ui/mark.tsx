import * as React from 'react';

/**
 * The Cadence mark, drawn in place.
 *
 * Five bars, tall to short, each as tall as a play triangle is at that point,
 * so their outline is the triangle. The geometry is the same as the one
 * `brand/source/artwork.py` draws the logo files from, and the numbers below
 * are its numbers: change them there first, and then here.
 *
 * Inline rather than an <img>, so it takes `currentColor` when asked to and
 * costs no request. `small` is the three-bar cut, for 24px and under, where
 * five bars close up.
 */

interface Cut {
  bars: number;
  height: number;
  pitch: number;
  weight: number;
}

const FULL: Cut = { bars: 5, height: 0.62, pitch: 0.135, weight: 0.088 };
const SMALL: Cut = { bars: 3, height: 0.66, pitch: 0.235, weight: 0.15 };

/** Bars on a 100-unit box, optically centred. See `bars` in artwork.py. */
function bars(cut: Cut): { x: number; y: number; w: number; h: number }[] {
  const box = 100;
  const height = cut.height * box;
  const pitch = cut.pitch * box;
  const weight = cut.weight * box;
  const span = (cut.bars - 1) * pitch + weight;
  const heights = Array.from({ length: cut.bars }, (_, i) => {
    const t = (i * pitch + weight / 2) / span;
    return Math.max(weight, height * (1 - t) + weight * t);
  });
  const total = heights.reduce((sum, h) => sum + h, 0);
  const mass = heights.reduce((sum, h, i) => sum + h * (i * pitch + weight / 2), 0) / total;
  const x0 = box / 2 - (span / 2 + mass) / 2;
  return heights.map((h, i) => ({ x: x0 + i * pitch, y: box / 2 - h / 2, w: weight, h }));
}

const GEOMETRY = { full: bars(FULL), small: bars(SMALL) };

export interface MarkProps extends Omit<React.SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
  /** Three bars instead of five, for small sizes. Chosen by size when unset. */
  cut?: 'full' | 'small';
  /** `signal` is the brand gradient; `current` takes the text colour. */
  tone?: 'signal' | 'current';
  /** Read aloud as "Cadence". Off by default: the mark usually sits beside the name. */
  label?: boolean;
}

export function Mark({ size = 24, cut, tone = 'signal', label = false, ...props }: MarkProps) {
  // useId's characters are not all legal in a url(#...) reference.
  const id = `cd-mark-${React.useId().replace(/[^\w-]/g, '')}`;
  const rects = GEOMETRY[cut ?? (size <= 24 ? 'small' : 'full')];
  const first = rects[0]!;
  const last = rects[rects.length - 1]!;
  const fill = tone === 'signal' ? `url(#${id})` : 'currentColor';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label ? 'img' : undefined}
      aria-label={label ? 'Cadence' : undefined}
      aria-hidden={label ? undefined : true}
      {...props}
    >
      {tone === 'signal' && (
        <defs>
          <linearGradient
            id={id}
            gradientUnits="userSpaceOnUse"
            x1={first.x}
            y1={first.y}
            x2={last.x + last.w}
            y2={first.y + first.h}
          >
            <stop offset="0" style={{ stopColor: 'var(--cd-amber)' }} />
            <stop offset="0.55" style={{ stopColor: 'var(--cd-ember-500)' }} />
            <stop offset="1" style={{ stopColor: 'var(--cd-flame)' }} />
          </linearGradient>
        </defs>
      )}
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={r.w / 2} fill={fill} />
      ))}
    </svg>
  );
}
