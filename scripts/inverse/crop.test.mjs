import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createCanvas, loadImage } from 'canvas';
import { detectHeartCrops, refineHeartCrop, pixelCentresToEdges, pixelEdgesToCentres } from '../../static/inverse/core/crop.js';
import { rectifyMotif } from '../../static/inverse/locator/locator.js';
import { rectify } from '../../static/inverse/core/input.js';
import { prepare } from '../../static/inverse/core/engine.js';
import { heartPhoto } from './crop-fixture.mjs';

const error = (a, b) => Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));
const expected = [[190, 80], [275, 155], [190, 230], [105, 155]];
test('automatic fitting finds the overlap corners, with provenance and editable outline', () => {
  const result = detectHeartCrops(heartPhoto());
  assert.equal(result.candidates.length, 1);
  assert.ok(error(result.candidates[0].quad, expected) < 6);
  assert.equal(result.candidates[0].outline.length, 4);
  assert.deepEqual(result.candidates[0].provenance.sourceDimensions, [380, 320]);
});
test('blank or transparent images have no heart proposals', () => {
  const input = heartPhoto({ hearts: [] });
  assert.deepEqual(detectHeartCrops(input).candidates, []);
  input.rgba.fill(0);
  assert.deepEqual(detectHeartCrops(input).candidates, []);
});
test('tiny artwork can skip automatic detection without rejecting the upload', () => {
  const result = detectHeartCrops({ imageWidth: 16, imageHeight: 16, rgba: new Uint8ClampedArray(16 * 16 * 4) });
  assert.equal(result.status, 'not_found');
  assert.deepEqual(result.candidates, []);
});
for (const colours of [['#ffe416', '#867309'], ['#080907', '#ac8d3e'], ['#0068bb', '#ce1471'], ['#19ce12', '#897820']]) {
  test(`plain-background paper palette ${colours.join('/')}: automatic corners and original pixels`, () => {
    const input = heartPhoto({ colours, background: '#ffffff', lobeDepths: [.66, .61] });
    const before = input.rgba.slice(), result = detectHeartCrops(input);
    assert.equal(result.candidates.length, 1);
    assert.ok(error(result.candidates[0].quad, expected) < 6);
    assert.equal(result.candidates[0].locator.evidence.palette.method, 'two-paper-colours-on-plain-background');
    assert.deepEqual(input.rgba, before);
  });
}
test('transparent-background coloured heart uses alpha without classifying transparency as paper', () => {
  const input = heartPhoto({ background: 'transparent', colours: ['#094ba0', '#efafc0'] });
  const result = detectHeartCrops(input);
  assert.equal(result.candidates.length, 1);
  assert.ok(error(result.candidates[0].quad, expected) < 6);
});
test('a plain background does not make two-colour circles or rectangles into heart proposals', () => {
  for (const shape of ['circle', 'rectangle']) {
    const canvas = createCanvas(380, 320), ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 380, 320);
    ctx.save(); ctx.beginPath();
    if (shape === 'circle') ctx.arc(190, 160, 100, 0, Math.PI * 2);
    else ctx.rect(90, 60, 200, 200);
    ctx.clip(); ctx.fillStyle = '#ffde00'; ctx.fillRect(0, 0, 190, 320); ctx.fillStyle = '#856300'; ctx.fillRect(190, 0, 190, 320); ctx.restore();
    assert.deepEqual(detectHeartCrops({ imageWidth: 380, imageHeight: 320, rgba: ctx.getImageData(0, 0, 380, 320).data }).candidates, []);
  }
});
test('an existing perturbed crop supplies a full-heart region for fitting', () => {
  const initial = expected.map(([x, y]) => [x + 7, y - 5]);
  const result = refineHeartCrop(heartPhoto(), initial);
  assert.equal(result.candidates.length, 1);
  assert.ok(error(result.candidates[0].quad, expected) < error(initial, expected));
});
test('rough region selects one heart in a scene containing two', () => {
  const input = heartPhoto({ width: 700, hearts: [[190, 80, 85, 75, -85, 75], [520, 80, 85, 75, -85, 75]] });
  assert.equal(detectHeartCrops(input).status, 'needs_selection');
  const result = detectHeartCrops(input, { roi: [415, 45, 625, 240] });
  assert.equal(result.candidates.length, 1);
  assert.ok(error(result.candidates[0].quad, expected.map(([x, y]) => [x + 330, y])) < 6);
});
test('invalid or out-of-frame rough regions are rejected', () => {
  for (const roi of [[0, 0, 2, 2], [500, 500, 600, 600], [0, 0, NaN, 100]]) assert.throws(() => detectHeartCrops(heartPhoto(), { roi }));
});
test('photo preview and preprocessing agree after the pixel-centre to pixel-edge conversion', () => {
  const input = heartPhoto(), native = [[188.1, 79.3], [279.2, 155.7], [189.8, 232.6], [103.3, 157.4]];
  const edges = pixelCentresToEdges(native);
  assert.deepEqual(pixelEdgesToCentres(edges), native);
  const rgb = rectify(input.rgba, input.imageWidth, input.imageHeight, 240, edges);
  const preview = rectifyMotif({ width: input.imageWidth, height: input.imageHeight, data: input.rgba }, native, { size: 240 });
  for (let i = 0; i < preview.valid.length; i++) for (let c = 0; c < 3; c++) assert.ok(Math.abs(rgb[3 * i + c] - preview.data[4 * i + c]) <= 1);
});
test('photo rectification accepts either perimeter direction and preserves the supplied mapping', () => {
  const input = heartPhoto();
  // An asymmetric pixel field catches accidental mirroring while reversing the winding.
  for (let y = 0; y < input.imageHeight; y++) for (let x = 0; x < input.imageWidth; x++) {
    input.rgba.set([x % 256, y % 256, (x + 3 * y) % 256, 255], 4 * (y * input.imageWidth + x));
  }
  const image = { width: input.imageWidth, height: input.imageHeight, data: input.rgba };
  const clockwise = [[188.1, 79.3], [279.2, 155.7], [189.8, 232.6], [103.3, 157.4]];
  for (const ring of [clockwise, [clockwise[0], clockwise[3], clockwise[2], clockwise[1]]]) {
    for (let start = 0; start < 4; start++) {
      const quad = ring.slice(start).concat(ring.slice(0, start)), before = structuredClone(quad);
      const preview = rectifyMotif(image, quad, { size: 80 });
      const rgb = rectify(input.rgba, input.imageWidth, input.imageHeight, 80, pixelCentresToEdges(quad));
      assert.deepEqual(quad, before, "Rectifying must not reorder the user's stored corners");
      assert.equal(preview.valid.reduce((a, b) => a + b, 0), 80 * 80);
      for (let i = 0; i < preview.valid.length; i++) for (let c = 0; c < 3; c++) assert.ok(Math.abs(rgb[3 * i + c] - preview.data[4 * i + c]) <= 1);
    }
  }
});
test('both winding directions still reject crossed, concave and degenerate crops', () => {
  const input = heartPhoto(), image = { width: input.imageWidth, height: input.imageHeight, data: input.rgba };
  for (const quad of [
    [[50, 50], [150, 150], [150, 50], [50, 150]],
    [[50, 50], [150, 50], [75, 75], [50, 150]],
    [[50, 50], [100, 50], [150, 50], [50, 150]],
    [[50, 50], [150, 50], [150, 150], [50, 50]],
  ]) for (const ring of [quad, [...quad].reverse()]) assert.throws(() => rectifyMotif(image, ring, { size: 80 }), /convex quadrilateral/);
});
test('the accepted source crop and manual-edit provenance survive preparation', () => {
  const provenance = { manuallyEdited: true, acceptedPixelEdgeCorners: expected, filename: 'local-heart.png' };
  const result = prepare({ ...heartPhoto(), quad: expected, cropProvenance: provenance }, { resolution: 100 });
  assert.deepEqual(result.preview.metadata.sourceImage.cropProvenance, provenance);
  assert.deepEqual(result.target.metadata.sourceImage.cropCorners, expected);
});
const fixtures = JSON.parse(await fs.readFile(new URL('./fixtures/locator/manifest.json', import.meta.url)));
for (const fixture of fixtures) test(`known-homography locator fixture ${fixture.id}: ${fixture.kind}`, async () => {
  const im = await loadImage(new URL(`./fixtures/locator/${fixture.id}.png`, import.meta.url).pathname);
  const canvas = createCanvas(im.width, im.height), ctx = canvas.getContext('2d'); ctx.drawImage(im, 0, 0);
  const result = detectHeartCrops({ imageWidth: im.width, imageHeight: im.height, rgba: ctx.getImageData(0, 0, im.width, im.height).data });
  assert.equal(result.candidates.length, 1);
  assert.ok(error(pixelEdgesToCentres(result.candidates[0].quad), fixture.quad) < 6);
});
