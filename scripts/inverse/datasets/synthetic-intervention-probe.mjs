/** Replay selected synthetic views with single-factor photographic changes.
 * No model inference, fitting or scoring happens here. Reference cuts are labels.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { geometryHash, sha256 } from './synthetic-geometry.mjs';
import { syntheticPhoto, project, SQUARE } from './synthetic-photo.mjs';
import { renderExportedWeave } from '../export-renderer.mjs';
import { loadSolutionJSON } from '../../../static/inverse/core/graph.js';

export const PROBE_VARIANTS = [
  { name: 'baseline' },
  { name: 'palette-red-cream', interventions: { palette: [[176, 18, 28], [241, 237, 218]] } },
  { name: 'blur0', interventions: { blurSigmaPixels: 0 } },
  { name: 'full-resolution', interventions: { lowResolutionScale: 1 } },
  { name: 'jpeg1', interventions: { jpegQuality: 1 } },
  { name: 'exact-crop', interventions: { cropNoisePixels: 0 } }
];
export const GLARE_VARIANTS = [
  { name: 'baseline' },
  { name: 'glare-mild', interventions: { glare: { center: [.5, .5], sigma: [.22, .22], amount: .55 } } },
  { name: 'glare-strong', interventions: { glare: { center: [.5, .5], sigma: [.22, .22], amount: .85 } } },
  { name: 'glare-offset', interventions: { glare: { center: [.65, .38], sigma: [.22, .22], amount: .85 } } }
];
export const BACKGROUND_VARIANTS = [
  { name: 'baseline' },
  { name: 'background-white', interventions: { background: [255, 255, 255] } },
  { name: 'background-black', interventions: { background: [0, 0, 0] } },
  { name: 'background-gray', interventions: { background: [128, 128, 128] } },
  { name: 'background-plain', interventions: { backgroundStyle: 'plain' } },
  { name: 'background-white-plain', interventions: { background: [255, 255, 255], backgroundStyle: 'plain' } }
];
export const SCENE_VARIANTS = [
  { name: 'baseline' },
  { name: 'scene-neighbors', interventions: { scene: 'neighbors' } },
  { name: 'scene-handle', interventions: { scene: 'handle' } },
  { name: 'scene-combined', interventions: { scene: 'neighbors-handle' } }
];
export const SCENE_TRAINING_VARIANTS = [
  { name: 'baseline' },
  ...BACKGROUND_VARIANTS.map(variant => ({ name: `scene-${variant.name}`, pairedBackgroundVariant: variant.name,
    interventions: { ...variant.interventions, scene: 'neighbors-handle' } }))
];
const print = (kind, period, angle, phase, width, ink) => ({ kind, period, angle, phase, width, opacity: .9, ink });
export const PRINT_VARIANTS = [
  { name: 'baseline' },
  { name: 'print-flowers', interventions: { paperPrints: [print('flowers', 15, .2, [.1, .3], .35, [35, 80, 130]), null] } },
  { name: 'print-stripes-dots', interventions: { paperPrints: [print('stripes', 9, -.4, [.2, .1], .3, [240, 225, 210]), print('dots', 12, .3, [.3, .4], .5, [110, 30, 65])] } },
  { name: 'print-flowers-stripes', interventions: { paperPrints: [print('flowers', 12, -.3, [.3, .1], .4, [235, 210, 190]), print('stripes', 7, .2, [.2, .2], .25, [30, 60, 100])] } }
];
const IMAGE_FILES = ['photo.jpg', 'crop.png', 'photo-paper-a.png', 'photo-overlap-valid.png', 'crop-paper-a.png', 'crop-overlap-valid.png'];
const TARGET_FILES = IMAGE_FILES.slice(2);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const sourceFiles = ['scripts/inverse/datasets/synthetic-intervention-probe.mjs', 'scripts/inverse/datasets/synthetic-photo.mjs', 'scripts/inverse/datasets/synthetic-print.mjs', 'scripts/inverse/datasets/synthetic-geometry.mjs', 'scripts/inverse/export-renderer.mjs', 'static/inverse/core/graph.js', 'static/inverse/core/bezier.js', 'package-lock.json'];

async function checkedAsset(dataset, asset) {
  const full = path.resolve(dataset, asset.path);
  if (!full.startsWith(dataset + path.sep)) throw new Error('Source asset leaves dataset directory.');
  const bytes = await fs.readFile(full);
  assert.equal(sha256(bytes), asset.sha256, `Source checksum: ${asset.path}`);
  return bytes;
}
function checkGraph(graph, cuts, design) {
  assert.equal(geometryHash(cuts), design.geometrySha256, 'Source geometry identity');
  const loaded = loadSolutionJSON(cuts);
  assert.equal(graph.phase, cuts.phase); assert.equal(graph.width, cuts.square_width_mm);
  assert.deepEqual(graph.nodes, loaded.graph.points); assert.deepEqual(graph.paths, loaded.paths);
  assert.equal(graph.edges.length, loaded.graph.edges.length);
  for (const [i, edge] of graph.edges.entries()) {
    const expected = loaded.graph.edges[i];
    assert.equal(edge.id, i); assert.equal(edge.from, expected.u); assert.equal(edge.to, expected.v);
    assert.equal(edge.visible, expected.visible); assert.deepEqual(edge.cubic, expected.curve.p);
  }
  assert.equal(graph.paperAMaskValue, 1); assert.equal(graph.coveragePngPaperA, 'white (255)');
  assert.equal(design.validation.passed, true); assert.equal(design.validation.geometry.passed, true); assert.equal(design.validation.paper.status, 'pass');
}

function assertControlledVariant(result, baseline, variant) {
  const exactCrop = variant.name === 'exact-crop';
  for (const key of ['actualQuad', 'canonicalToPhoto', 'nodesPhoto', ...(exactCrop ? [] : ['proposedCropQuad', 'canonicalToCrop', 'nodesCrop'])]) assert.deepEqual(result.labels[key], baseline.labels[key], `${variant.name}: ${key}`);
  for (const key of exactCrop ? TARGET_FILES.slice(0, 2) : TARGET_FILES) assert.deepEqual(result.files[key], baseline.files[key], `${variant.name}: ${key}`);
  const changed = new Set(Object.keys(variant.interventions || {}).map(key => key === 'lowResolutionScale' ? 'lowResolution' : key));
  for (const key of Object.keys(baseline.labels.perturbations)) if (!changed.has(key)) assert.deepEqual(result.labels.perturbations[key], baseline.labels.perturbations[key], `${variant.name}: nonintervened ${key}`);
  if (variant.interventions) {
    assert.deepEqual(result.labels.baselinePerturbations, baseline.labels.perturbations);
    assert.deepEqual(result.labels.interventions.requested, variant.interventions);
  }
  if (exactCrop) {
    assert.deepEqual(result.files['photo.jpg'], baseline.files['photo.jpg'], 'Exact crop must preserve photograph');
    assert.deepEqual(result.labels.proposedCropQuad, result.labels.actualQuad);
    for (const p of SQUARE) {
      const actual = project(result.labels.canonicalToCrop, p);
      p.forEach((value, i) => assert.ok(Math.abs(actual[i] - value * result.labels.resolution / 100) < 1e-7, 'Exact crop coordinate'));
    }
  }
  return { cameraAndPhotoNodesUnchanged: true, cropAndCropNodesUnchanged: !exactCrop, unchangedTargetPNGs: exactCrop ? TARGET_FILES.slice(0, 2) : TARGET_FILES, nonintervenedParametersUnchanged: true, ...(exactCrop ? { originalPhotoUnchanged: true, physicalCropVerified: true } : {}) };
}

export async function replayInterventions({ dataset = 'tmp/heart-training-synthetic/batch-v1', selection = 'tmp/heart-learning/localization-corners-v1/worst-distinct-designs.json', output, profile = 'standard' }) {
  if (!['standard', 'glare', 'background', 'scene', 'scene-training', 'printed'].includes(profile)) throw new Error('Unknown intervention profile. Use standard, glare, background, scene, scene-training or printed.');
  const variants = { standard: PROBE_VARIANTS, glare: GLARE_VARIANTS, background: BACKGROUND_VARIANTS, scene: SCENE_VARIANTS, 'scene-training': SCENE_TRAINING_VARIANTS, printed: PRINT_VARIANTS }[profile];
  if (!output) throw new Error('Provide a fresh --output directory.');
  const started = performance.now(), sourceDataset = path.resolve(dataset), sourceSelection = path.resolve(selection), out = path.resolve(output);
  const sourceBytes = await fs.readFile(path.join(sourceDataset, 'manifest.json')), original = JSON.parse(sourceBytes);
  const selectionBytes = await fs.readFile(sourceSelection), selected = JSON.parse(selectionBytes);
  assert.equal(original.schema, 'woven-heart-synthetic-dataset-1'); assert.equal(original.status, 'complete');
  assert.equal(original.options.canonicalResolution, 512, 'This exact replay uses independently rendered 512-pixel canonical coverage.');
  assert.ok(Array.isArray(selected) && selected.length > 0 && selected.every(row => typeof row.id === 'string'), 'Selection must contain explicit view-id rows.');
  assert.equal(new Set(selected.map(row => row.id)).size, selected.length, 'Repeated selection id');
  const sourceViews = new Map(original.views.map(view => [view.id, view])), sourceDesigns = new Map(original.baseDesigns.map(design => [design.id, design]));
  for (const row of selected) {
    assert.ok(sourceViews.has(row.id), `Unknown selected view ${row.id}`);
    if (row.designId !== undefined) assert.equal(sourceViews.get(row.id).designId, row.designId);
  }
  await fs.mkdir(path.dirname(out), { recursive: true }); await fs.mkdir(out);
  const manifest = {
    schema: 'woven-heart-intervention-probe-1', status: 'generating', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceHashes: Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, sha256(await fs.readFile(path.join(root, file)))]))),
    sourceDataset, sourceManifestSha256: sha256(sourceBytes), sourceSelection, sourceSelectionSha256: sha256(selectionBytes),
    scope: 'Paired photographic diagnostic on explicitly selected existing views. Selection may depend on prior model errors; this is not a random evaluation sample or independent generalization benchmark. No fitting, model inference or model scoring.',
    profile, variants, canonicalResolution: 512,
    designs: [], rows: [], baselineIdentities: [],
    limitations: ['Reference graph/cuts are ground-truth labels; never pass them to a blind fitter as initialization.', 'Changing photo corruption can interact with downstream clipping/JPEG; nonintervened random draws and parameters remain fixed.', 'Exact-crop changes the crop-coordinate targets as well as the input crop; compare them in their own coordinate system.', 'Original admission records are checked; this replay does not repeat physical-paper audits.']
  };
  const save = () => fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await save(); const cache = new Map();
  const writeAsset = async (relative, bytes) => { await fs.mkdir(path.dirname(path.join(out, relative)), { recursive: true }); await fs.writeFile(path.join(out, relative), bytes); return { path: relative, sha256: sha256(bytes) }; };
  try {
    for (const chosen of selected) {
      const sourceView = sourceViews.get(chosen.id), design = sourceDesigns.get(sourceView.designId);
      if (!cache.has(design.id)) {
        const graphBytes = await checkedAsset(sourceDataset, design.assets['graph.json']), cutsBytes = await checkedAsset(sourceDataset, design.assets['cuts.json']);
        const graph = JSON.parse(graphBytes), cuts = JSON.parse(cutsBytes); checkGraph(graph, cuts, design);
        const rendered = await renderExportedWeave(cuts, 512);
        await checkedAsset(sourceDataset, design.assets['canonical.png']);
        assert.equal(sha256(rendered.png), design.assets['canonical.png'].sha256, `${design.id}: independently rendered canonical PNG identity`);
        const graphAsset = await writeAsset(path.join('designs', design.id, 'graph.json'), graphBytes);
        manifest.designs.push({ id: design.id, sourceId: design.sourceId, sourceSplit: design.split, geometrySha256: design.geometrySha256, assets: { 'graph.json': graphAsset }, sourceGraph: design.assets['graph.json'], sourceCuts: design.assets['cuts.json'], sourceCanonical: design.assets['canonical.png'], independentCanonicalIdentity: true, originalAdmissionPassed: true });
        cache.set(design.id, { graph, coverage: rendered.coverage, graphAsset });
      }
      const { graph, coverage, graphAsset } = cache.get(design.id), labels = JSON.parse(await checkedAsset(sourceDataset, sourceView.assets['labels.json']));
      assert.equal(labels.designId, design.id); assert.equal(labels.seed, sourceView.seed); assert.equal(labels.resolution, original.options.resolution);
      for (const name of IMAGE_FILES) await checkedAsset(sourceDataset, sourceView.assets[name]);
      const input = { coverage, canonicalResolution: 512, graph, seed: sourceView.seed, resolution: labels.resolution };
      const baseline = await syntheticPhoto(input);
      for (const name of IMAGE_FILES) assert.equal(sha256(baseline.files[name]), sourceView.assets[name].sha256, `${sourceView.id}: baseline ${name}`);
      const { designId: _designId, graphPath: _graphPath, ...sourceLabelFields } = labels;
      assert.deepEqual(baseline.labels, sourceLabelFields, `${sourceView.id}: baseline label fields`);
      manifest.baselineIdentities.push({ sourceViewId: sourceView.id, designId: design.id, seed: sourceView.seed, imageHashes: Object.fromEntries(IMAGE_FILES.map(name => [name, sourceView.assets[name].sha256])), allSixImageHashesMatch: true, commonLabelFieldsMatch: true, sourceLabelsSha256: sourceView.assets['labels.json'].sha256 });
      for (const variant of variants) {
        const result = variant.name === 'baseline' ? baseline : await syntheticPhoto({ ...input, interventions: variant.interventions });
        const invariants = assertControlledVariant(result, baseline, variant), id = `${sourceView.id}--${variant.name}`, folder = path.join('views', id), assets = {};
        for (const [name, bytes] of Object.entries(result.files)) assets[name] = await writeAsset(path.join(folder, name), bytes);
        const savedLabels = { ...result.labels, designId: design.id, sourceViewId: sourceView.id, variant: variant.name, graphPath: path.relative(folder, graphAsset.path) };
        assets['labels.json'] = await writeAsset(path.join(folder, 'labels.json'), JSON.stringify(savedLabels, null, 2) + '\n');
        manifest.rows.push({ id, sourceViewId: sourceView.id, designId: design.id, variant: variant.name, sourceSplit: sourceView.split, selectedAnalysisSplit: chosen.split ?? null, sourceLabelsSha256: sourceView.assets['labels.json'].sha256, assets, invariants });
      }
      await save(); process.stdout.write(`${manifest.baselineIdentities.length}/${selected.length}: ${sourceView.id}, ${variants.length} variants; baseline and invariants verified\n`);
    }
    manifest.status = 'complete'; manifest.summary = { selectedViews: selected.length, designs: manifest.designs.length, variantsPerView: variants.length, generatedRows: manifest.rows.length, matchedOriginalImageHashes: selected.length * IMAGE_FILES.length, seconds: (performance.now() - started) / 1000 };
    const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const displayed = profile.startsWith('scene') ? 'photo.jpg' : 'crop.png';
    const sections = selected.map(source => `<section><h2>${escape(source.id)}</h2><div class="row">${manifest.rows.filter(row => row.sourceViewId === source.id).map(row => `<figure><img src="${row.assets[displayed].path}" alt="${escape(row.variant)}"><figcaption>${escape(row.variant)}</figcaption></figure>`).join('')}</div></section>`);
    await fs.writeFile(path.join(out, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Controlled synthetic-photo interventions</title><style>body{font:15px system-ui;margin:24px;background:#eee;color:#222}.row{display:flex;gap:8px}figure{margin:0;flex:1;min-width:0}img{width:100%}section{padding:16px;background:white;margin:16px 0}</style><h1>Controlled synthetic-photo interventions</h1><p>Same selected geometry, camera and random draws. This is a diagnostic sample, with no model fitting or scoring.</p>${sections.join('')}</html>`);
    await save(); return manifest;
  } catch (error) { manifest.status = 'failed'; manifest.error = error.message; await save(); throw error; }
}

export async function verifyInterventionProbe(directory) {
  const base = path.resolve(directory), bytes = await fs.readFile(path.join(base, 'manifest.json')), manifest = JSON.parse(bytes);
  assert.equal(manifest.schema, 'woven-heart-intervention-probe-1'); assert.equal(manifest.status, 'complete');
  assert.equal(manifest.rows.length, manifest.summary.generatedRows);
  for (const row of manifest.rows) {
    for (const asset of Object.values(row.assets)) await checkedAsset(base, asset);
    const reference = manifest.baselineIdentities.find(item => item.sourceViewId === row.sourceViewId); assert.ok(reference);
    if (row.variant === 'baseline') for (const name of IMAGE_FILES) assert.equal(row.assets[name].sha256, reference.imageHashes[name]);
    for (const name of row.invariants.unchangedTargetPNGs) assert.equal(row.assets[name].sha256, reference.imageHashes[name]);
    if (row.variant === 'exact-crop') assert.equal(row.assets['photo.jpg'].sha256, reference.imageHashes['photo.jpg']);
  }
  for (const design of manifest.designs) for (const asset of Object.values(design.assets)) await checkedAsset(base, asset);
  return { passed: true, rows: manifest.rows.length, checkedAssets: manifest.rows.reduce((sum, row) => sum + Object.keys(row.assets).length, 0) + manifest.designs.length, manifestSha256: sha256(bytes), scope: 'All saved asset hashes and original baseline/target identities. Generation also asserted poses, scalar parameters and exact-crop transforms.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => { const at = arg.indexOf('='); if (!arg.startsWith('--') || at < 0) throw new Error('Use --option=value.'); return [arg.slice(2, at), arg.slice(at + 1)]; }));
  for (const key of Object.keys(args)) if (!['dataset', 'selection', 'output', 'verify', 'profile'].includes(key)) throw new Error(`Unknown argument ${key}.`);
  const result = args.verify ? await verifyInterventionProbe(args.verify) : (await replayInterventions(args)).summary;
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
