import test from 'node:test';
import assert from 'node:assert/strict';
import { syntheticPhoto, project } from './synthetic-photo.mjs';
import { sha256 } from './synthetic-geometry.mjs';
import { createCanvas, loadImage } from 'canvas';

function fixture() {
  const n = 32;
  return { coverage: Float32Array.from({ length: n * n }, (_, i) => (((i % n) >> 3) ^ (Math.floor(i / n) >> 3)) % 2), canonicalResolution: n, graph: { nodes: [[0, 0], [25, 25], [50, 50], [75, 75], [100, 100]] }, seed: 9281, resolution: 64 };
}
const baselinePromise = syntheticPhoto(fixture());
const targetFiles = ['photo-paper-a.png', 'photo-overlap-valid.png', 'crop-paper-a.png', 'crop-overlap-valid.png'];
function sameFiles(a, b, keys = Object.keys(a.files)) { for (const key of keys) assert.deepEqual(a.files[key], b.files[key], key); }
function sameGeometry(a, b, crop = true) {
  for (const key of ['actualQuad', 'canonicalToPhoto', 'nodesPhoto', ...(crop ? ['proposedCropQuad', 'canonicalToCrop', 'nodesCrop'] : [])]) assert.deepEqual(a.labels[key], b.labels[key], key);
}
function unchangedParameters(actual, baseline, except) {
  for (const key of Object.keys(baseline.labels.perturbations)) if (!except.includes(key)) assert.deepEqual(actual.labels.perturbations[key], baseline.labels.perturbations[key], key);
  assert.deepEqual(actual.labels.baselinePerturbations, baseline.labels.perturbations);
}

test('default and empty-intervention renders retain prechange files and labels', async () => {
  const baseline = await baselinePromise;
  // Recorded with source dd4df10 before introducing interventions. Dependency
  // upgrades that alter image encoding need an explicit reproducibility audit.
  const hashes = {
    'photo.jpg': '91fabf0f6103a68acb03960df9df67001f5b9eab7563e76d630ad1b670474e82',
    'crop.png': 'eed3971b7f67c7a7af2c8334b8f4ea613a664a5cf4b56b0d24a59d3303e9d343',
    'photo-paper-a.png': '78c24a547f5bc8453aca04ecc0bc380a0e27ebba91ea77e75c4f09b7b06475dc',
    'photo-overlap-valid.png': 'fd3298844d6a496a63608a68ba022880bcd39c33a9cc94317fcfdb29ad895147',
    'crop-paper-a.png': '74b6d4e5b941e86a11d374f4a29189a96b61203fbfc5ed43e81e8af6b2d4a74c',
    'crop-overlap-valid.png': 'a83b34545a607120cd3fe24e5d4d081b22f7d5483ac5ffaed5b4fd392aaa9c23'
  };
  for (const [key, value] of Object.entries(hashes)) assert.equal(sha256(baseline.files[key]), value, key);
  assert.equal(sha256(JSON.stringify(baseline.labels)), '9747a31d25043b9c2d09a6d351920f7af6f48dbdef37312d76d6c3c8bc65a8b9');
  const empty = await syntheticPhoto({ ...fixture(), interventions: {} });
  sameFiles(empty, baseline); assert.deepEqual(empty.labels, baseline.labels);
  assert.equal(Object.hasOwn(baseline.labels, 'interventions'), false);
  assert.equal(Object.hasOwn(baseline.labels, 'baselinePerturbations'), false);
});

test('palette intervention recolors the same camera/noise realization with unchanged target PNGs', async () => {
  const baseline = await baselinePromise, input = fixture(), graph = JSON.stringify(input.graph), coverage = input.coverage.slice(), palette = [[180, 12, 18], [246, 242, 230]], before = structuredClone(palette);
  const recolored = await syntheticPhoto({ ...input, interventions: { palette } });
  unchangedParameters(recolored, baseline, ['palette']); sameGeometry(recolored, baseline); sameFiles(recolored, baseline, targetFiles);
  assert.deepEqual(recolored.labels.perturbations.palette, palette);
  assert.deepEqual(recolored.labels.interventions, { requested: { palette }, applied: { palette } });
  assert.notEqual(sha256(recolored.files['photo.jpg']), sha256(baseline.files['photo.jpg']));
  assert.notEqual(sha256(recolored.files['crop.png']), sha256(baseline.files['crop.png']));
  assert.equal(JSON.stringify(input.graph), graph); assert.deepEqual(input.coverage, coverage); assert.deepEqual(palette, before);
  // Restoring the sampled palette reproduces even the image bytes, proving the
  // override did not shift the texture/noise/crop random sequence.
  const noop = await syntheticPhoto({ ...fixture(), interventions: { palette: baseline.labels.perturbations.palette } });
  sameFiles(noop, baseline);
});

test('zero blur and individual degradation interventions preserve other draws and targets', async () => {
  const baseline = await baselinePromise;
  for (const intervention of [{ blurSigmaPixels: 0 }, { lowResolution: 24 }, { lowResolutionScale: .5 }, { jpegQuality: 1 }]) {
    const actual = await syntheticPhoto({ ...fixture(), interventions: intervention });
    const key = Object.keys(intervention)[0], appliedKey = key === 'lowResolutionScale' ? 'lowResolution' : key;
    unchangedParameters(actual, baseline, [appliedKey]); sameGeometry(actual, baseline); sameFiles(actual, baseline, targetFiles);
    const expected = key === 'lowResolutionScale' ? 32 : intervention[key];
    assert.equal(actual.labels.perturbations[appliedKey], expected);
    assert.deepEqual(actual.labels.interventions.applied, { [appliedKey]: expected });
    assert.notEqual(sha256(actual.files['photo.jpg']), sha256(baseline.files['photo.jpg']));
  }
  const scale = await syntheticPhoto({ ...fixture(), interventions: { lowResolutionScale: .5 } }), size = await syntheticPhoto({ ...fixture(), interventions: { lowResolution: 32 } });
  sameFiles(scale, size);
});

