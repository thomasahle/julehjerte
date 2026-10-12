/** Usage: node scripts/inverse/datasets/synthetic-generate.mjs --designs=12 --views=3 --output=tmp/heart-training-synthetic/pilot */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { RECIPES, ALL_RECIPES, FAMILY_SPLITS, proceduralDesign, validateDesign, graphLabels, sha256 } from './synthetic-geometry.mjs';
import { syntheticPhoto } from './synthetic-photo.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const SOURCE_FILES = [
  'scripts/inverse/datasets/synthetic-generate.mjs', 'scripts/inverse/datasets/synthetic-geometry.mjs', 'scripts/inverse/datasets/synthetic-photo.mjs',
  'scripts/inverse/export-renderer.mjs', 'static/inverse/core/direct/curves.js', 'static/inverse/core/direct/curve-topology.js',
  'static/inverse/core/graph.js', 'static/inverse/core/bezier.js', 'static/inverse/core/validate.js', 'static/inverse/core/material.js',
  'static/inverse/core/geometry.js', 'static/inverse/core/settings.js', 'static/inverse/core/self-returns.js', 'package-lock.json'
];
export async function generateSynthetic({ output, designs = 12, views = 3, seed = 713051, resolution = 256, canonicalResolution = 512, recipes = RECIPES }) {
  if (!output || !Number.isInteger(designs) || designs < 4 || designs > 10000 || !Number.isInteger(views) || views < 1 || views > 1000 || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isInteger(resolution) || resolution < 64 || resolution > 1024 || !Number.isInteger(canonicalResolution) || canonicalResolution < resolution || canonicalResolution > 2048) throw new Error('Require output, 4–10000 designs, 1–1000 views, uint32 seed, resolution 64–1024 and canonical resolution at least image resolution (at most 2048).');
  if (!Array.isArray(recipes) || recipes.length === 0 || new Set(recipes).size !== recipes.length || recipes.some(recipe => !ALL_RECIPES.includes(recipe))) throw new Error(`Choose a nonempty unique recipe list from ${ALL_RECIPES.join(', ')}.`);
  const selectedRecipes = recipes.slice();
  const out = path.resolve(output);
  // An accidental rerun must not overwrite a previously inspected experiment.
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.mkdir(out);
  const sourceHashes = Object.fromEntries(await Promise.all(SOURCE_FILES.map(async file => [file, sha256(await fs.readFile(path.join(root, file)))])));
  const manifest = {
    schema: 'woven-heart-synthetic-dataset-1', status: 'generating', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceHashes,
    options: { designs, views, seed, resolution, canonicalResolution, recipes: selectedRecipes }, runtime: { node: process.version, platform: process.platform, arch: process.arch },
    splitPolicy: { unit: 'procedural-recipe holdout, not topology-disjoint evaluation', familySplits: FAMILY_SPLITS, topologyDisjoint: false, realMotifFamilyDisjointness: 'not established', existingGalleryIncluded: false, existingPhotoQAIncluded: false, existingHunodanQAIncluded: false, explanation: 'All transformations/count/style variants of the lattice family stay in train. Channel/frame recipe groups are held out, but simplified routing topologies can also occur in the training lattice recipes. Existing evaluation photographs and templates are not read.' },
    sourceProvenance: { sourceType: 'procedural', externalAssets: [], labelSource: 'Generated template pair, independently rendered and validated before image synthesis', physicalAssemblyTested: false },
    baseDesigns: [], views: [], rejected: [],
    limitations: ['Synthetic 2D images supplement real photographs; they do not establish real-world accuracy.', 'Procedural recipe groups are limited and share simplified routing topologies; this is not topology-disjoint evaluation. View count is not motif/topology diversity.', 'Graph labels are valid witnesses, not unique ground truth; unlisted connections must not automatically become negative examples.', 'Geometry and nominal paper-core checks are numerical and do not certify physical assembly.', 'Independent renderer comparison is raster evidence, not a proof of exact equality.']
  };
  const save = () => fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await save();
  const geometries = new Set();
  try {
    for (let i = 0; i < designs; i++) {
      const recipe = selectedRecipes[i % selectedRecipes.length]; let design, validation;
      for (let attempt = 0; attempt < 40; attempt++) {
        const candidate = proceduralDesign((seed + i * 1009 + attempt * 1000003) >>> 0, recipe), result = await validateDesign(candidate, canonicalResolution);
        if (result.passed && !geometries.has(candidate.geometrySha256)) { design = candidate; validation = result; break; }
        manifest.rejected.push({ id: candidate.id, recipe, passedValidation: result.passed, duplicateGeometry: geometries.has(candidate.geometrySha256), geometry: result.geometry, paper: result.paper, rendererDisagreement: result.rendererDisagreement });
      }
      if (!design) throw new Error(`No valid unique ${recipe} design after 40 attempts; rejection details saved.`);
      geometries.add(design.geometrySha256);
      const folder = path.join('designs', design.id); await fs.mkdir(path.join(out, folder), { recursive: true });
      const graph = graphLabels(design), graphBytes = JSON.stringify(graph, null, 2) + '\n', cutsBytes = JSON.stringify(design.cuts, null, 2) + '\n';
      const files = { 'graph.json': graphBytes, 'cuts.json': cutsBytes, 'canonical.png': validation.rendered.png };
      const assets = {};
      for (const [name, bytes] of Object.entries(files)) { const relative = path.join(folder, name); await fs.writeFile(path.join(out, relative), bytes); assets[name] = { path: relative, sha256: sha256(bytes) }; }
      const { rendered, ...checks } = validation;
      const row = { id: design.id, sourceId: design.id, sourceType: 'procedural', familyId: design.familyId, groupId: design.groupId, split: design.split, recipe, seed: design.seed, parameters: design.parameters, geometrySha256: design.geometrySha256, serializedDesignSha256: design.serializedDesignSha256, topologySha256: design.topologySha256, graphEdges: graph.edges.length, sharedEdges: graph.edges.filter(e => e.shared).length, assets, validation: checks };
      manifest.baseDesigns.push(row); await save();
      for (let view = 0; view < views; view++) {
        const id = `${design.id}-v${view}`, viewSeed = (seed + i * 16777619 + view * 2654435761) >>> 0, viewFolder = path.join('views', id);
        const result = await syntheticPhoto({ coverage: rendered.coverage, canonicalResolution, graph, seed: viewSeed, resolution });
        await fs.mkdir(path.join(out, viewFolder), { recursive: true });
        const viewAssets = {};
        for (const [name, bytes] of Object.entries({ ...result.files, 'labels.json': JSON.stringify({ ...result.labels, designId: design.id, graphPath: path.relative(viewFolder, assets['graph.json'].path) }, null, 2) + '\n' })) {
          const relative = path.join(viewFolder, name); await fs.writeFile(path.join(out, relative), bytes); viewAssets[name] = { path: relative, sha256: sha256(bytes) };
        }
        manifest.views.push({ id, designId: design.id, sourceId: design.id, familyId: design.familyId, groupId: design.groupId, split: design.split, seed: viewSeed, imageSha256: viewAssets['photo.jpg'].sha256, assets: viewAssets });
      }
      await save();
      process.stdout.write(`${i + 1}/${designs} ${design.id}: ${design.parameters.counts.join('×')} slits, ${row.sharedEdges} shared edges, ${design.split}\n`);
    }
    manifest.summary = { baseDesigns: manifest.baseDesigns.length, distinctGeometry: geometries.size, distinctTopologies: new Set(manifest.baseDesigns.map(d => d.topologySha256)).size, broadFamilies: new Set(manifest.baseDesigns.map(d => d.familyId)).size, photographicViews: manifest.views.length, bySplit: Object.fromEntries(['train', 'validation', 'test'].map(split => [split, { designs: manifest.baseDesigns.filter(d => d.split === split).length, views: manifest.views.filter(d => d.split === split).length }])), rejectedCandidates: manifest.rejected.length, maximumRendererDisagreement: Math.max(...manifest.baseDesigns.map(d => d.validation.rendererDisagreement)) };
    manifest.status = 'complete';
    const figures = manifest.baseDesigns.map(d => { const v = manifest.views.find(v => v.designId === d.id); return `<section><h2>${d.id} · ${d.split}</h2><p>${d.parameters.counts.join(' × ')} slits · ${d.sharedEdges} shared edges · ${d.familyId}</p><img src="${d.assets['canonical.png'].path}" alt="Undegraded two-color design"><img src="${v.assets['photo.jpg'].path}" alt="Synthetic photo"><img src="${v.assets['crop.png'].path}" alt="Imperfect crop"><img src="${v.assets['crop-paper-a.png'].path}" alt="Undegraded material coverage in crop coordinates"></section>`; });
    await fs.writeFile(path.join(out, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic woven-heart pilot</title><style>body{font:16px system-ui;max-width:1200px;margin:30px auto;background:#eee;color:#222}img{width:23%;margin:1%}section{background:white;padding:16px;margin:16px 0}h1,h2,p{margin:10px}</style><h1>Synthetic woven-heart pilot</h1><p>Each row: validated canonical design, simulated photograph, imperfect crop, material coverage label. Photometric changes do not alter the exact cut graph. These are synthetic photographs; no real-world accuracy claim.</p>${figures.join('')}</html>`);
    await save(); return manifest;
  } catch (error) { manifest.status = 'failed'; manifest.error = error.message; await save(); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => { const at = arg.indexOf('='); if (!arg.startsWith('--') || at < 0) throw new Error('Use --option=value.'); return [arg.slice(2, at), arg.slice(at + 1)]; }));
  const known = new Set(['output', 'designs', 'views', 'seed', 'resolution', 'canonicalResolution', 'recipes']);
  for (const key of Object.keys(args)) if (!known.has(key)) throw new Error(`Unknown argument ${key}.`);
  const options = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, k === 'output' ? v : k === 'recipes' ? v.split(',') : Number(v)]));
  const result = await generateSynthetic(options); process.stdout.write(JSON.stringify(result.summary) + '\n');
}
