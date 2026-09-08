/** Immutable downloaded photographs. Reference links never enter solver input. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createCanvas, loadImage} from 'canvas';

export const corpusRoot = new URL('./fixtures/web-photos/', import.meta.url);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function catalogue() {
  const data = JSON.parse(await fs.readFile(new URL('manifest.json', corpusRoot)));
  assert.equal(new Set(data.photos.map(p => p.id)).size, data.photos.length, 'Duplicate photo ID');
  assert.equal(new Set(data.photos.map(p => p.sha256)).size, data.photos.length, 'Duplicate image bytes');
  assert.equal(new Set(data.cases.map(c => c.id)).size, data.cases.length, 'Duplicate case ID');
  for (const photo of data.photos) {
    assert.match(photo.file, /^source\/[a-z0-9-]+\.jpg$/);
    assert.match(photo.sha256, /^[a-f0-9]{64}$/);
    for (const url of [photo.url, photo.sourcePage, ...photo.referenceLinks]) assert.equal(new URL(url).protocol, 'https:');
  }
  for (const entry of data.cases) {
    const photo = data.photos.find(p => p.id === entry.photo);
    assert.ok(photo, `Missing photo: ${entry.id}`);
    if (entry.roi) {
      const [x0, y0, x1, y1] = entry.roi;
      assert.ok(entry.roi.length === 4 && entry.roi.every(Number.isFinite));
      assert.ok(x0 >= 0 && y0 >= 0 && x1 > x0 && y1 > y0 && x1 <= photo.width && y1 <= photo.height, entry.id);
    }
  }
  return data;
}

export async function readPhoto(photo) {
  const bytes = await fs.readFile(new URL(photo.file, corpusRoot));
  assert.equal(sha256(bytes), photo.sha256, `Source photograph changed: ${photo.id}`);
  assert.equal(bytes.length, photo.bytes);
  const image = await loadImage(bytes);
  assert.deepEqual([image.width, image.height], [photo.width, photo.height]);
  const canvas = createCanvas(image.width, image.height), context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return {type: 'pixels', imageWidth: image.width, imageHeight: image.height, rgba: context.getImageData(0, 0, image.width, image.height).data};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = await catalogue();
  for (const photo of data.photos) {
    const file = new URL(photo.file, corpusRoot);
    if (process.argv.includes('--fetch-missing')) {
      try { await fs.access(file); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const response = await fetch(photo.url, {signal: AbortSignal.timeout(30000)});
        assert.ok(response.ok, `${photo.id}: HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(sha256(bytes), photo.sha256, `Upstream photograph changed: ${photo.id}`);
        await fs.writeFile(file, bytes, {flag: 'wx'});
      }
    }
    await readPhoto(photo);
  }
  console.log(`Verified ${data.photos.length} original photographs and ${data.cases.length} cases (hashes, dimensions, URLs, unique IDs, selection bounds).`);
}
