"""
The Cadence artwork, drawn from numbers.

Every vector file in `brand/logo/` and `brand/social/` is written by this
script, and nothing in those directories is edited by hand. The mark is
geometry, so it is described as geometry: five bars on a fixed pitch, each as
tall as a play triangle is at that point. Change a number here and every file
that carries the mark changes with it, at every size, in every colour.

The type in the wordmark and on the social cards is converted to outlines, so
the files render the same everywhere, including on GitHub, which draws an SVG
in an <img> with no access to web fonts. The outlines are read from the same
font files the player and the site ship (Schibsted Grotesk and Inter, both
under the SIL Open Font Licence), and shaped by HarfBuzz, so the kerning is
the font's own.

This is only needed to change the artwork. Distributing it, the icons, the
favicons, the installer bitmaps and the PNGs, is `npm run brand`, which needs
nothing but Node.

    pip install fonttools brotli uharfbuzz
    python brand/source/artwork.py
"""

from __future__ import annotations

import io
import math
import os
from dataclasses import dataclass

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FONTS = os.path.join(ROOT, 'app', 'src', 'styles', 'fonts')
LOGO = os.path.join(ROOT, 'brand', 'logo')
SOCIAL = os.path.join(ROOT, 'brand', 'social')

DISPLAY = os.path.join(FONTS, 'schibsted-grotesk-400-900-latin.woff2')
TEXT = {400: os.path.join(FONTS, 'inter-400-latin.woff2'),
        500: os.path.join(FONTS, 'inter-500-latin.woff2'),
        600: os.path.join(FONTS, 'inter-600-latin.woff2')}

# ── Colour ──
# The sRGB values of the tokens in brand/tokens/tokens.css. Kept in step by
# hand, because these are the only two places colour is written down.
INK_950 = '#0B0A09'
INK_900 = '#12110F'
INK_800 = '#262423'
INK_700 = '#413F3E'
INK_500 = '#7C7A78'
INK_400 = '#A6A4A3'
INK_100 = '#F3F1F0'
AMBER = '#FEB84D'
EMBER = '#F97C3D'
FLAME = '#EB472C'


# ── The mark ──

@dataclass(frozen=True)
class Cut:
    """One drawing of the mark. Every length is a fraction of the box."""
    bars: int
    height: float  # the tallest bar, and the width of the run
    pitch: float   # centre to centre
    weight: float  # the thickness of a bar


# Five bars for anything drawn at 48px or larger.
FULL = Cut(bars=5, height=0.62, pitch=0.135, weight=0.088)
# Three for anything smaller, where five would close up into a smudge.
SMALL = Cut(bars=3, height=0.66, pitch=0.235, weight=0.15)


def bars(cut: Cut, box: float, cx: float, cy: float) -> list[tuple[float, float, float, float]]:
    """The bars as (x, y, width, height), tall to short, left to right.

    Each bar is as tall as a play triangle is at the bar's centre, so their
    outline is the triangle. The shortest is never shorter than it is wide,
    which makes it a dot: the last beat.

    Centred optically rather than geometrically. A play glyph carries its mass
    on the left, so centring its box makes it look as though it is sliding
    right; centring its mass makes it look as though it is sliding left. Half
    way between the two is where it sits still.
    """
    height, pitch, weight = cut.height * box, cut.pitch * box, cut.weight * box
    span = (cut.bars - 1) * pitch + weight
    heights = []
    for i in range(cut.bars):
        t = (i * pitch + weight / 2) / span
        heights.append(max(weight, height * (1 - t) + weight * t))
    mass = sum(h * (i * pitch + weight / 2) for i, h in enumerate(heights)) / sum(heights)
    x0 = cx - (span / 2 + mass) / 2
    return [(x0 + i * pitch, cy - h / 2, weight, h) for i, h in enumerate(heights)]


def extent(rects):
    return (min(r[0] for r in rects), min(r[1] for r in rects),
            max(r[0] + r[2] for r in rects), max(r[1] + r[3] for r in rects))


def draw_bars(rects, fill: str) -> str:
    return ''.join(
        f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{w / 2:.2f}" fill="{fill}"/>'
        for x, y, w, h in rects)


