/** Draft assets only: node scripts/generate-pinterest-starter.mjs.
 * Frames the site's original photographs and reads credits from heart metadata.
 * Does not publish or change the site. No site build is required.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { createCanvas, loadImage, registerFont } from 'canvas';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'docs/pinterest');
const pins = JSON.parse(fs.readFileSync(path.join(output, 'pins.json'), 'utf8'));
const hearts = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/data/heart-meta.json'), 'utf8'));
const fontFiles = ['Regular', 'Bold'].map(w => path.join(root, `scripts/fonts/JulefletSans-${w}.ttf`));
fontFiles.forEach((file, i) => registerFont(file, {family: 'Juleflet Sans', weight: i ? '700' : '400'}));
const measure = createCanvas(1, 1).getContext('2d');
const escape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const text = (s, x, y, size, weight = 400, fill = '#1c3329', maxWidth = 900) => {
  measure.font = `${weight} ${size}px "Juleflet Sans"`;
  const fitted = Math.min(size, size * maxWidth / measure.measureText(s).width);
  return `<text x="${x}" y="${y}" font-family="Juleflet Sans" font-size="${fitted.toFixed(2)}" font-weight="${weight}" fill="${fill}">${escape(s)}</text>`;
};

for (const pin of pins) {
  const heart = hearts[pin.id];
  if (!heart?.photo) throw new Error(`No photograph for ${pin.id}`);
  if (pin.headline.length !== 2 || pin.title.length > 100 || pin.description.length > 500) {
    throw new Error(`Invalid pin copy: ${pin.id}`);
  }
  const photoPath = path.join(root, 'static', heart.photo.src);
  const original = fs.readFileSync(photoPath);
  const photo = await loadImage(original);
  const mime = path.extname(photoPath) === '.png' ? 'image/png' : 'image/jpeg';
  // Contain the whole photograph: the original heart, handle and background stay intact.
  const scale = Math.min(920 / photo.width, 1080 / photo.height);
  const width = photo.width * scale;
  const height = photo.height * scale;
  const x = (1000 - width) / 2;
  const y = 240 + (1080 - height) / 2;
  const credit = heart.author === 'Klassisk' ? 'Klassisk mønster' : `Mønster: ${heart.author}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500" viewBox="0 0 1000 1500">
    <rect width="1000" height="1500" fill="#f9f9f3"/>
    ${text('FLETTEDE JULEHJERTER', 50, 56, 20, 700, '#2e5041')}
    ${text('Juleflet.dk', 784, 57, 28, 700, '#2e5041', 166)}
    ${pin.headline.map((line, i) => text(line, 50, 130 + i * 72, 64, 700)).join('')}
    <image x="${x}" y="${y}" width="${width}" height="${height}" href="data:${mime};base64,${original.toString('base64')}"/>
    <path d="M50 1352H950" stroke="#cfd9cf" stroke-width="2"/>
    ${text('Find skabelonen på juleflet.dk', 50, 1410, 39, 700, '#2e5041')}
    ${text(credit, 50, 1460, 25, 400, '#5f6d66')}
  </svg>`;
  const png = new Resvg(svg, {font: {loadSystemFonts: false, fontFiles, defaultFontFamily: 'Juleflet Sans'}}).render().asPng();
  const canvas = createCanvas(1000, 1500);
  canvas.getContext('2d').drawImage(await loadImage(png), 0, 0);
  fs.writeFileSync(path.join(output, `${pin.id}.jpg`), canvas.toBuffer('image/jpeg', {quality: 0.94, chromaSubsampling: false}));
  pin.photoSource = heart.photo.src;
  pin.credit = credit;
  pin.link = `https://juleflet.dk/hjerte/${pin.id}/?${new URLSearchParams({utm_source: 'pinterest', utm_medium: 'organic_social', utm_campaign: 'jul_2026', utm_content: `${pin.id}_photo`})}`;
}

const csvCell = s => `"${String(s).replace(/"/g, '""')}"`;
const fields = ['title', 'description', 'board', 'link', 'alt', 'suggestedDay', 'photoSource'];
// Copy sheet for manual publishing; this is not Pinterest's bulk-upload schema.
fs.writeFileSync(path.join(output, 'publishing-copy.csv'), '\ufeff' + ['image,' + fields.join(','), ...pins.map(p => [p.id + '.jpg', ...fields.map(f => p[f])].map(csvCell).join(','))].join('\n') + '\n');
const cards = pins.map(p => `<article><a href="${p.id}.jpg"><img src="${p.id}.jpg" width="1000" height="1500" alt="${escape(p.alt)}" loading="lazy"></a><div><p class="eyebrow">Dag ${p.suggestedDay} · ${escape(p.board)}</p><h2>${escape(p.title)}</h2><p>${escape(p.description)}</p><p class="small">${escape(p.credit)} · <a href="https://juleflet.dk${escape(p.photoSource)}">Originalfoto</a></p><p><b>Link:</b> <a href="${escape(p.link)}">${escape(p.link)}</a></p><p><b>Alternativ tekst:</b> ${escape(p.alt)}</p><a download href="${p.id}.jpg">Hent JPG · 1000 × 1500 px</a></div></article>`).join('\n');
fs.writeFileSync(path.join(output, 'index.html'), fs.readFileSync(path.join(output, 'launch-template.html'), 'utf8').replace('<!-- PIN_CARDS -->', cards));
console.log(`Generated ${pins.length} photo-led Pinterest drafts (1000×1500 JPG) and a publishing copy sheet.`);
