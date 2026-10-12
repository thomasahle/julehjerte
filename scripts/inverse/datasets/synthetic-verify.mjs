/** Check downloaded/copied synthetic datasets without running a solver. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FAMILY_SPLITS, sha256 } from './synthetic-geometry.mjs';
import { SQUARE, project } from './synthetic-photo.mjs';

export async function verifySynthetic(directory) {
  const root = path.resolve(directory), manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 'woven-heart-synthetic-dataset-1' || manifest.status !== 'complete') throw new Error('Dataset is not a complete supported synthetic generation.');
  if (manifest.splitPolicy.existingGalleryIncluded || manifest.splitPolicy.existingPhotoQAIncluded || manifest.splitPolicy.existingHunodanQAIncluded || manifest.sourceProvenance.externalAssets.length) throw new Error('Unreviewed source or evaluation-set inclusion.');
  if (manifest.baseDesigns.length !== manifest.options.designs || manifest.views.length !== manifest.options.designs * manifest.options.views) throw new Error('Generation is missing requested designs or views.');
  const designs = new Map(), groups = new Map(); let assets = 0;
  const readAsset = async asset => {
    const full = path.resolve(root, asset.path);
    if (!full.startsWith(root + path.sep)) throw new Error('Asset escapes dataset directory.');
    const bytes = await fs.readFile(full);
    if (sha256(bytes) !== asset.sha256) throw new Error(`Asset checksum differs: ${asset.path}`);
    return bytes;
  };
  for (const design of manifest.baseDesigns) {
    if (designs.has(design.id)) throw new Error('Duplicate design id.');
    if (FAMILY_SPLITS[design.familyId] !== design.split || design.groupId !== design.familyId || groups.has(design.groupId) && groups.get(design.groupId) !== design.split) throw new Error('Motif family crosses dataset splits.');
    if (!design.validation.passed || !design.validation.geometry.passed || design.validation.paper?.status !== 'pass' || design.validation.rendererDisagreement > .005) throw new Error('An admitted design did not pass validation.');
    groups.set(design.groupId, design.split); designs.set(design.id, design);
    for (const asset of Object.values(design.assets)) { await readAsset(asset); assets++; }
    const graph = JSON.parse(await readAsset(design.assets['graph.json'])), cuts = JSON.parse(await readAsset(design.assets['cuts.json']));
    if (graph.phase !== cuts.phase || graph.paperAMaskValue !== 1 || graph.canonicalPngPaperA !== 'black' || graph.coveragePngPaperA !== 'white (255)') throw new Error('Graph phase or paper-color encoding differs from exported cuts.');
  }
  const seen = new Set();
  for (const view of manifest.views) {
    const design = designs.get(view.designId);
    if (!design || seen.has(view.id)) throw new Error('Missing design or duplicate view.');
    seen.add(view.id);
    for (const field of ['familyId', 'groupId', 'split', 'sourceId']) if (view[field] !== design[field]) throw new Error(`View ${field} does not match its base design.`);
    for (const asset of Object.values(view.assets)) { await readAsset(asset); assets++; }
    const labels = JSON.parse(await readAsset(view.assets['labels.json']));
    const graph = JSON.parse(await readAsset(design.assets['graph.json']));
    if (labels.designId !== design.id || labels.seed !== view.seed) throw new Error('View label provenance differs.');
    for (const key of ['canonicalToPhoto', 'canonicalToCrop']) if (labels[key]?.length !== 9 || !labels[key].every(Number.isFinite)) throw new Error('Invalid projective label transform.');
    const near = (a, b) => a.length === b.length && a.every((v, i) => Number.isFinite(v) && Number.isFinite(b[i]) && Math.abs(v - b[i]) < 1e-7);
    for (const [i, p] of SQUARE.entries()) if (!near(project(labels.canonicalToPhoto, p), labels.actualQuad[i])) throw new Error('Crop corner transform differs.');
    if (labels.nodesPhoto.length !== graph.nodes.length || labels.nodesCrop.length !== graph.nodes.length) throw new Error('Graph node label count differs.');
    for (const [i, p] of graph.nodes.entries()) if (!near(project(labels.canonicalToPhoto, p), labels.nodesPhoto[i]) || !near(project(labels.canonicalToCrop, p), labels.nodesCrop[i])) throw new Error('Projected graph node differs.');
  }
  if (manifest.summary.baseDesigns !== designs.size || manifest.summary.photographicViews !== seen.size) throw new Error('Summary counts differ from dataset.');
  return { passed: true, designs: designs.size, views: seen.size, familyGroups: groups.size, checkedAssets: assets, manifestSha256: sha256(await fs.readFile(path.join(root, 'manifest.json'))), scope: 'Asset integrity, recorded admission checks, family isolation and projective label consistency; does not rerun physical or image simulation.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/inverse/datasets/synthetic-verify.mjs DATASET_DIRECTORY');
  process.stdout.write(JSON.stringify(await verifySynthetic(process.argv[2]), null, 2) + '\n');
}