def signal(gid: str, rects) -> str:
    """The signal gradient, amber to flame, laid across the mark's own extent
    so that it reads the same at every size."""
    x1, y1, x2, y2 = extent(rects)
    return (f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" '
            f'x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}">'
            f'<stop offset="0" stop-color="{AMBER}"/><stop offset=".55" stop-color="{EMBER}"/>'
            f'<stop offset="1" stop-color="{FLAME}"/></linearGradient>')


def document(width, height, body, defs='', title='Cadence'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:g}" height="{height:g}" '
            f'viewBox="0 0 {width:g} {height:g}" role="img" aria-label="{title}">'
            f'<title>{title}</title>'
            + (f'<defs>{defs}</defs>' if defs else '') + body + '</svg>\n')


def mark_file(cut: Cut, fill: str | None = None, size: float = 512) -> str:
    rects = bars(cut, size, size / 2, size / 2)
    if fill is None:
        return document(size, size, draw_bars(rects, 'url(#signal)'), signal('signal', rects))
    return document(size, size, draw_bars(rects, fill))


def icon_file(cut: Cut, size: float = 1024, inset: float = 0.07, radius: float = 0.225,
              scale: float = 1.04) -> str:
    """The application icon: the mark on a tile of the ground colour, lit
    from above, with a little of the mark's own light falling behind it."""
    m = size * inset
    t = size - 2 * m
    r = t * radius
    rim = max(1.0, size / 512)
    rects = bars(cut, t * scale, size / 2, size / 2)
    defs = (
        '<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#221E1B"/>'
        f'<stop offset="1" stop-color="{INK_950}"/></linearGradient>'
        '<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#FFFFFF" stop-opacity=".16"/>'
        '<stop offset=".35" stop-color="#FFFFFF" stop-opacity=".03"/>'
        '<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>'
        '<radialGradient id="glow" cx=".42" cy=".52" r=".55">'
        f'<stop offset="0" stop-color="{EMBER}" stop-opacity=".24"/>'
        f'<stop offset="1" stop-color="{EMBER}" stop-opacity="0"/></radialGradient>'
        + signal('signal', rects))
    body = (
        f'<rect x="{m:g}" y="{m:g}" width="{t:g}" height="{t:g}" rx="{r:.1f}" fill="url(#tile)"/>'
        f'<rect x="{m:g}" y="{m:g}" width="{t:g}" height="{t:g}" rx="{r:.1f}" fill="url(#glow)"/>'
        f'<rect x="{m + rim / 2:g}" y="{m + rim / 2:g}" width="{t - rim:g}" height="{t - rim:g}" '
        f'rx="{r - rim / 2:.1f}" fill="none" stroke="url(#rim)" stroke-width="{rim:g}"/>'
        + draw_bars(rects, 'url(#signal)'))
    return document(size, size, body, defs)


# ── Type ──

_fonts: dict = {}


def _font(path: str, wght: int | None):
    key = (path, wght)
    if key not in _fonts:
        font = TTFont(path)
        if 'fvar' in font and wght is not None:
            font = instantiateVariableFont(font, {'wght': wght})
        buf = io.BytesIO()
        font.flavor = None
        font.save(buf)
        _fonts[key] = (font, buf.getvalue())
    return _fonts[key]


@dataclass
class Line:
    d: str
    width: float
    cap: float
    x_height: float


def setline(text: str, path: str, size: float, x: float = 0, baseline: float = 0,
            wght: int | None = None, tracking: float = 0.0) -> Line:
    """`text` as outline path data, `size` px, its baseline at `baseline`.
    `tracking` is in em and is added between letters, not after the last."""
    font, data = _font(path, wght)
    upem = font['head'].unitsPerEm
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hb.Font(hb.Face(data)), buf, {'kern': True, 'liga': True})
    glyphs, order = font.getGlyphSet(), font.getGlyphOrder()
    scale = size / upem
    pen = SVGPathPen(glyphs)
    advance = 0.0
    count = len(buf.glyph_infos)
    for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
        transform = (scale, 0, 0, -scale,
                     x + (advance + pos.x_offset) * scale, baseline - pos.y_offset * scale)
        glyphs[order[info.codepoint]].draw(TransformPen(pen, transform))
        advance += pos.x_advance + (tracking * upem if i < count - 1 else 0)
    os2 = font['OS/2']
    return Line(pen.getCommands(), advance * scale, os2.sCapHeight * scale, os2.sxHeight * scale)


