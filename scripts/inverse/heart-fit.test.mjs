import test from 'node:test';
import assert from 'node:assert/strict';
import {fitHeartSilhouette} from '../../static/inverse/neural/heart-fit.js';
import {detectSilhouetteCrop} from '../../static/inverse/neural/photo-crop.js';

// A heart's paper probability on a 320² grid over a W x H picture: the square
// with corners cleft, right, tip, left and a half-disc lobe on each upper side.
function heartProbability(quad, W, H, n = 320) {
  const [c, r, , l] = quad, probability = new Float32Array(n * n);
  const u = [r[0] - c[0], r[1] - c[1]], v = [l[0] - c[0], l[1] - c[1]], det = u[0] * v[1] - u[1] * v[0];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + .5) * W / n - c[0], y = (j + .5) * H / n - c[1];
    const a = (x * v[1] - y * v[0]) / det, b = (u[0] * y - u[1] * x) / det;
    const on = (a >= 0 && b >= 0 && a <= 1 && b <= 1) || (b < 0 && (a - .5) ** 2 + b ** 2 <= .25) || (a < 0 && a ** 2 + (b - .5) ** 2 <= .25);
    probability[j * n + i] = on ? .99 : .003;
  }
  return {probability, resolution: n, window: [0, 0, W, H]};
}
const turn = (p, o, angle) => [o[0] + (p[0] - o[0]) * Math.cos(angle) - (p[1] - o[1]) * Math.sin(angle), o[1] + (p[0] - o[0]) * Math.sin(angle) + (p[1] - o[1]) * Math.cos(angle)];

test('the silhouette fit finds a turned heart that the picture cuts off, cleft first and clockwise', () => {
  // Upright: cleft at the top, right, tip, left; then turned 25 degrees and
  // moved so the left lobe leaves the 800 x 700 picture.
  const upright = [[300, 200], [500, 400], [300, 600], [100, 400]], quad = upright.map(p => turn(p, [300, 400], 25 * Math.PI / 180)).map(([x, y]) => [x - 60, y]);
  const fit = fitHeartSilhouette(heartProbability(quad, 800, 700));
  assert.ok(fit.iou > .95, `iou ${fit.iou}`);
  const side = 200 * Math.SQRT2;
  fit.quad.forEach((p, k) => assert.ok(Math.hypot(p[0] - quad[k][0], p[1] - quad[k][1]) < .05 * side, `corner ${k}: ${p} vs ${quad[k]}`));
});

test('paper filling the whole picture fits no heart', () => {
  const n = 320, probability = new Float32Array(n * n).fill(.99);
  assert.equal(fitHeartSilhouette({probability, resolution: n, window: [0, 0, 600, 600]}), null);
});

test('a silhouette crop needs a close fit and is always for review', () => {
  const quad = [[300, 150], [500, 350], [300, 550], [100, 350]], body = heartProbability(quad, 640, 640);
  const crop = detectSilhouetteCrop({type: 'pixels', imageWidth: 640, imageHeight: 640}, body);
  assert.equal(crop.provenance.method, 'paper-silhouette');
  assert.equal(crop.needsReview, true);
  crop.quad.forEach((p, k) => assert.ok(Math.hypot(p[0] - quad[k][0], p[1] - quad[k][1]) < 6, `corner ${k}`));
  const noise = {...body, probability: body.probability.map((_, i) => (i * 7919) % 13 < 6 ? .9 : .1)};
  assert.equal(detectSilhouetteCrop({type: 'pixels', imageWidth: 640, imageHeight: 640}, noise), null);
});
