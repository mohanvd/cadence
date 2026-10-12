/**
 * The Cadence icon set.
 *
 * Every icon the player and the site draw, on one 24-unit grid, in one hand.
 * `npm run brand` writes this set into both projects and renders a preview of
 * it into the brand guide; nothing else draws an icon.
 *
 * The rules each glyph is drawn to:
 *
 * - **One stroke.** Lines are stroked, never filled, at a weight the component
 *   sets in screen pixels, so a 14px icon and a 24px icon carry the same line.
 *   Round caps and round joins, the same roundness as the mark's bars.
 * - **Keylines.** The live area is 3 to 21. A circle is 18 across, a square
 *   16, an upright rectangle 14 by 18 and a wide one 18 by 14. Shapes of
 *   different kinds look the same size at those numbers rather than at equal
 *   ones: a circle drawn as large as a square looks smaller than it.
 * - **Transport is solid.** Play, pause and the skips are filled, and built
 *   from the mark's own pieces: rounded bars, and a play triangle with the
 *   corners turned. Solid reads as "the thing to press" against video, which a
 *   hairline does not.
 * - **Optical centring.** A shape is centred on where its weight is, not on
 *   its box: the play triangle sits a unit right of the box's centre, as the
 *   mark does.
 *
 * Each glyph is the inside of an `<svg viewBox="0 0 24 24">` whose defaults
 * are `fill="none" stroke="currentColor"` with round caps and joins. A piece
 * that has to be solid says `fill="currentColor" stroke="none"` itself.
 */

const n = (value) => Number(value.toFixed(2));
const line = (d) => `<path d="${d}"/>`;
const solid = (d) => `<path d="${d}" fill="currentColor" stroke="none"/>`;
const circle = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const dot = (cx, cy, r = 1.1) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;
const rect = (x, y, w, h, r) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const bar = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" fill="currentColor" stroke="none"/>`;

/**
 * A triangle with its corners rounded, pointing right or left, as solid path
 * data. The corners are arcs of radius `r`, which is what lets play and the
 * skips sit beside the mark's rounded bars without looking like a different
 * family.
 */
function roundedTriangle(points, r) {
  const pts = points.map(([x, y]) => ({ x, y }));
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i + pts.length - 1) % pts.length];
    const cur = pts[i];
    const next = pts[(i + 1) % pts.length];
    const toPrev = { x: prev.x - cur.x, y: prev.y - cur.y };
    const toNext = { x: next.x - cur.x, y: next.y - cur.y };
    const lp = Math.hypot(toPrev.x, toPrev.y);
    const ln = Math.hypot(toNext.x, toNext.y);
    const angle = Math.acos((toPrev.x * toNext.x + toPrev.y * toNext.y) / (lp * ln));
    const cut = r / Math.tan(angle / 2);
    const a = { x: cur.x + (toPrev.x / lp) * cut, y: cur.y + (toPrev.y / lp) * cut };
    const b = { x: cur.x + (toNext.x / ln) * cut, y: cur.y + (toNext.y / ln) * cut };
    d += `${i === 0 ? 'M' : 'L'}${n(a.x)} ${n(a.y)}Q${n(cur.x)} ${n(cur.y)} ${n(b.x)} ${n(b.y)}`;
  }
  return `${d}Z`;
}

/** A regular outline with alternating radii, closed: the gear, the seal. */
function star(cx, cy, points, outer, inner, rotation = 0) {
  const verts = [];
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = rotation + (Math.PI * i) / points;
    verts.push(`${n(cx + radius * Math.cos(angle))} ${n(cy + radius * Math.sin(angle))}`);
  }
  return `M${verts.join('L')}Z`;
}

/** A gear: flat-topped teeth, the joins rounded by the stroke. */
function gear(cx, cy, teeth, outer, inner, toothWidth) {
  const verts = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const mid = -Math.PI / 2 + i * step;
    const half = toothWidth / 2;
    for (const [angle, radius] of [
      [mid - half * 1.35, inner],
      [mid - half, outer],
      [mid + half, outer],
      [mid + half * 1.35, inner],
    ]) {
      verts.push(`${n(cx + radius * Math.cos(angle))} ${n(cy + radius * Math.sin(angle))}`);
    }
  }
  return `M${verts.join('L')}Z`;
}

const PLAY = roundedTriangle([[7.6, 5.2], [19.2, 12], [7.6, 18.8]], 1.6);