WORD = dict(text='Cadence', path=DISPLAY, wght=700, tracking=-0.025)


def lockup(cap_px: float, x: float, baseline: float, ink: str, mark: str = 'signal',
           gid: str = 'signal') -> tuple[str, str, float]:
    """The mark and the name side by side. Returns (defs, body, width).

    Proportioned from the name's cap height, so it is the same drawing at any
    size: the tallest bar is 1.3 caps, centred on the capitals, and the gap
    between them is 0.42 caps.
    """
    probe = setline(WORD['text'], WORD['path'], 100, wght=WORD['wght'], tracking=WORD['tracking'])
    size = cap_px / probe.cap * 100
    box = cap_px * 1.3 / FULL.height
    rects = bars(FULL, box, 0, baseline - cap_px / 2)
    x1, _, x2, _ = extent(rects)
    rects = [(rx - x1 + x, ry, rw, rh) for rx, ry, rw, rh in rects]
    word_x = x + (x2 - x1) + cap_px * 0.42
    line = setline(WORD['text'], WORD['path'], size, word_x, baseline,
                   wght=WORD['wght'], tracking=WORD['tracking'])
    fill = f'url(#{gid})' if mark == 'signal' else mark
    defs = signal(gid, rects) if mark == 'signal' else ''
    body = draw_bars(rects, fill) + f'<path d="{line.d}" fill="{ink}"/>'
    return defs, body, word_x + line.width - x


def wordmark_file(ink='currentColor') -> str:
    size = 200
    line = setline(WORD['text'], WORD['path'], size, 0, 0, wght=WORD['wght'], tracking=WORD['tracking'])
    pad = 4
    top = -line.cap - pad
    # The descender-free word sits on its baseline; the box runs cap to baseline.
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{line.width + 2 * pad:.0f}" '
            f'height="{line.cap + 2 * pad:.0f}" viewBox="{-pad} {top:.2f} {line.width + 2 * pad:.2f} '
            f'{line.cap + 2 * pad:.2f}" role="img" aria-label="Cadence"><title>Cadence</title>'
            f'<path d="{line.d}" fill="{ink}"/></svg>\n')


def lockup_file(ink: str) -> str:
    cap = 100
    pad = 16
    defs, body, width = lockup(cap, pad, pad + cap * 1.15, ink)
    height = cap * 1.3 + 2 * pad
    return document(round(width + 2 * pad), round(height), body, defs)


# ── Social cards ──

def chips(labels, x, y, size, gap, fill, ink):
    """A row of the format labels the site and the player use: small caps in a
    hairline pill."""
    out = ''
    for label in labels:
        line = setline(label, TEXT[600], size, 0, 0, tracking=0.06)
        w = line.width + size * 1.6
        h = size * 2.2
        text = setline(label, TEXT[600], size, x + size * 0.8, y + h / 2 + line.cap / 2, tracking=0.06)
        out += (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{h / 2:.1f}" '
                f'fill="{fill}" stroke="{INK_700}" stroke-width="1.5"/>'
                f'<path d="{text.d}" fill="{ink}"/>')
        x += w + gap
    return out


def field(width, height, mark_box, mark_cx, mark_cy, strength=0.9):
    """The ground every card sits on: ink, a warm light falling from the mark,
    and the mark itself drawn huge and partly off the edge, as a texture."""
    rects = bars(FULL, mark_box, mark_cx, mark_cy)
    defs = (
        f'<radialGradient id="light" gradientUnits="userSpaceOnUse" cx="{mark_cx:.0f}" cy="{mark_cy:.0f}" '
        f'r="{mark_box * 0.75:.0f}"><stop offset="0" stop-color="{EMBER}" stop-opacity=".20"/>'
        f'<stop offset=".6" stop-color="{EMBER}" stop-opacity=".05"/>'
        f'<stop offset="1" stop-color="{EMBER}" stop-opacity="0"/></radialGradient>'
        + signal('big', rects).replace('stop-color', f'stop-opacity="{strength:g}" stop-color'))
    body = (f'<rect width="{width}" height="{height}" fill="{INK_950}"/>'
            f'<rect width="{width}" height="{height}" fill="url(#light)"/>'
            + draw_bars(rects, 'url(#big)'))
    return defs, body


