import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedPaperPrints, printAlpha, printedPaperColors } from './synthetic-print.mjs';
import { syntheticPhoto, project, invert } from './synthetic-photo.mjs';
import { createCanvas, loadImage } from 'canvas';

const stripe = { kind: 'stripes', period: 12, angle: 0, phase: [0, 0], width: .3, opacity: .9, ink: [20, 40, 80] };
const flower = { ...stripe, kind: 'flowers', period: 18, phase: [.25, .1], ink: [220, 30, 60] };
const fixture = () => ({ coverage: new Float32Array(64 * 64).fill(.25), canonicalResolution: 64, graph: { nodes: [[0, 0], [100, 100]] }, seed: 9281, resolution: 96 });
const pixels = async bytes => { const image = await loadImage(bytes), ctx = createCanvas(image.width, image.height).getContext('2d'); ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, image.width, image.height).data; };

test('prints repeat in sheet coordinates with independent transposed second-sheet orientation', () => {
  assert.equal(printAlpha([0, 0], stripe), .9);
  assert.equal(printAlpha([6, 0], stripe), 0);
  const palette = [[200, 200, 200], [220, 220, 220]];
  const result = printedPaperColors([0, 6], palette, [stripe, stripe]);
  assert.deepEqual(result[1], palette[1]);
  result[0].forEach((value, i) => assert.ok(Math.abs(value - (.1 * 200 + .9 * stripe.ink[i])) < 1e-12));
  for (const kind of ['stripes', 'dots', 'flowers']) {
    const spec = { ...flower, kind, angle: .37 }, theta = spec.angle;
    for (const point of [[5, 9], [99, 30], [-17, -31]]) {
      const shifted = [point[0] + spec.period * Math.cos(theta), point[1] + spec.period * Math.sin(theta)];
      assert.ok(Math.abs(printAlpha(point, spec) - printAlpha(shifted, spec)) < 1e-12);
    }
  }
});

test('print validation copies arrays and rejects malformed or ambiguous definitions', () => {
  const input = [structuredClone(stripe), null], result = checkedPaperPrints(input);
  input[0].ink[0] = 250; input[0].phase[0] = .5;
  assert.deepEqual(result, [stripe, null]);
  for (const value of [null, [], [stripe], [stripe, ,], [{ ...stripe, kind: 'text' }, null], [{ ...stripe, period: 0 }, null], [{ ...stripe, opacity: NaN }, null], [{ ...stripe, ink: [1, 2, 999] }, null], [{ ...stripe, phase: [1, 0] }, null], [{ ...stripe, unknown: true }, null]]) {
    assert.throws(() => checkedPaperPrints(value), /print/i);
  }
});

test('decorative ink preserves exact camera, graph and undegraded material targets', async () => {
  const input = fixture(), before = input.coverage.slice(), baseline = await syntheticPhoto(input);
  const requested = [flower, stripe], printed = await syntheticPhoto({ ...input, interventions: { paperPrints: requested } });
  for (const key of ['canonicalToPhoto', 'canonicalToCrop', 'actualQuad', 'proposedCropQuad', 'nodesPhoto', 'nodesCrop']) assert.deepEqual(printed.labels[key], baseline.labels[key]);
  for (const key of ['photo-paper-a.png', 'photo-overlap-valid.png', 'crop-paper-a.png', 'crop-overlap-valid.png']) assert.deepEqual(printed.files[key], baseline.files[key]);
  assert.deepEqual(printed.labels.baselinePerturbations, baseline.labels.perturbations);
  assert.deepEqual(printed.labels.interventions, { requested: { paperPrints: requested }, applied: { paperPrints: requested } });
  assert.notDeepEqual(printed.files['photo.jpg'], baseline.files['photo.jpg']);
  assert.notDeepEqual(printed.files['crop.png'], baseline.files['crop.png']);
  assert.deepEqual(input.coverage, before);
  const repeated = await syntheticPhoto({ ...input, interventions: { paperPrints: requested } });
  assert.deepEqual(repeated, printed);
  for (const paperPrints of [[null, null], [{ ...flower, opacity: 0 }, { ...stripe, opacity: 0 }]]) {
    const noop = await syntheticPhoto({ ...input, interventions: { paperPrints } });
    assert.deepEqual(noop.files, baseline.files, 'Zero ink must preserve every legacy image byte and random draw.');
  }
});

test('printing one sheet changes that sheet while leaving a distant unprinted lobe intact', async () => {
  const input = fixture(), interventions = { blurSigmaPixels: 0, lowResolutionScale: 1, jpegQuality: 1 };
  const baseline = await syntheticPhoto({ ...input, interventions });
  const printed = await syntheticPhoto({ ...input, interventions: { ...interventions, paperPrints: [stripe, null] } });
  const a = await pixels(baseline.files['photo.jpg']), b = await pixels(printed.files['photo.jpg']), inverse = invert(baseline.labels.canonicalToPhoto);
  let changedA = 0, distanceB = 0, countB = 0;
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
    const [u, v] = project(inverse, [x + .5, y + .5]), i = 4 * (y * 96 + x);
    const delta = [0, 1, 2].reduce((sum, k) => sum + Math.abs(a[i + k] - b[i + k]), 0);
    if (v < -15 && (u - 50) ** 2 + v ** 2 < 35 ** 2 && delta > 30) changedA++;
    if (u < -15 && u ** 2 + (v - 50) ** 2 < 35 ** 2) { distanceB += delta; countB++; }
  }
  assert.ok(changedA > 5); assert.ok(countB > 20); assert.ok(distanceB / countB < 2, 'Allow only JPEG rounding far from any printed region.');
});

test('printed clutter keeps selected-material targets and distractor ownership unchanged', async () => {
  const input = fixture(), baseline = await syntheticPhoto({ ...input, interventions: { scene: 'neighbors-handle' } });
  const printed = await syntheticPhoto({ ...input, interventions: { scene: 'neighbors-handle', paperPrints: [flower, stripe] } });
  for (const key of Object.keys(baseline.files).filter(k => k !== 'photo.jpg' && k !== 'crop.png')) assert.deepEqual(printed.files[key], baseline.files[key]);
  assert.deepEqual(printed.labels.scene, baseline.labels.scene);
  assert.notDeepEqual(printed.files['photo.jpg'], baseline.files['photo.jpg']);
});
