/** Full inventory benchmark: give the locator rough rectangles, never target quads. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from 'canvas';
import { detectMotif, rectifyMotif } from '../../static/inverse/locator/locator.js';

const catalog = JSON.parse(await fs.readFile('scripts/inverse/collage-rois.json', 'utf8'));
const runId = new Date().toISOString().replace(/[:.]/g, '-'), output = `tmp/inverse-locator/${runId}`;
await fs.mkdir(output, { recursive: true });
const data = new Uint8ClampedArray(await fs.readFile(catalog.rgbaFile)), source = { width: catalog.width, height: catalog.height, data };
const hash = x => createHash('sha256').update(x).digest('hex'), sourceHashes = {};
for (const name of await fs.readdir('static/inverse/locator')) sourceHashes[name] = hash(await fs.readFile(path.join('static/inverse/locator', name)));
const results = [], canvas = createCanvas(source.width, source.height), ctx = canvas.getContext('2d');
ctx.drawImage(await loadImage(catalog.file), 0, 0);
const contact = createCanvas(8 * 180, 5 * 205), cc = contact.getContext('2d'); cc.fillStyle = '#e8edef'; cc.fillRect(0, 0, contact.width, contact.height);
for (const entry of catalog.cases) {
  const record = { ...entry }; results.push(record);
  const x = (entry.column - 1) * 180, y = (entry.row - 1) * 205;
  try {
    const proposal = detectMotif(source, { roi: entry.roi, maxSize: 650 });
    record.proposal = proposal;
    if (proposal.quad) {
      const crop = rectifyMotif(source, proposal.quad, { size: 400 });
      record.observedCropFraction = crop.valid.reduce((a, b) => a + b, 0) / crop.valid.length;
      const small = createCanvas(400, 400), sc = small.getContext('2d'), pixels = sc.createImageData(400, 400); pixels.data.set(crop.data); sc.putImageData(pixels, 0, 0);
      await fs.writeFile(path.join(output, `${entry.id}.png`), small.toBuffer('image/png'));
      cc.drawImage(small, x, y, 175, 175);
      ctx.strokeStyle = proposal.status === 'candidate' ? '#00ddaa' : '#ffe25c'; ctx.lineWidth = 1.5;
      ctx.beginPath(); proposal.quad.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.stroke();
      const [tx, ty] = proposal.quad[0]; ctx.fillStyle = '#18272a'; ctx.fillRect(tx - 18, Math.max(0, ty - 17), 38, 16); ctx.fillStyle = 'white'; ctx.font = '12px sans-serif'; ctx.fillText(entry.label, tx - 16, Math.max(12, ty - 4));
    }
    cc.fillStyle = '#172a35'; cc.font = '12px sans-serif'; cc.fillText(`${entry.label} ${entry.id}`, x + 2, y + 187); cc.fillText(proposal.status, x + 2, y + 201);
    console.log(entry.label, entry.id, proposal.status, Boolean(proposal.quad), proposal.elapsedMs.toFixed(1));
  } catch (error) { record.error = error.message; console.log(entry.id, error.message); }
}
const document = { runId, sourceHashes, source: { ...catalog, cases: undefined, sha256: hash(await fs.readFile(catalog.file)), originalSha256: hash(await fs.readFile(catalog.originalFile)), rgbaSha256: hash(data) }, settings: { maxSize: 650 }, results };
await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(document, null, 2));
await fs.writeFile(path.join(output, 'outlines.png'), canvas.toBuffer('image/png'));
await fs.writeFile(path.join(output, 'contact-sheet.png'), contact.toBuffer('image/png'));
console.log(`Locator evidence: ${output}`);
