"""Diagnostic foreground bounds from reviewed body labels, never model scores."""
import argparse
import json
from pathlib import Path

import numpy as np

from data import digest
from real_foreground import ROOT, load_real_labels
from real_annotations import read_source


def foreground_bound(target, weight, transform, source_size, include_unknown):
    """Keep known pixels fixed; bracket uncertainty only inside the photograph."""
    target, weight = np.asarray(target), np.asarray(weight)
    n = transform['resolution']
    if target.shape != (n, n) or weight.shape != target.shape or not np.isin(target, [0, 1]).all() or not np.isin(weight, [0, 1]).all() or type(include_unknown) is not bool:
        raise ValueError('Require binary reviewed labels/weights and a Boolean uncertainty choice')
    yy, xx = np.mgrid[:n, :n]
    scale = transform['scale']; ox, oy = transform['offset']
    x, y = (xx+.5-ox)/scale, (yy+.5-oy)/scale
    observed = (x >= 0) & (x < source_size[0]) & (y >= 0) & (y < source_size[1])
    return (((target.astype(bool) & (weight == 1)) | ((weight == 0) & include_unknown)) & observed).astype('<f4')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--labels', type=Path, required=True)
    parser.add_argument('--annotations', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, default=ROOT/'docs/inverse/datasets/real-manifest.json')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    items, audit = load_real_labels(args.labels, manifest=args.manifest, annotations=args.annotations, purpose='diagnostic')
    labels = json.loads((args.labels/'manifest.json').read_text())
    label_rows = {row['id']: row for row in labels['instances']}
    sources = {row['id']: row for row in json.loads(args.manifest.read_text())['assets']}
    resolutions = {row['transform']['resolution'] for row in labels['instances']}
    if len(resolutions) != 1:
        raise ValueError('A probe requires one label resolution')
    n = resolutions.pop(); args.output.mkdir(parents=True, exist_ok=False)
    for include_unknown in [False, True]:
        name = 'include-unknown' if include_unknown else 'known-paper-only'
        folder = args.output/name; folder.mkdir()
        probe = {'schema': 'woven-heart-foreground-probe-1', 'status': 'writing', 'resolution': n,
                 'fieldOrigin': {'kind': 'reviewed-annotation-bound', 'includeUnknown': include_unknown,
                                 'diagnosticOnly': True, 'labelManifestSha256': audit['manifestSha256']},
                 'labelsAudit': audit, 'sourceHashes': {str(Path(__file__)): digest(Path(__file__).read_bytes())},
                 'scope': 'Annotation-assisted foreground diagnostic, not a learned result or exact physical outline. Known labels stay fixed; unknown pixels inside the photo are set to paper or background. Outside-photo padding is never paper. No overlap corners or ROI are supplied. All downstream image and template checks remain unchanged.', 'rows': []}
        for item in items:
            identity = item['id']; row = label_rows[identity]; source = sources[row['assetId']]
            photo = read_source(ROOT, source); file = folder/(identity+'.png'); photo.convert('RGB').save(file)
            transform = row['transform']; scale = transform['scale']; ox, oy = transform['offset']
            probability = foreground_bound(item['target'], item['weight'], transform, [source['width'], source['height']], include_unknown)
            raw = probability.tobytes(); filename = identity+'.f32'; (folder/filename).write_bytes(raw)
            probe['rows'].append({'id': identity, 'caseId': identity, 'group': 'real',
                                  'file': str(file.resolve()), 'photoSha256': digest(file.read_bytes()), 'originalPhotoSha256': source['sha256'],
                                  'dimensions': [source['width'], source['height']], 'window': [-ox/scale, -oy/scale, (n-ox)/scale, (n-oy)/scale],
                                  'roi': None, 'inferenceSeconds': None,
                                  'assets': {'probability.f32': {'path': filename, 'sha256': digest(raw)}}})
        probe['status'] = 'complete'; (folder/'manifest.json').write_text(json.dumps(probe, indent=2)+'\n')
        print(name, len(items), 'diagnostic fields', flush=True)


if __name__ == '__main__': main()
