/** Add full-photo paper labels to a verified synthetic batch without changing
 * its photographs, geometry, old labels or recipe-level evaluation splits.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from './synthetic-geometry.mjs';
import { verifySynthetic } from './synthetic-verify.mjs';
import { photoForeground, foregroundPNG, verifyForegroundPNG } from './foreground-labels.mjs';

async function sourceDataset(directory) {
  const audit = await verifySynthetic(directory);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json')));
  return { audit, manifest };
}

function assetPath(root, asset) {
  if (typeof asset?.path !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error('Invalid foreground asset reference.');
  const full = path.resolve(root, asset.path);
  if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error('Foreground asset escapes its dataset.');
  return full;
}

export async function generateForegroundDataset({ dataset, output }) {
  if (!dataset || !output) throw new Error('Provide a synthetic dataset and a new output directory.');
  const { audit, manifest } = await sourceDataset(dataset);
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await fs.mkdir(output); // Refuse to replace an existing batch or partial run.
  const result = {
    schema: 'woven-heart-foreground-dataset-1', status: 'running',
    parentManifestSha256: audit.manifestSha256, parentSchema: manifest.schema,
    sourceHashes: Object.fromEntries(await Promise.all(['foreground-dataset.mjs', 'foreground-labels.mjs', 'synthetic-photo.mjs'].map(async file => [file, sha256(await fs.readFile(new URL(file, import.meta.url)))]))),
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    splitPolicy: manifest.splitPolicy,
    supervision: {
      foreground: '255 = either paper including both lobes; 0 = background. Opaque binary PNG at photograph pixel centres before optical/image degradation.',
      observedPhoto: 'Use the parent photo.jpg unchanged. Shadows, background texture, blur, glare and JPEG artifacts are observations, not foreground labels.',
      limitations: 'Only the parent planar semicircular-lobe simulator is represented. No real-photo correctness or trained-model improvement is implied.'
    },
    views: []
  };
  const save = () => fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(result, null, 2) + '\n');
  await save();
  for (const view of manifest.views) {
    if (!/^[a-zA-Z0-9_-]+$/.test(view.id)) throw new Error('Unsafe synthetic view identifier.');
    const labels = JSON.parse(await fs.readFile(assetPath(dataset, view.assets['labels.json'])));
    const mask = photoForeground(labels), png = foregroundPNG(mask, labels.resolution), relative = `${view.id}.png`;
    await fs.writeFile(path.join(output, relative), png);
    result.views.push({
      id: view.id, designId: view.designId, familyId: view.familyId, groupId: view.groupId, split: view.split, sourceId: view.sourceId,
      photo: view.assets['photo.jpg'], labels: view.assets['labels.json'],
      foreground: { path: relative, sha256: sha256(png) },
      resolution: labels.resolution, foregroundPixels: mask.reduce((sum, v) => sum + v, 0)
    });
  }
  result.status = 'complete'; await save();
  return verifyForegroundDataset({ dataset, output });
}

export async function verifyForegroundDataset({ dataset, output }) {
  const { audit, manifest: parent } = await sourceDataset(dataset), bytes = await fs.readFile(path.join(output, 'manifest.json'));
  const manifest = JSON.parse(bytes);
  if (manifest.schema !== 'woven-heart-foreground-dataset-1' || manifest.status !== 'complete' || manifest.parentSchema !== parent.schema || manifest.parentManifestSha256 !== audit.manifestSha256) throw new Error('Foreground labels do not belong to this complete parent dataset.');
  if (JSON.stringify(manifest.splitPolicy) !== JSON.stringify(parent.splitPolicy)) throw new Error('Foreground labels changed the parent split policy.');
  if (!Array.isArray(manifest.views) || manifest.views.length !== parent.views.length) throw new Error('Foreground labels omit parent photographs.');
  const parents = new Map(parent.views.map(v => [v.id, v])), seen = new Set();
  for (const view of manifest.views) {
    const source = parents.get(view.id);
    if (!source || seen.has(view.id)) throw new Error('Unknown or duplicate foreground view.');
    seen.add(view.id);
    for (const key of ['designId', 'familyId', 'groupId', 'split', 'sourceId']) if (view[key] !== source[key]) throw new Error('Foreground view changed parent identity or split.');
    for (const [key, name] of [['photo', 'photo.jpg'], ['labels', 'labels.json']]) if (JSON.stringify(view[key]) !== JSON.stringify(source.assets[name])) throw new Error('Foreground view changed source assets.');
    const labels = JSON.parse(await fs.readFile(assetPath(dataset, source.assets['labels.json'])));
    const png = await fs.readFile(assetPath(output, view.foreground));
    if (sha256(png) !== view.foreground.sha256) throw new Error('Foreground checksum differs.');
    const checked = await verifyForegroundPNG(png, labels);
    if (view.resolution !== labels.resolution || view.foregroundPixels !== checked.foregroundPixels) throw new Error('Foreground dimensions or area metadata differs.');
  }
  return { passed: true, views: seen.size, parentManifestSha256: audit.manifestSha256, manifestSha256: sha256(bytes), parentAssetsChecked: audit.checkedAssets, scope: 'Parent integrity, inherited identity/splits and every foreground pixel against saved camera geometry; not real-photo validation.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
  if (!args.dataset || !args.output || Object.keys(args).some(k => !['dataset', 'output', 'verify'].includes(k)) || args.verify !== undefined && args.verify !== 'true') throw new Error('Use --dataset=directory --output=new-directory [--verify=true].');
  const run = args.verify ? verifyForegroundDataset : generateForegroundDataset;
  console.log(JSON.stringify(await run(args), null, 2));
}
