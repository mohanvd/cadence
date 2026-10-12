/**
 * Hand the brand out to everything that wears it.
 *
 *     npm run brand
 *
 * `brand/` holds the masters: the tokens, and the artwork that
 * `brand/source/artwork.py` draws. This script renders and copies them into
 * every place a copy has to live, because the player, the site and the shell
 * are three projects that may not read each other's files:
 *
 *   tokens   brand/tokens/tokens.css   ->  app/src/styles/brand-tokens.css
 *                                          site/src/styles/brand-tokens.css
 *                                          brand/tokens/tokens.json
 *   icons    brand/logo/cadence-icon*  ->  src-tauri/icons/*, icon.ico
 *                                          src-tauri/gen/android/.../mipmap-*
 *                                          src-tauri/installer/{header,sidebar}.bmp
 *                                          app/public/favicon.svg
 *                                          site/public/{favicon.svg,apple-touch-icon.png}
 *   social   brand/social/*.svg        ->  brand/social/*.png, site/public/og-image.png
 *
 * Everything it writes is committed. Run it after changing anything under
 * `brand/`, and commit what changed; a copy that differs from its master is a
 * bug, and `git diff` after running this is how to find one.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (...parts) => path.join(root, ...parts);
const brand = (...parts) => at('brand', ...parts);

const written = [];
function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  written.push(path.relative(root, file).replaceAll('\\', '/'));
}

/** An SVG, rendered to a PNG `width` pixels wide. */
function png(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } })
    .render()
    .asPng();
}

/** Raw RGBA pixels, for the formats that are not PNG. */
function pixels(svg, width) {
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } }).render();
  return { width: image.width, height: image.height, data: image.pixels };
}

const read = (file) => fs.readFileSync(file, 'utf8');

/* ── Tokens ── */

const tokens = read(brand('tokens', 'tokens.css'));
const generated =
  '/* Generated from brand/tokens/tokens.css by `npm run brand`. Edit that file,\n' +
  '   not this one: this one is overwritten. */\n\n';
write(at('app', 'src', 'styles', 'brand-tokens.css'), generated + tokens);
write(at('site', 'src', 'styles', 'brand-tokens.css'), generated + tokens);

/* The same tokens as JSON, in the W3C design-tokens shape, for a design tool
   to import. Values are written as CSS reads them; a role that points at a
   primitive is written as a reference to it. */
{
  const tree = {};
  for (const [, name, value] of tokens.matchAll(/^\s*--cd-([\w-]+):\s*([^;]+);/gm)) {
    const [group, ...rest] = name.split('-');
    const key = rest.join('-') || 'default';
    const reference = value.match(/^var\(--cd-([\w-]+)\)$/);
    const type = /^(oklch|linear-gradient)/.test(value) || reference
      ? 'color'
      : /px|em|vw|ch|clamp/.test(value)
        ? 'dimension'
        : /ms$/.test(value)
          ? 'duration'
          : /cubic-bezier/.test(value)
            ? 'cubicBezier'
            : 'other';
    (tree[group] ??= {})[key] = {
      $type: type,
      $value: reference ? `{${reference[1].replace('-', '.')}}` : value.trim(),
    };
  }
  write(brand('tokens', 'tokens.json'), JSON.stringify(tree, null, 2) + '\n');
}