export const GLYPHS = {
  /* ── Transport ── */
  play: solid(PLAY),
  pause: bar(6.5, 5, 4, 14) + bar(13.5, 5, 4, 14),
  previous: bar(5, 6, 2.6, 12) + solid(roundedTriangle([[19, 6.4], [9.4, 12], [19, 17.6]], 1.3)),
  next: bar(16.4, 6, 2.6, 12) + solid(roundedTriangle([[5, 6.4], [14.6, 12], [5, 17.6]], 1.3)),
  rewind: line('M12 4.75a7.5 7.5 0 1 1-7.5 7.5') + line('M14.5 2.25 12 4.75l2.5 2.5'),
  forward: line('M12 4.75a7.5 7.5 0 1 0 7.5 7.5') + line('M9.5 2.25 12 4.75l-2.5 2.5'),
  shuffle:
    line('M3.5 7.5h2.6c2 0 3.2 1 4.3 2.6l3.2 3.8c1.1 1.6 2.3 2.6 4.3 2.6h2.6') +
    line('M3.5 16.5h2.6c1.4 0 2.4-.5 3.3-1.4') +
    line('M14.6 8.9c.9-.9 1.9-1.4 3.3-1.4h2.6') +
    line('M18 5l2.5 2.5L18 10') +
    line('M18 14l2.5 2.5L18 19'),
  repeat:
    line('M17 3.5l2.5 2.5L17 8.5') +
    line('M19.5 6H8a4.5 4.5 0 0 0-4.5 4.5v1') +
    line('M7 20.5 4.5 18 7 15.5') +
    line('M4.5 18H16a4.5 4.5 0 0 0 4.5-4.5v-1'),
  repeatOne:
    line('M17 3.5l2.5 2.5L17 8.5') +
    line('M19.5 6H8a4.5 4.5 0 0 0-4.5 4.5v1') +
    line('M7 20.5 4.5 18 7 15.5') +
    line('M4.5 18H16a4.5 4.5 0 0 0 4.5-4.5v-1') +
    line('M11 10.6 12.6 9.5v5'),

  /* ── Sound ── */
  volumeHigh:
    line('M3.5 10a1 1 0 0 1 1-1h2.4L11 5.6v12.8L6.9 15H4.5a1 1 0 0 1-1-1z') +
    line('M14.6 9.2a4 4 0 0 1 0 5.6') +
    line('M17.4 6.4a8 8 0 0 1 0 11.2'),
  volumeLow:
    line('M3.5 10a1 1 0 0 1 1-1h2.4L11 5.6v12.8L6.9 15H4.5a1 1 0 0 1-1-1z') +
    line('M14.6 9.2a4 4 0 0 1 0 5.6'),
  volumeOff:
    line('M3.5 10a1 1 0 0 1 1-1h2.4L11 5.6v12.8L6.9 15H4.5a1 1 0 0 1-1-1z') +
    line('M15 9.5l5 5') +
    line('M20 9.5l-5 5'),
  // Sliders standing up: what an equaliser looks like on a desk.
  equalizer:
    line('M6 4v7') + line('M6 15v5') + circle(6, 13, 2) +
    line('M12 4v2') + line('M12 10v10') + circle(12, 8, 2) +
    line('M18 4v9') + line('M18 17v3') + circle(18, 15, 2),
  // The mark's own bars, as a waveform: anything that is sound.
  waves: line('M4 10v4') + line('M8 7v10') + line('M12 4v16') + line('M16 7v10') + line('M20 10v4'),
  audioLines: line('M4 10v4') + line('M8 7v10') + line('M12 4v16') + line('M16 7v10') + line('M20 10v4'),
  louder: line('M12 5.5v13') + line('M5.5 12h13'),

  /* ── The picture ── */
  fullscreen:
    line('M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9') +
    line('M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9') +
    line('M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15') +
    line('M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15'),
  exitFullscreen:
    line('M9 4v2.5A2.5 2.5 0 0 1 6.5 9H4') +
    line('M20 9h-2.5A2.5 2.5 0 0 1 15 6.5V4') +
    line('M15 20v-2.5a2.5 2.5 0 0 1 2.5-2.5H20') +
    line('M4 15h2.5A2.5 2.5 0 0 1 9 17.5V20'),
  // Two lines of text at the foot of a picture, the longer one first.
  captions: rect(3, 5.5, 18, 13, 3) + line('M7.5 12.5h9') + line('M9.5 15.5h5'),
  // Sliders lying down: adjusting the picture.
  filters:
    line('M4 7h9') + line('M17 7h3') + circle(15, 7, 2) +
    line('M4 12h3') + line('M11 12h9') + circle(9, 12, 2) +
    line('M4 17h11') + line('M19 17h1') + circle(17, 17, 2),
  zoom: circle(10.5, 10.5, 6.5) + line('M15.3 15.3 20 20') + line('M10.5 8v5') + line('M8 10.5h5'),
  screenshot:
    line('M4 9a2 2 0 0 1 2-2h1.8l1.5-2.2h5.4L16.2 7H18a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z') +
    circle(12, 13, 3.5),
  camera:
    line('M4 9a2 2 0 0 1 2-2h1.8l1.5-2.2h5.4L16.2 7H18a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z') +
    circle(12, 13, 3.5),
  contrast: circle(12, 12, 9) + solid('M12 3a9 9 0 0 1 0 18z'),
  frame: line('M8 3.5v12.5a1 1 0 0 0 1 1h11.5') + line('M3.5 8H15a1 1 0 0 1 1 1v11.5'),
  images: rect(6.5, 7, 14, 11, 2) + line('M3.5 14.5V6a2 2 0 0 1 2-2h11') + line('M9.5 15.5l2.8-2.8 2.2 2.2 1.5-1.5 2.5 2.5'),
  lightbulb:
    line('M9.5 18h5') + line('M10.5 21h3') +
    line('M12 3.5a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1v.6h5v-.6c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3.5z'),
  speed:
    line('M4.4 17a8.5 8.5 0 1 1 15.2 0') + line('M12 14l3.8-4.3') + dot(12, 14, 1.4) + line('M12 6v1') + line('M6.9 8.4l.7.7') + line('M17.1 8.4l-.7.7'),

  /* ── Time ── */
  clock: circle(12, 12, 9) + line('M12 7.5V12l3 2'),
  timer: circle(12, 13, 8) + line('M12 13V9') + line('M10 2.5h4') + line('M18.4 5.6l1.1-1.1'),
  sleep: line('M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1z'),
  bookmark: line('M7 3.5h10a1 1 0 0 1 1 1v15.2l-6-3.9-6 3.9V4.5a1 1 0 0 1 1-1z'),

  /* ── The library ── */
  music: line('M9 17.5V6l10-2v11.5') + circle(6.5, 17.5, 2.5) + circle(16.5, 15.5, 2.5),
  album: circle(12, 12, 9) + circle(12, 12, 2.5) + line('M12 6.5a5.5 5.5 0 0 1 5.5 5.5'),
  artist: circle(12, 8, 3.75) + line('M4.5 20a7.5 7.5 0 0 1 15 0'),
  queue: line('M4 6.5h11') + line('M4 11h11') + line('M4 15.5h6') + line('M18.5 9.5v8') + circle(16.5, 17.5, 2) + line('M18.5 9.5l2.5-.8'),
  listVideo: line('M3.5 6.5h12') + line('M3.5 11h12') + line('M3.5 15.5h6') + solid(roundedTriangle([[14, 13.8], [20, 17.25], [14, 20.7]], 0.9)),
  folder: line('M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.2h7.4a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z'),
  folderInput:
    line('M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.2h7.4a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z') +
    line('M8.5 13.5h6') + line('M12.5 11l2.5 2.5-2.5 2.5'),
  tags:
    line('M3.5 5.5v5.2a2 2 0 0 0 .6 1.4l7.8 7.8a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8l-7.8-7.8a2 2 0 0 0-1.4-.6H5.5a2 2 0 0 0-2 2z') +
    dot(8, 8, 1.3),
  // The Files tab: a picture with play on it, the drop card's subject.
  dropTarget: rect(3.5, 4.5, 17, 15, 3.5) + solid(roundedTriangle([[10, 8.8], [15.5, 12], [10, 15.2]], 0.9)),

  /* ── Moving around ── */
  back: line('M19 12H5') + line('M11 6l-6 6 6 6'),
  forwardArrow: line('M5 12h14') + line('M13 6l6 6-6 6'),
  submenu: line('M9.5 6l6 6-6 6'),
  search: circle(10.5, 10.5, 6.5) + line('M15.3 15.3 20 20'),
  link:
    line('M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1') +
    line('M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1'),
  download: line('M12 4v11') + line('M7 10.5l5 5 5-5') + line('M5 19.5h14'),
  refresh:
    line('M19.5 9.5A8 8 0 0 0 5.4 7.5') + line('M4.5 14.5a8 8 0 0 0 14.1 2') +
    line('M19.5 4.5v5h-5') + line('M4.5 19.5v-5h5'),
  monitorDown: rect(3, 4, 18, 12, 2) + line('M8.5 20h7') + line('M12 16v4') + line('M12 7v5') + line('M9.5 9.5 12 12l2.5-2.5'),
  mousePointerClick: line('M9 9l10.5 4-4.6 1.4L13.5 19z') + line('M4.5 4.5l1.8 1.8') + line('M9 3v2.5') + line('M3 9h2.5'),
  radio:
    line('M8.4 15.6a5.1 5.1 0 0 1 0-7.2') + line('M15.6 8.4a5.1 5.1 0 0 1 0 7.2') +
    line('M5.5 18.5a9.2 9.2 0 0 1 0-13') + line('M18.5 5.5a9.2 9.2 0 0 1 0 13') + dot(12, 12, 1.6),

  /* ── The window ── */
  settings: line(gear(12, 12, 8, 9, 7, 0.36)) + circle(12, 12, 3),
  keyboard: rect(2.5, 6, 19, 12, 2.5) + line('M6.5 10h.01') + line('M10 10h.01') + line('M14 10h.01') + line('M17.5 10h.01') + line('M8 14h8'),
  palette:
    line('M12 3.5a8.5 8.5 0 0 0 0 17c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8h2.1a3.8 3.8 0 0 0 3.8-3.8c0-4-3.8-7.2-8.5-7.2z') +
    dot(7.5, 11.5) + dot(9.5, 7.5) + dot(14.5, 7.5),
  info: circle(12, 12, 9) + line('M12 11v5.5') + dot(12, 7.75, 1.2),
  check: line('M5 12.5l4.5 4.5L19 7.5'),
  close: line('M6.5 6.5l11 11') + line('M17.5 6.5l-11 11'),
  remove:
    line('M4.5 7h15') + line('M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2') +
    line('M6.5 7l.8 11.2a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8L17.5 7') + line('M10.5 11v5') + line('M13.5 11v5'),
  alert: line('M10.3 4.6a2 2 0 0 1 3.4 0l7 12.1a2 2 0 0 1-1.7 3H5a2 2 0 0 1-1.7-3z') + line('M12 9.5v4') + dot(12, 16.6, 1.15),
  // Three quarters of a ring, spun by the component that shows it.
  loading: line('M12 3.5a8.5 8.5 0 1 1-8.5 8.5'),
  minimise: line('M5.5 12h13'),
  maximise: rect(5.5, 5.5, 13, 13, 1.5),
  restore: rect(5, 8, 11, 11, 1.5) + line('M8 5.5h9a1.5 1.5 0 0 1 1.5 1.5v9'),

  /* ── The site's ── */
  boxes: line('M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z') + line('M4.5 7.7 12 12l7.5-4.3') + line('M12 12v8.5'),
  cpu:
    rect(6.5, 6.5, 11, 11, 2) + rect(9.5, 9.5, 5, 5, 1) +
    line('M9.5 3.5v3') + line('M14.5 3.5v3') + line('M9.5 17.5v3') + line('M14.5 17.5v3') +
    line('M3.5 9.5h3') + line('M3.5 14.5h3') + line('M17.5 9.5h3') + line('M17.5 14.5h3'),
  keyRound: circle(8, 15.5, 4) + line('M10.9 12.6 19.5 4') + line('M16.5 7l2.5 2.5') + line('M14 9.5l2 2'),
  badgeCheck: line(star(12, 12, 10, 9.2, 7.7, -Math.PI / 2)) + line('M8.7 12.2l2.3 2.3 4.4-4.6'),
  wifiOff:
    line('M7.2 18.5h9.6a4 4 0 0 0 1.4-7.75 6 6 0 0 0-10.9-2.4A4.6 4.6 0 0 0 7.2 18.5z') + line('M3.5 3.5l17 17'),
};

/** The names, for a type that catches a misspelt one. */
export const GLYPH_NAMES = Object.keys(GLYPHS);
