/** Draft assets only: npm run build, then node scripts/generate-pinterest-starter.mjs.
 * Reuses the site's actual heart and guide SVGs. Does not publish or change the site.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { Resvg } from '@resvg/resvg-js';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'docs/pinterest');
const pins = JSON.parse(fs.readFileSync(path.join(output, 'pins.json'), 'utf8'));
const fontFiles = ['Regular', 'Bold'].map(w => path.join(root, `scripts/fonts/JulefletSans-${w}.ttf`));
const palette = { page: '#f9f9f3', sky: '#d6e1d0', cream2: '#e6ece2', sage: '#b5c9b7', 'sage-dark': '#7f9c86', green: '#2e5041', deep: '#1c3329', red: '#c41e2a', line: '#cfd9cf', gold: '#e0b75a' };
const escape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const resolveColors = s => s.replace(/var\(--([\w-]+)\)/g, (_, key) => {
  if (!palette[key]) throw new Error(`Unknown colour ${key}`);
  return palette[key];
});
const body = s => s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const landscape = body(fs.readFileSync(path.join(root, 'src/lib/assets/landscape.svg'), 'utf8'));
const page = relative => new JSDOM(fs.readFileSync(path.join(root, 'build', relative, 'index.html'), 'utf8')).window.document;
const trace = page('julehjerter-uden-printer').querySelector('.steps .step:nth-child(4) figure svg');
const loops = [...page('saadan-goer-du').querySelectorAll('.loop-pair svg')];
if (!trace || loops.length !== 2) throw new Error('Build the current guides before generating Pinterest drafts.');
const traceCss = fs.readFileSync(path.join(root, 'src/lib/components/GuideTrace.svelte'), 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1]
  .replace(/svg\s*\{[^}]*\}/, '');
const text = (s, x, y, size, weight = 400, fill = palette.deep) => `<text x="${x}" y="${y}" font-family="Juleflet Sans" font-size="${size}" font-weight="${weight}" fill="${fill}">${escape(s)}</text>`;
const embed = (svg, x, y, width, height) => `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${svg.getAttribute('viewBox')}">${body(svg.outerHTML)}</svg>`;
const panel = (y, label, art) => `<rect x="70" y="${y}" width="860" height="340" rx="28" fill="white" stroke="${palette.line}" stroke-width="2"/>${text(label, 106, y + 52, 32, 700)}${art}`;

const server = await createServer({root, configFile: false, logLevel: 'error', appType: 'custom', server: {middlewareMode: true, hmr: false, watch: null, preTransformRequests: false}, optimizeDeps: {noDiscovery: true, include: []}, resolve: {alias: {$lib: path.join(root, 'src/lib')}}});
try {
  const { renderHeartSvgInline } = await server.ssrLoadModule('/src/lib/rendering/heartSvg.ts');
  const design = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/data/heart-designs.json'), 'utf8'))['classic-3x3'];
  const heart = renderHeartSvgInline(design, {left: '#ffffff', right: '#b91313'}, {idPrefix: 'pinterest-classic'});
  const art = [
    `${text('Klassiske', 70, 214, 88, 700)}${text('julehjerter', 70, 310, 88, 700)}${text('Skabelon til print', 74, 377, 36, 400, palette.green)}
     <g filter="url(#shadow)"><rect x="492" y="422" width="16" height="168" fill="#b91313"/><svg x="138" y="474" width="724" height="724" viewBox="${heart.viewBox}">${heart.markup}</svg></g>
     ${text('Print på A4 · klip · flet', 70, 1240, 41, 700)}${text('Find skabelonen på juleflet.dk', 72, 1303, 31)}`,
    `${text('Sådan fletter', 70, 214, 88, 700)}${text('du julehjerter', 70, 310, 88, 700)}${text('En guide trin for trin', 74, 377, 36, 400, palette.green)}
     ${panel(445, 'Ind igennem', embed(loops[0], 180, 505, 640, 270))}
     ${panel(815, 'Uden om', embed(loops[1], 180, 875, 640, 270))}
     ${text('Skift mellem de to bevægelser.', 70, 1240, 36, 700)}${text('Se hele vejledningen på juleflet.dk', 72, 1303, 31)}`,
    `${text('Julehjerter', 70, 214, 88, 700)}${text('uden printer', 70, 310, 88, 700)}${text('Tegn skabelonen af fra en skærm', 74, 377, 36, 400, palette.green)}
     <rect x="55" y="447" width="890" height="680" rx="34" fill="#f9f9f3"/>${embed(trace, 55, 457, 890, 650)}
     ${text('Tyndt papir bliver din skabelon.', 70, 1235, 38, 700)}${text('Se alle 7 trin på juleflet.dk', 72, 1303, 31)}`
  ];
  for (const [i, pin] of pins.entries()) {
    if (pin.title.length > 100 || pin.description.length > 500) throw new Error(`Pin copy too long: ${pin.id}`);
    const svg = resolveColors(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500" viewBox="0 0 1000 1500"><defs><filter id="shadow" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#1c3329" flood-opacity=".15"/></filter><linearGradient id="copy-wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6e1d0"/><stop offset=".72" stop-color="#d6e1d0"/><stop offset="1" stop-color="#d6e1d0" stop-opacity="0"/></linearGradient></defs><style>${traceCss} .label { font-family: 'Juleflet Sans'; }</style><rect width="1000" height="1500" fill="#d6e1d0"/><svg x="0" y="1170" width="1000" height="334" viewBox="0 0 2172 724">${landscape}</svg><rect x="0" y="1170" width="1000" height="250" fill="url(#copy-wash)"/>${text('Juleflet.dk', 70, 88, 34, 700)}${art[i]}</svg>`);
    fs.writeFileSync(path.join(output, `${pin.id}.svg`), svg);
    const png = new Resvg(svg, {font: {loadSystemFonts: false, fontFiles, defaultFontFamily: 'Juleflet Sans'}}).render().asPng();
    fs.writeFileSync(path.join(output, `${pin.id}.png`), png);
    pin.link = `https://juleflet.dk${pin.path}?${new URLSearchParams({utm_source: 'pinterest', utm_medium: 'organic_social', utm_campaign: 'jul_2026', utm_content: pin.id})}`;
  }
  const csvCell = s => `"${String(s).replace(/"/g, '""')}"`;
  const fields = ['title', 'description', 'board', 'link', 'alt', 'suggestedDay'];
  // Copy sheet for manual publishing; this is not Pinterest's bulk-upload schema.
  fs.writeFileSync(path.join(output, 'publishing-copy.csv'), '\ufeff' + ['image,' + fields.join(','), ...pins.map(p => [p.id + '.png', ...fields.map(f => p[f])].map(csvCell).join(','))].join('\n') + '\n');
  const cards = pins.map(p => `<article><a href="${p.id}.png"><img src="${p.id}.png" width="1000" height="1500" alt="${escape(p.alt)}"></a><div><p class="eyebrow">Dag ${p.suggestedDay} · ${escape(p.board)}</p><h2>${escape(p.title)}</h2><p>${escape(p.description)}</p><p><b>Link:</b> <a href="${escape(p.link)}">${escape(p.link)}</a></p><p><b>Alternativ tekst:</b> ${escape(p.alt)}</p><a download href="${p.id}.png">Hent PNG</a> · <a download href="${p.id}.svg">Hent SVG</a></div></article>`).join('\n');
  fs.writeFileSync(path.join(output, 'index.html'), fs.readFileSync(path.join(output, 'launch-template.html'), 'utf8').replace('<!-- PIN_CARDS -->', cards));
  console.log(`Generated ${pins.length} Pinterest drafts (1000×1500), SVG sources and a publishing copy sheet.`);
} finally {
  await server.close();
}