test('zero crop noise uses the exact physical square and does not regenerate the photograph', async () => {
  const baseline = await baselinePromise, actual = await syntheticPhoto({ ...fixture(), interventions: { cropNoisePixels: 0 } });
  unchangedParameters(actual, baseline, ['cropNoisePixels']); sameGeometry(actual, baseline, false);
  sameFiles(actual, baseline, ['photo.jpg', 'photo-paper-a.png', 'photo-overlap-valid.png']);
  assert.deepEqual(actual.labels.proposedCropQuad, actual.labels.actualQuad);
  for (const p of fixture().graph.nodes) {
    const projected = project(actual.labels.canonicalToCrop, p);
    p.forEach((v, i) => assert.ok(Math.abs(projected[i] - v * .64) < 1e-9));
  }
});

test('joint identity interventions preserve all images and actual legacy label fields', async () => {
  const baseline = await baselinePromise, p = baseline.labels.perturbations;
  const interventions = Object.fromEntries(['palette', 'blurSigmaPixels', 'lowResolution', 'jpegQuality', 'cropNoisePixels'].map(key => [key, p[key]]));
  const actual = await syntheticPhoto({ ...fixture(), interventions });
  sameFiles(actual, baseline);
  const { baselinePerturbations, interventions: recorded, ...legacy } = actual.labels;
  assert.deepEqual(legacy, baseline.labels); assert.deepEqual(baselinePerturbations, p); assert.deepEqual(recorded.requested, interventions);
});

test('localized glare changes photographed colors without changing geometry or material labels', async () => {
  const baseline = await baselinePromise, glare = { center: [.5, .5], sigma: [.3, .25], amount: .85 }, before = structuredClone(glare);
  const actual = await syntheticPhoto({ ...fixture(), interventions: { glare } });
  unchangedParameters(actual, baseline, []); sameGeometry(actual, baseline); sameFiles(actual, baseline, targetFiles);
  assert.notEqual(sha256(actual.files['photo.jpg']), sha256(baseline.files['photo.jpg']));
  assert.notEqual(sha256(actual.files['crop.png']), sha256(baseline.files['crop.png']));
  const decode = async bytes => {
    const image = await loadImage(bytes), ctx = createCanvas(image.width, image.height).getContext('2d');
    ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, image.width, image.height).data;
  };
  const valid = await decode(baseline.files['crop-overlap-valid.png']);
  const brightness = async result => {
    const pixels = await decode(result.files['crop.png']); let sum = 0, count = 0;
    for (let i = 0; i < valid.length; i += 4) if (valid[i] === 255) { sum += pixels[i] + pixels[i + 1] + pixels[i + 2]; count += 3; }
    return sum / count;
  };
  const mild = await syntheticPhoto({ ...fixture(), interventions: { glare: { ...glare, amount: .4 } } });
  assert.ok(await brightness(mild) > await brightness(baseline) + 5, 'Glare must brighten the photographed overlap.');
  assert.ok(await brightness(actual) > await brightness(mild) + 5, 'Stronger glare must brighten it further.');
  assert.deepEqual(actual.labels.interventions, { requested: { glare }, applied: { glare } });
  assert.deepEqual(glare, before);
  glare.center[0] = 0; assert.deepEqual(actual.labels.perturbations.glare, before, 'Recorded parameters cannot alias caller-owned arrays.');
  const noop = await syntheticPhoto({ ...fixture(), interventions: { glare: { ...before, amount: 0 } } });
  sameFiles(noop, baseline); sameGeometry(noop, baseline);
});

test('invalid interventions fail before reading image buffers', async () => {
  const invalid = [null, [], new Date(0), { [Symbol('unknown')]: 1 }, { palette: new Array(2) }, { palette: [new Array(3), [255, 255, 255]] }, { bogus: 1 }, { palette: [[0, 0], [255, 255, 255]] }, { palette: [[0, 0, NaN], [255, 255, 255]] }, { palette: [[0, 0, 256], [255, 255, 255]] }, { blurSigmaPixels: -1 }, { blurSigmaPixels: Infinity }, { lowResolution: 8 }, { lowResolution: 64.5 }, { lowResolutionScale: 0 }, { lowResolutionScale: 1.1 }, { lowResolution: 32, lowResolutionScale: .5 }, { jpegQuality: 2 }, { cropNoisePixels: -1 }, { cropNoisePixels: 17 }];
  const coverage = new Proxy({}, { get() { throw new Error('IMAGE_BUFFER_TOUCHED'); } });
  const glare = { center: [.5, .5], sigma: [.2, .2], amount: .8 };
  invalid.push(...[null, [], {}, { ...glare, extra: 1 }, { ...glare, amount: NaN }, { ...glare, amount: 1.1 }, { ...glare, center: new Array(2) }, { ...glare, center: [-.1, .5] }, { ...glare, sigma: [0, .2] }].map(glare => ({ glare })));
  for (const interventions of invalid) await assert.rejects(syntheticPhoto({ ...fixture(), coverage, interventions }), error => error.message !== 'IMAGE_BUFFER_TOUCHED');
});
