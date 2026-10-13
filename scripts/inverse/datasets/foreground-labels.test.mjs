import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCanvas, loadImage } from 'canvas';
import { Resvg } from '@resvg/resvg-js';
import { photoForeground, foregroundPNG, verifyForegroundPNG } from './foreground-labels.mjs';
import { syntheticPhoto, project } from './synthetic-photo.mjs';
import { generateSynthetic } from './synthetic-generate.mjs';
import { generateForegroundDataset, verifyForegroundDataset } from './foreground-dataset.mjs';
import { sha256 } from './synthetic-geometry.mjs';

const labels = h => ({ schema: 'woven-heart-synthetic-view-1', resolution: 160, canonicalToPhoto: h });
async function pixels(png) {
  const image = await loadImage(png), ctx = createCanvas(image.width, image.height).getContext('2d');
  ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, image.width, image.height).data;
}

test('full foreground agrees with independently rasterized physical outlines under pose and clipping', async () => {
  for (const h of [[.8, 0, 50, 0, .8, 50, 0, 0, 1], [.6, -.4, 65, .4, .6, 30, 0, 0, 1], [1.1, .2, -20, -.1, 1, 30, .001, -.002, 1]]) {
    // A dense projected outline, rasterized by resvg independently of the
    // inverse-transform region test. Antialiased perimeter pixels are excluded.
    const points = [];
    for (let i = 0; i <= 2048; i++) { const t = Math.PI * i / 2048; points.push([50 - 50 * Math.cos(t), -50 * Math.sin(t)]); }
    points.push([100, 100], [0, 100]);
    for (let i = 0; i <= 2048; i++) { const t = Math.PI * i / 2048; points.push([-50 * Math.sin(t), 50 + 50 * Math.cos(t)]); }
    const polygon = points.map(p => project(h, p).join(',')).join(' ');
    const rendered = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><polygon points="${polygon}" fill="black"/></svg>`).render().asPng();
    const rgba = await pixels(rendered), mask = photoForeground(labels(h)); let compared = 0;
    for (let i = 0; i < mask.length; i++) if (rgba[4 * i + 3] === 0 || rgba[4 * i + 3] === 255) {
      assert.equal(mask[i], Number(rgba[4 * i + 3] === 255), `pixel ${i}, camera ${h}`); compared++;
    }
    assert.ok(compared > .94 * mask.length);
    assert.ok(mask.reduce((s, v) => s + v, 0) > 1000);
    const checked = await verifyForegroundPNG(foregroundPNG(mask, 160), labels(h));
    assert.equal(checked.foregroundPixels, mask.reduce((s, v) => s + v, 0));
  }
});

test('both lobes and paper B remain foreground even when paper-A coverage is zero', async () => {
  const input = { coverage: new Float32Array(32 * 32), canonicalResolution: 32, graph: { nodes: [] }, seed: 9281, resolution: 128 };
  const original = await syntheticPhoto(input), changed = await syntheticPhoto({ ...input, interventions: { palette: [[130, 90, 20], [155, 115, 45]], glare: { center: [.5, .5], sigma: [.4, .4], amount: .9 }, blurSigmaPixels: 2, jpegQuality: .2, cropNoisePixels: 0 } });
  assert.notDeepEqual(original.files['photo.jpg'], changed.files['photo.jpg']);
  const mask = photoForeground(original.labels);
  assert.deepEqual(mask, photoForeground(changed.labels));
  const overlap = await pixels(original.files['photo-overlap-valid.png']), paperA = await pixels(original.files['photo-paper-a.png']);
  let lobeB = 0, lobeA = 0, overlapB = 0, background = 0;
  for (let i = 0; i < mask.length; i++) {
    if (overlap[4 * i] === 255) { assert.equal(mask[i], 1); if (!paperA[4 * i]) overlapB++; }
    else if (mask[i]) { if (paperA[4 * i]) lobeA++; else lobeB++; }
    else background++;
  }
  assert.ok(lobeA > 100 && lobeB > 100 && overlapB > 1000 && background > 1000);
});

test('malformed and unsupported geometry labels are rejected', () => {
  const valid = labels([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  for (const value of [null, { ...valid, schema: 'unknown' }, { ...valid, resolution: 15 }, { ...valid, canonicalToPhoto: Array(9) }, { ...valid, canonicalToPhoto: Array(9).fill(0) }]) assert.throws(() => photoForeground(value));
  assert.throws(() => foregroundPNG(new Uint8Array(15), 4));
  assert.throws(() => foregroundPNG(new Uint8Array(16).fill(2), 4));
});

test('sidecar export preserves source identities and splits and rejects altered supervision', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'heart-foreground-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dataset = path.join(root, 'source'), output = path.join(root, 'labels');
  await generateSynthetic({ output: dataset, designs: 4, views: 1, resolution: 64, canonicalResolution: 128, seed: 713051 });
  const before = await fs.readFile(path.join(dataset, 'manifest.json'));
  const audit = await generateForegroundDataset({ dataset, output }); assert.equal(audit.passed, true); assert.equal(audit.views, 4);
  assert.deepEqual(await fs.readFile(path.join(dataset, 'manifest.json')), before);
  await assert.rejects(generateForegroundDataset({ dataset, output }), /EEXIST/);
  const filename = path.join(output, 'manifest.json'), original = JSON.parse(await fs.readFile(filename)), altered = structuredClone(original);
  altered.views[0].split = 'test'; await fs.writeFile(filename, JSON.stringify(altered));
  await assert.rejects(verifyForegroundDataset({ dataset, output }), /identity or split/);
  altered.views[0] = structuredClone(original.views[0]); altered.views[0].foreground.path = '../outside.png'; await fs.writeFile(filename, JSON.stringify(altered));
  await assert.rejects(verifyForegroundDataset({ dataset, output }), /escapes/);
  const corrupt = foregroundPNG(new Uint8Array(64 * 64), 64), record = structuredClone(original);
  record.views[0].foreground.sha256 = sha256(corrupt);
  await fs.writeFile(path.join(output, record.views[0].foreground.path), corrupt); await fs.writeFile(filename, JSON.stringify(record));
  // A matching checksum alone cannot certify an all-background target.
  await assert.rejects(verifyForegroundDataset({ dataset, output }), /physical paper geometry/);
});
