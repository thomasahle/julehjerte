import test from 'node:test';
import assert from 'node:assert/strict';
import {fitHeartSilhouette} from '../../static/inverse/neural/heart-fit.js';
import {detectPhotoCrops, detectSilhouetteCrop, checkedBySilhouette, selectedSilhouette} from '../../static/inverse/neural/photo-crop.js';

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

test('a crop the silhouette agrees with is confident, one far from it is for review', () => {
  const quad = [[300, 150], [500, 350], [300, 550], [100, 350]], side = 200 * Math.SQRT2;
  const silhouette = {quad: quad.map(([x, y]) => [x + .02 * side, y]), iou: .97};
  const crop = (dx, method = 'colour-locator', needsReview = true) => ({quad: quad.map(([x, y]) => [x + dx * side, y]), status: needsReview ? 'needs_review' : 'candidate', needsReview, provenance: {method}});
  const near = checkedBySilhouette(crop(0), silhouette);
  assert.equal(near.needsReview, false);
  assert.equal(near.status, 'candidate');
  assert.ok(Math.abs(near.provenance.silhouetteAgreement - .02) < 1e-9);
  // Between the two, the crop keeps its own flag; far off, it is for review.
  assert.equal(checkedBySilhouette(crop(-.04), silhouette).needsReview, true);
  assert.equal(checkedBySilhouette(crop(-.04, 'colour-locator', false), silhouette).needsReview, false);
  assert.equal(checkedBySilhouette(crop(.2, 'colour-locator', false), silhouette).needsReview, true);
  // The silhouette's own crop, or a loose silhouette, decides nothing.
  const own = crop(0, 'paper-silhouette');
  assert.equal(checkedBySilhouette(own, silhouette), own);
  assert.equal(checkedBySilhouette(crop(0), {...silhouette, iou: .8}).needsReview, true);
});

test('a colour crop the paper is not under gives way to the silhouette when that lies far from it', async () => {
  // A heart in a 640 x 640 picture. The colour locator's crop comes with its
  // outline: the lobes as half circles on the square's upper sides.
  const quad = [[300, 150], [500, 350], [300, 550], [100, 350]], side = 200 * Math.SQRT2, W = 640;
  const lobe = (a, b) => Array.from({length: 9}, (_, i) => {
    const t = Math.PI * (i + 1) / 10, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], r = [(a[0] - b[0]) / 2, (a[1] - b[1]) / 2];
    // From a over the side's outer half circle (away from the square) to b.
    return [m[0] + r[0] * Math.cos(t) + r[1] * Math.sin(t), m[1] + r[1] * Math.cos(t) - r[0] * Math.sin(t)];
  });
  const colour = (q, lobes = true) => ({status: 'needs_review', candidates: [{quad: q, status: 'needs_review', needsReview: true, provenance: {method: 'colour'},
    outline: [lobes ? lobe(q[0], q[1]) : [q[0], q[1]], [q[1], q[2]], [q[2], q[3]], lobes ? lobe(q[3], q[0]) : [q[3], q[0]]]}]});
  const none = () => ({status: 'not_found', candidates: []}), body = heartProbability(quad, W, W);
  const input = {type: 'pixels', imageWidth: W, imageHeight: W, rgba: new Uint8ClampedArray(W * W * 4)};
  const find = production => detectPhotoCrops(input, {productionCrop: () => production, predictBody: () => body, learnedCrop: none, outlineCrop: none});
  const shifted = (dx, dy) => quad.map(([x, y]) => [x + dx, y + dy]);
  // Half off the heart: the silhouette's corners instead, for review.
  const off = await find(colour(shifted(150, -110)));
  assert.equal(off.candidates[0].provenance.method, 'paper-silhouette');
  assert.equal(off.status, 'needs_review');
  off.candidates[0].quad.forEach((p, k) => assert.ok(Math.hypot(p[0] - quad[k][0], p[1] - quad[k][1]) < .05 * side, `corner ${k}: ${p} vs ${quad[k]}`));
  // On the heart, the colour crop stands.
  assert.deepEqual((await find(colour(quad))).candidates[0].quad, quad);
  // Its evidence failed (no lobes in its outline) but it is near the silhouette: it stands too.
  assert.deepEqual((await find(colour(shifted(8, 0), false))).candidates[0].quad, shifted(8, 0));
});

test('in a selection, a heart of printed papers is found by what differs from its background', () => {
  // Two printed papers (pink with white dots, red with white stripes) on a
  // dark table, a neighbour's lobe poking into the selection's corner.
  const W = 700, H = 600, quad = [[350, 150], [550, 350], [350, 550], [150, 350]], rgba = new Uint8ClampedArray(W * H * 4);
  const on = heartProbability(quad, W, H, 700).probability;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = 4 * (y * W + x), inside = on[Math.floor(y * 700 / H) * 700 + Math.floor(x * 700 / W)] > .5;
    const neighbour = Math.hypot(x - 690, y - 590) < 70;
    let c = [40, 38, 42];
    if (inside) c = (x + y) % 80 < 40 ? ((x % 12 < 3 && y % 12 < 3) ? [250, 250, 250] : [240, 170, 180]) : (x % 16 < 3 ? [250, 250, 250] : [190, 40, 50]);
    else if (neighbour) c = [200, 160, 90];
    rgba.set([...c, 255], p);
  }
  const input = {type: 'pixels', imageWidth: W, imageHeight: H, rgba}, roi = [60, 60, 680, 580];
  const found = selectedSilhouette(input, roi, {status: 'needs_review', candidates: []});
  assert.equal(found.candidates.length, 1);
  assert.equal(found.candidates[0].provenance.method, 'background-silhouette');
  const side = 200 * Math.SQRT2;
  found.candidates[0].quad.forEach((p, k) => assert.ok(Math.hypot(p[0] - quad[k][0], p[1] - quad[k][1]) < .06 * side, `corner ${k}: ${p} vs ${quad[k]}`));
  // A selection of plain background finds nothing.
  assert.equal(selectedSilhouette(input, [0, 0, 120, 120], {status: 'needs_review', candidates: []}).candidates.length, 0);
});

