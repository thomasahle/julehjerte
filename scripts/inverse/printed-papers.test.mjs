import test from 'node:test';
import assert from 'node:assert/strict';
import {preprocessPixels} from '../../static/inverse/core/input.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';

// A photographed heart of two printed papers, both printed in white: the right
// paper pink with white dots, the left red with white stripes. Its square,
// 200 px at (100, 100), is woven 4 x 4; the lobes lie above and to the left.
function photo({printed = true} = {}) {
  const W = 400, H = 400, rgba = new Uint8ClampedArray(W * H * 4).fill(255);
  const paper = (right, x, y) => right
    ? (printed && x % 14 < 4 && y % 14 < 4 ? [250, 250, 250] : [235, 160, 175])
    : (printed && (x + y) % 18 < 4 ? [250, 250, 250] : [185, 35, 45]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = [70, 80, 70];
    const u = (x - 100) / 200, v = (y - 100) / 200;
    if (u >= 0 && v >= 0 && u < 1 && v < 1) c = paper((Math.floor(4 * u) + Math.floor(4 * v)) % 2 === 0, x, y);
    else if (v < 0 && (u - .5) ** 2 + v ** 2 <= .25) c = paper(true, x, y);
    else if (u < 0 && u ** 2 + (v - .5) ** 2 <= .25) c = paper(false, x, y);
    rgba.set([...c, 255], 4 * (y * W + x));
  }
  return {rgba, imageWidth: W, imageHeight: H, quad: [[100, 100], [300, 100], [300, 300], [100, 300]]};
}
const settings = {...AUTOMATIC_PRESET, width: 100, minWidth: 2, resolution: 200, mode: 'auto', photoImport: true};
const agreement = ({mask, n}) => {
  let right = 0;
  for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) right += mask[v * n + u] === ((Math.floor(4 * u / n) + Math.floor(4 * v / n)) % 2 === 0 ? 1 : 0);
  return right / (n * n);
};

test('printed papers are told apart by their lobes\' whole colours, print and all', () => {
  const out = preprocessPixels({...photo(), settings});
  assert.equal(out.target.metadata.preprocessing.method, 'printed-lobes');
  assert.ok(agreement(out) > .985, `agreement ${agreement(out)}`);
});

test('plain papers keep their lobes\' two colours', () => {
  const out = preprocessPixels({...photo({printed: false}), settings});
  assert.equal(out.target.metadata.preprocessing.method, 'lobes');
  assert.ok(agreement(out) > .99, `agreement ${agreement(out)}`);
});
