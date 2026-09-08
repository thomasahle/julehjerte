import test from 'node:test';
import assert from 'node:assert/strict';
import { unmixRGB, redWhiteMixture } from '../../static/inverse/core/unmix.js';
import { quantize } from '../../static/inverse/core/input.js';

const red = [.62, .09, .15], white = [.9, .85, .84];
const blend = (p, light = 1) => red.map((v, k) => light * (p * v + (1 - p) * white[k]));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('paper mixture recovers coverage independently of scalar lighting', () => {
  for (const light of [.35, .8, 1.2]) {
    const fractions = Array.from({ length: 31 }, (_, i) => i / 30);
    const result = unmixRGB(fractions.flatMap(p => blend(p, light)), red, white);
    fractions.forEach((p, i) => { near(result.probability[i], p); near(result.illumination[i], light); near(result.residual[i], 0); });
  }
});

test('equal red/white mixtures stay at the boundary instead of eroding red', () => {
  const chroma = c => (c[0] - c[1]) / (c[0] + c[1]);
  const legacy = (chroma(blend(.5)) - chroma(white)) / (chroma(red) - chroma(white));
  assert.ok(legacy < .35);
  near(unmixRGB(blend(.5), red, white).probability[0], .5);
});

test('NNLS projects out-of-palette pixels onto the appropriate colour ray', () => {
  const rgb = [1, 0, 0, 0, 1, 0, 0, 0, 0], result = unmixRGB(rgb, red, white);
  assert.deepEqual([...result.probability], [1, 0, 0]);
  near(result.illumination[0], red[0] / red.reduce((s, v) => s + v * v, 0));
  near(result.illumination[1], white[1] / white.reduce((s, v) => s + v * v, 0));
});

test('indistinguishable palettes and invalid colours fail clearly', () => {
  for (const palette of [[1, 1, 1], [0, 0, 0], [-1, 0, 0], [NaN, 0, 0]]) assert.throws(() => unmixRGB([1, 1, 1], palette, [1, 1, 1]));
  for (const rgb of [[], [1, 1], [1, Infinity, 1], [1, -1, 1]]) assert.throws(() => unmixRGB(rgb, red, white));
  assert.throws(() => redWhiteMixture(new Uint8Array(32 * 32 * 3)), /both red and white/);
});

test('photograph preparation estimates palettes from the image and preserves inversion', () => {
  const n = 64, rgb = new Uint8Array(n * n * 3);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const p = x < 24 ? 0 : x >= 40 ? 1 : (x - 24) / 15;
    rgb.set(blend(p).map(v => Math.round(255 * v)), 3 * (y * n + x));
  }
  const preserved = rgb.slice(), q = quantize(rgb, { mode: 'red-white-mixture' }), inverted = quantize(rgb, { mode: 'red-white-mixture', invert: true });
  assert.deepEqual(rgb, preserved);
  assert.deepEqual(inverted.mask, q.mask.map(v => v ^ 1));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) assert.equal(q.mask[y * n + x], Number(x >= 32));
  q.metadata.mixture.paperPalettesSRGB.flat().forEach((v, i) => assert.ok(Math.abs(v - [...red, ...white][i]) <= 1 / 255));
  assert.ok(q.metadata.mixture.rmsColorResidual < .005);
});
