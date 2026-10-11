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
    heart(design, heart, lang) {
      const name = design.id === 'classic-3x3' ? (lang === 'da' ? 'Klassisk julehjerte' : 'Classic woven heart') : design.name;
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
