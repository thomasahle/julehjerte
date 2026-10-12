/** Correct the first pilot's metadata without altering or regenerating images.
 * Preserve its original manifest and generation-source hashes for an honest audit.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { geometryHash, sha256 } from './synthetic-geometry.mjs';

export async function correctSyntheticMetadata(directory) {
  const root = path.resolve(directory), file = path.join(root, 'manifest.json'), bytes = await fs.readFile(file), manifest = JSON.parse(bytes);
  if (manifest.schema !== 'woven-heart-synthetic-dataset-1' || manifest.status !== 'complete' || manifest.metadataCorrections?.length) throw new Error('Require an uncorrected complete first-generation synthetic dataset.');
  await fs.writeFile(path.join(root, 'manifest-before-recipe-clarification.json'), bytes, { flag: 'wx' });
  const groups = new Set();
  for (const design of manifest.baseDesigns) {
    const relative = path.resolve(root, design.assets['cuts.json'].path);
    if (!relative.startsWith(root + path.sep)) throw new Error('Template path escapes dataset.');
    const cutsBytes = await fs.readFile(relative);
    if (sha256(cutsBytes) !== design.assets['cuts.json'].sha256) throw new Error('Exported template checksum differs.');
    const cuts = JSON.parse(cutsBytes);
    design.serializedDesignSha256 = sha256(JSON.stringify(cuts));
    design.geometrySha256 = geometryHash(cuts); groups.add(design.geometrySha256);
  }
  manifest.summary.distinctGeometry = groups.size;
  Object.assign(manifest.splitPolicy, {
    unit: 'procedural-recipe holdout, not topology-disjoint evaluation', topologyDisjoint: false,
    realMotifFamilyDisjointness: 'not established',
    explanation: 'Lattice recipe variants stay in train and channel/frame recipe groups are held out. Simplified routing topologies and motifs can nevertheless cross these groups. Existing evaluation photographs/templates were not read.'
  });
  manifest.limitations = manifest.limitations.map(s => s.startsWith('Broad procedural families') ? 'Procedural recipe groups are limited and share simplified routing topologies; this is not topology-disjoint evaluation. View count is not motif/topology diversity.' : s);
  manifest.metadataCorrections = [{
    script: 'scripts/inverse/datasets/synthetic-correct-metadata.mjs', scriptSha256: sha256(await fs.readFile(new URL(import.meta.url))),
    originalManifest: 'manifest-before-recipe-clarification.json', originalManifestSha256: sha256(bytes),
    changes: ['Describe recipe holdout accurately; simplified routing topologies cross recipe groups.', 'Recompute geometry hashes/count excluding color phase and paper palette; retain original full-design identity separately.'],
    unchanged: 'All cut, graph, photo, crop, coverage, per-view label and validation assets; original generation source hashes.'
  }];
  await fs.writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
  return { designs: manifest.baseDesigns.length, distinctGeometry: groups.size, newManifestSha256: sha256(await fs.readFile(file)), correction: manifest.metadataCorrections[0] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/inverse/datasets/synthetic-correct-metadata.mjs DATASET_DIRECTORY');
  process.stdout.write(JSON.stringify(await correctSyntheticMetadata(process.argv[2]), null, 2) + '\n');
}
