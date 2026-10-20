/** Build social cards from the same vector hearts and landscape as the site. */
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, registerFont } from 'canvas';

const FONT = 'Juleflet Sans';
const escapeXml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function socialCardBuilder(root) {
  for (const weight of ['Regular', 'Bold']) {
    registerFont(path.join(root, `scripts/fonts/JulefletSans-${weight}.ttf`), {
      family: FONT, weight: weight === 'Bold' ? '700' : '400'
    });
  }
  const measure = createCanvas(1, 1).getContext('2d');
  const landscape = fs.readFileSync(path.join(root, 'src/lib/assets/landscape.svg'), 'utf8')
    .replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    .replace(/<title[\s\S]*?<\/title>/, '').replace(/<desc[\s\S]*?<\/desc>/, '');

  function text(value, x, y, size, weight = 400, fill = '#1c3329', maxWidth = 1000) {
    measure.font = `${weight} ${size}px "${FONT}"`;
    const width = measure.measureText(value).width;
    const fitted = Math.min(size, size * maxWidth / Math.max(1, width));
    return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${fitted}" font-weight="${weight}" fill="${fill}">${escapeXml(value)}</text>`;
  }

  function centered(value, x, y, size, weight, fill, maxWidth) {
    measure.font = `${weight} ${size}px "${FONT}"`;
    const fitted = Math.min(size, size * maxWidth / Math.max(1, measure.measureText(value).width));
    return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="${fitted}" font-weight="${weight}" fill="${fill}">${escapeXml(value)}</text>`;
  }

  function hanging(heart, x, y, size) {
    return `<g filter="url(#card-shadow)">
      <rect x="${x + size / 2 - 6}" y="0" width="12" height="${y + size * .32}" fill="#b91313"/>
      <svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${heart.viewBox}">${heart.markup}</svg>
    </g>`;
  }

  function frame(content) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <defs><filter id="card-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="9" stdDeviation="9" flood-color="#1c3329" flood-opacity=".15"/></filter></defs>
      <rect width="1200" height="630" fill="#d6e1d0"/>
      <svg x="0" y="230" width="1200" height="400" viewBox="0 0 2172 724">${landscape}</svg>
      ${content}
    </svg>`;
  }

  return {
    /**
     * The front page's card: gallery hearts hanging on the page's own background
     * (--page), four over three, with a small wordmark. Language-independent.
     */
    gallery(hearts) {
      const size = 220;
      const rows = [
        { top: 58, centers: [150, 450, 750, 1050] },
        { top: 318, centers: [300, 600, 900] }
      ];
      const placed = rows.flatMap(({ top, centers }) => centers.map((cx) => ({ cx, top })));
      if (hearts.length !== placed.length) throw new Error(`gallery card takes ${placed.length} hearts`);
      // Ribbons first, so the second row's run down behind the first row's gaps.
      const ribbons = placed.map(({ cx, top }) => `<rect x="${cx - 6}" y="0" width="12" height="${top + size * .24}" fill="#b91313"/>`);
      const heartsMarkup = placed.map(({ cx, top }, i) =>
        `<svg x="${cx - size / 2}" y="${top}" width="${size}" height="${size}" viewBox="${hearts[i].viewBox}">${hearts[i].markup}</svg>`);
      return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <defs><filter id="card-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="9" stdDeviation="9" flood-color="#1c3329" flood-opacity=".15"/></filter></defs>
      <rect width="1200" height="630" fill="#f9f9f3"/>
      <g filter="url(#card-shadow)">${ribbons.join('')}${heartsMarkup.join('')}</g>
      <text x="600" y="603" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="700" fill="#1c3329">Juleflet.dk</text>
    </svg>`;
    },
    home(hearts, lang) {
      const lines = lang === 'da' ? ['Skabeloner til', 'flettede julehjerter'] : ['Templates for', 'woven Christmas hearts'];
      return frame([
        text('Juleflet.dk', 70, 95, 30, 700),
        text(lines[0], 70, 217, 54, 700, '#1c3329', 595),
        text(lines[1], 70, 280, 54, 700, '#1c3329', 595),
        text(lang === 'da' ? 'Print, klip og flet dit eget julehjerte.' : 'Print, cut and weave your own heart.', 72, 341, 25, 400, '#4d594f', 570),
        // Paint the long ribbon first, behind the heart hanging above it.
        hanging(hearts[2], 994, 315, 158),
        hanging(hearts[0], 725, 135, 260),
        hanging(hearts[1], 1008, 58, 146),
        '<g fill="#e0b75a"><use href="#star" transform="translate(656 127) scale(.55)"/><use href="#star" transform="translate(973 287) scale(.45)"/></g>'
      ].join(''));
    },
    /**
     * A heart's 1000x1500 Pinterest picture (src/lib/pinImage.ts): the heart
     * large on the sky colour, hanging in its ribbon, over a page-coloured band
     * with its Danish name, the tagline and the domain, centred and set large
     * enough to read at Pinterest's ~236 px wide feed. No shadow: flat like the
     * square pictures, and several times faster to draw.
     */
    pin(heart, name, { width, height, tagline }) {
      const size = 780, left = (width - size) / 2, top = 175, band = 1040;
      const ribbonWidth = size * .055;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#d6e1d0"/>
      <rect y="${band}" width="${width}" height="${height - band}" fill="#f9f9f3"/>
      <g>
        <rect x="${(width - ribbonWidth) / 2}" y="0" width="${ribbonWidth}" height="${top + size * .24}" fill="#b91313"/>
        <svg x="${left}" y="${top}" width="${size}" height="${size}" viewBox="${heart.viewBox}">${heart.markup}</svg>
      </g>
      ${centered(name, width / 2, band + 150, 96, 700, '#1c3329', width - 140)}
      ${centered(tagline, width / 2, band + 235, 44, 400, '#2e5041', width - 140)}
      <rect x="${width / 2 - 40}" y="${band + 300}" width="80" height="6" rx="3" fill="#b91313"/>
      ${centered('juleflet.dk', width / 2, band + 392, 52, 700, '#1c3329', width - 140)}
    </svg>`;
    },
    heart(design, heart, lang) {
      const name = design.id === 'classic-3x3' ? (lang === 'da' ? 'Klassisk julehjerte' : 'Classic woven heart') : design.names?.[lang] || design.name; // the language's name, as $lib/utils/heartName resolves it
      const author = design.author === 'Traditional' ? (lang === 'da' ? 'Traditionelt mønster' : 'Traditional pattern') : design.author ? `${lang === 'da' ? 'af' : 'by'} ${design.author}` : '';
      return frame([
        hanging(heart, 60, 72, 475),
        text('Juleflet.dk', 615, 106, 30, 700),
        text(lang === 'da' ? 'SKABELON TIL JULEHJERTE' : 'WOVEN HEART TEMPLATE', 615, 203, 19, 700, '#2e5041', 515),
        text(name, 612, 279, 56, 700, '#1c3329', 520),
        text(author, 615, 326, 25, 400, '#4d594f', 505),
        text(lang === 'da' ? 'Print på A4 · Klip og flet' : 'Print on A4 · Cut and weave', 615, 391, 24, 400, '#2e5041', 510)
      ].join(''));
    }
  };
}