def card(width, height, *, headline_px, sub_px, left, title='Cadence'):
    """A social card: lockup, the line, the description, the formats."""
    mark_box = height * 1.25
    fdefs, fbody = field(width, height, mark_box, width - height * 0.16, height * 0.5, strength=0.55)
    cap = headline_px * 0.30
    top = height * 0.17
    ldefs, lbody, _ = lockup(cap, left, top + cap, INK_100, gid='lock')
    head = setline('Everything plays.', DISPLAY, headline_px, left, top + cap + headline_px * 1.25,
                   wght=700, tracking=-0.035)
    sub1 = setline('A keyboard-first media player for Windows.', TEXT[400], sub_px,
                   left, top + cap + headline_px * 1.25 + sub_px * 1.9)
    sub2 = setline('Films and music in one quiet window.', TEXT[400], sub_px,
                   left, top + cap + headline_px * 1.25 + sub_px * 3.25)
    chip_px = sub_px * 0.5
    row = chips(['MKV', 'HEVC', 'AV1', 'FLAC', 'OPUS', 'ASS'], left, height - height * 0.17 - chip_px * 2.2,
                chip_px, chip_px * 0.8, INK_900, INK_400)
    body = (fbody + lbody + f'<path d="{head.d}" fill="{INK_100}"/>'
            f'<path d="{sub1.d}" fill="{INK_400}"/><path d="{sub2.d}" fill="{INK_400}"/>' + row)
    return document(width, height, body, fdefs + ldefs, title)


def banner(width, height):
    """The strip at the top of the README: the lockup and the line, nothing
    to read past."""
    fdefs, fbody = field(width, height, height * 1.5, width - height * 0.5, height * 0.5)
    cap = height * 0.15
    left = height * 0.22
    ldefs, lbody, _ = lockup(cap, left, height * 0.43, INK_100, gid='lock')
    sub = setline('Everything plays. A keyboard-first media player for Windows.', TEXT[400],
                  height * 0.072, left, height * 0.43 + height * 0.19)
    body = fbody + lbody + f'<path d="{sub.d}" fill="{INK_400}"/>'
    return document(width, height, body, fdefs + ldefs)


def write(directory, name, content):
    os.makedirs(directory, exist_ok=True)
    with open(os.path.join(directory, name), 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(content)
    print(os.path.relpath(os.path.join(directory, name), ROOT))


if __name__ == '__main__':
    write(LOGO, 'cadence-mark.svg', mark_file(FULL))
    write(LOGO, 'cadence-mark-small.svg', mark_file(SMALL))
    write(LOGO, 'cadence-mark-mono.svg', mark_file(FULL, 'currentColor'))
    write(LOGO, 'cadence-mark-small-mono.svg', mark_file(SMALL, 'currentColor'))
    write(LOGO, 'cadence-wordmark.svg', wordmark_file())
    write(LOGO, 'cadence-lockup-dark.svg', lockup_file(INK_100))
    write(LOGO, 'cadence-lockup-light.svg', lockup_file(INK_950))
    write(LOGO, 'cadence-icon.svg', icon_file(FULL))
    # For 32px and under: the three-bar cut on a tile that fills the square,
    # because at sixteen pixels a margin is a quarter of the picture.
    write(LOGO, 'cadence-icon-small.svg', icon_file(SMALL, inset=0.0, radius=0.2, scale=1.0))
    write(SOCIAL, 'og-image.svg', card(1200, 630, headline_px=96, sub_px=30, left=84))
    write(SOCIAL, 'github-social.svg', card(1280, 640, headline_px=100, sub_px=31, left=92))
    write(SOCIAL, 'readme-banner.svg', banner(1280, 360))