/* ── The icon set ──
   brand/icons/glyphs.mjs is the master. Each project gets it as a typed
   module of SVG fragments, which its own Icon component draws; neither may
   read the other's files, so each gets a copy. */
{
  const { GLYPHS } = await import(pathToFileURL(brand('icons', 'glyphs.mjs')).href);
  const entries = Object.entries(GLYPHS)
    .map(([name, markup]) => `  ${name}: ${JSON.stringify(markup)},`)
    .join('\n');
  const module =
    '/* Generated from brand/icons/glyphs.mjs by `npm run brand`. Edit that file,\n' +
    '   not this one: this one is overwritten.\n\n' +
    '   Each value is the inside of an <svg viewBox="0 0 24 24"> drawn with\n' +
    '   fill="none" stroke="currentColor" and round caps and joins. */\n\n' +
    `export const GLYPHS = {\n${entries}\n} as const;\n\n` +
    'export type GlyphName = keyof typeof GLYPHS;\n';
  write(at('app', 'src', 'components', 'ui', 'glyphs.ts'), module);
  write(at('site', 'src', 'components', 'glyphs.ts'), module);

  /* The sheet in the brand guide: every glyph at the size the player draws
     it, named. Text rather than outlines, because this is a page to read, and
     GitHub draws it with whatever sans-serif it has. */
  const names = Object.keys(GLYPHS);
  const cols = 8;
  const cell = 112;
  const rows = Math.ceil(names.length / cols);
  let body = '';
  names.forEach((name, i) => {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    body +=
      `<rect x="${x + 4}" y="${y + 4}" width="${cell - 8}" height="${cell - 8}" rx="12" fill="#12110F" stroke="#2F2D2C"/>` +
      `<svg x="${x + 36}" y="${y + 22}" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#F3F1F0" stroke-width="${(2 * 24) / 40}" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[name].replaceAll('currentColor', '#F3F1F0')}</svg>` +
      `<text x="${x + cell / 2}" y="${y + 88}" text-anchor="middle" font-family="Inter, Segoe UI, system-ui, sans-serif" font-size="11" fill="#A6A4A3">${name}</text>`;
  });
  write(
    brand('icons', 'preview.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}" viewBox="0 0 ${cols * cell} ${rows * cell}"><rect width="100%" height="100%" rx="16" fill="#0B0A09"/>${body}</svg>\n`,
  );
}

/* ── Icons ── */

const icon = read(brand('logo', 'cadence-icon.svg'));
const iconSmall = read(brand('logo', 'cadence-icon-small.svg'));

/* The bulk of the set is Tauri's own generator, which knows the sizes every
   platform asks for. It is run into a scratch directory, and only the files
   this repository already carries are copied back, so a new Tauri that
   generates more does not quietly add a directory nobody asked for. */
{
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-icons-'));
  const source = path.join(scratch, 'icon.png');
  fs.writeFileSync(source, png(icon, 1024));
  execFileSync(process.execPath, [at('node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'icon', source, '-o', scratch], {
    stdio: 'ignore',
  });

  /* The .icns comes out of the generator different on every run, with the
     same pictures in it, so copying it every time would put it in every diff.
     It is copied only when the icon it is made from has changed, which the
     PNG beside it, which is stable, can say. */
  const icons = at('src-tauri', 'icons');
  const same = (name) =>
    fs.existsSync(path.join(icons, name)) &&
    fs.readFileSync(path.join(icons, name)).equals(fs.readFileSync(path.join(scratch, name)));
  const iconUnchanged = same('icon.png');
  for (const name of fs.readdirSync(icons)) {
    const made = path.join(scratch, name);
    if (!fs.existsSync(made) || !fs.statSync(made).isFile()) continue;
    if (name === 'icon.icns' && iconUnchanged) continue;
    write(path.join(icons, name), fs.readFileSync(made));
  }

  const res = at('src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res');
  for (const density of fs.readdirSync(res).filter((d) => d.startsWith('mipmap-'))) {
    for (const name of fs.readdirSync(path.join(res, density))) {
      const made = path.join(scratch, 'android', density, name);
      if (fs.existsSync(made)) write(path.join(res, density, name), fs.readFileSync(made));
    }
  }
  fs.rmSync(scratch, { recursive: true, force: true });
}

/* The .ico, written here rather than taken from the generator, because the
   generator draws every size from one picture. At 32px and under the five-bar
   mark closes up, so those sizes are drawn from the three-bar cut instead.
   Windows picks the entry nearest the size it needs: 16 in a list view, 20 and
   24 in the title bar and taskbar at higher scales, 32 and 48 on the desktop,
   256 for a large tile. */
{
  const sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
  const images = sizes.map((size) => png(size <= 32 ? iconSmall : icon, size));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // an icon, not a cursor
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size === 256 ? 0 : size, entry); // 0 means 256
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(images[i].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[i].length;
  });
  write(at('src-tauri', 'icons', 'icon.ico'), Buffer.concat([header, ...images]));
  write(at('src-tauri', 'icons', '32x32.png'), png(iconSmall, 32));
}

/* The installer's two bitmaps. The wizard is skipped (see installer.nsi), but
   the uninstaller still shows them, and a stock Tauri image there is the one
   place left where Cadence would look like somebody else's program. NSIS
   wants 24-bit BMP and nothing else. */
function bmp({ width, height, data }) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const out = Buffer.alloc(54 + row * height);
  out.write('BM', 0);
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22); // positive: rows run bottom to top
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(row * height, 34);
  out.writeInt32LE(3780, 38);
  out.writeInt32LE(3780, 42);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = ((height - 1 - y) * width + x) * 4;
      const to = 54 + y * row + x * 3;
      out[to] = data[from + 2];
      out[to + 1] = data[from + 1];
      out[to + 2] = data[from];
    }
  }
  return out;
}

{
  /* The mark is lifted out of the icon file rather than redrawn, so the
     bitmaps cannot disagree with it. */
  const defs = icon.match(/<linearGradient id="signal"[\s\S]*?<\/linearGradient>/)[0];
  const rects = icon.match(/<rect [^>]*fill="url\(#signal\)"\/>/g).join('');
  const markAt = (x, y, size) =>
    `<g transform="translate(${x} ${y}) scale(${size / 1024})">${rects}</g>`;
  const ground = (w, h) =>
    `<rect width="${w}" height="${h}" fill="#0B0A09"/>` +
    `<radialGradient id="light" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#F97C3D" stop-opacity=".18"/>` +
    `<stop offset="1" stop-color="#F97C3D" stop-opacity="0"/></radialGradient>` +
    `<rect width="${w}" height="${h}" fill="url(#light)"/>`;
  const svg = (w, h, body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;

  write(at('src-tauri', 'installer', 'header.bmp'), bmp(pixels(svg(150, 57, ground(150, 57) + markAt(93, 0, 57)), 150)));
  write(at('src-tauri', 'installer', 'sidebar.bmp'), bmp(pixels(svg(164, 314, ground(164, 314) + markAt(22, 70, 120)), 164)));
}

/* Favicons. SVG, so one file is sharp at every size and every density; the
   three-bar cut, because a tab is sixteen pixels. The touch icon is the full
   mark, because a home screen is not. */
write(at('app', 'public', 'favicon.svg'), iconSmall);
write(at('site', 'public', 'favicon.svg'), iconSmall);
write(at('site', 'public', 'apple-touch-icon.png'), png(icon, 180));

/* ── Social ── */

write(brand('social', 'og-image.png'), png(read(brand('social', 'og-image.svg')), 1200));
write(brand('social', 'github-social.png'), png(read(brand('social', 'github-social.svg')), 1280));
// Twice the width GitHub draws it at, so it is sharp on a high-density screen.
write(brand('social', 'readme-banner.png'), png(read(brand('social', 'readme-banner.svg')), 2560));
write(at('site', 'public', 'og-image.png'), fs.readFileSync(brand('social', 'og-image.png')));
// A preview of the mark for the brand guide.
write(brand('logo', 'cadence-icon.png'), png(icon, 512));

console.log(written.map((file) => `  ${file}`).join('\n'));
console.log(`\n${written.length} files written.`);
