"""Replay saved lobe scores on all fixed development crops for fresh fitting.

No model inference, classifier refitting, crop search or photograph copies.
Probabilities use exactly the parent study's score-upsample-then-sigmoid order.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
import torch

from paper_exemplars import score_probability


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def checked(reference):
    raw = Path(reference['path']).read_bytes()
    if digest(raw) != reference['sha256']:
        raise ValueError('Pinned bytes changed: '+reference['path'])
    return raw


def write_json(path, data):
    raw = (json.dumps(data, indent=2)+'\n').encode()
    path.write_bytes(raw)
    return digest(raw)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    plan_raw = args.plan.read_bytes()
    plan = json.loads(plan_raw)
    if plan['schema'] != 'paper-exemplar-pipeline-plan-1' or args.output.exists():
        raise ValueError('Require a new declared pipeline input')
    if shutil.disk_usage('.').free < plan['resources']['minimumFreeGiB']*1024**3:
        raise ValueError('Insufficient disk')
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    parent = json.loads(checked(plan['parent']))
    colour = json.loads(checked(plan['colour']))
    crops = json.loads(checked(plan['crops']))
    assert all(r['status'] == 'complete' for r in [parent, colour, crops])
    selected = [r for r in parent['rows'] if r['cohort'] == 'development']
    assert [r['id'] for r in selected] == plan['expectedCases']
    methods = plan['methods']
    assert methods == ['production', 'rgb-only', 'neutral-deviation']
    args.output.mkdir(parents=True)
    (args.output/'crops').mkdir()
    manifest = {
        'schema': 'woven-heart-material-probe-1', 'status': 'complete',
        'methods': methods[1:], 'resolution': 320, 'rows': [],
        'plan': {'path': str(args.plan), 'sha256': digest(plan_raw)},
        'sourceHashes': {str(p): digest(p.read_bytes()) for p in [
            Path(__file__), Path(__file__).with_name('paper_exemplars.py')]},
        'scope': plan['scope'],
    }
    replay = {'status': 'complete', 'rows': [], 'scope': plan['scope']}
    for previous in selected:
        row = next(r for r in colour['rows'] if r['id'] == previous['id'])
        crop = next(r for r in crops['rows'] if r['id'] == previous['id'])
        assert crop['cropExact']
        assert crop['quad'] == previous['geometry']['fixedQuad']
        photo = previous['image']
        raw = Path(photo['photo']).read_bytes()
        assert digest(raw) == photo['photoSha256']
        with Image.open(photo['photo']) as image:
            width, height = image.size
            assert digest(image.convert('RGB').tobytes()) == photo['decodedRGBSha256']
        entry = {
            'id': row['id'], 'file': photo['photo'],
            'photoSha256': photo['photoSha256'],
            'decodedRGBSha256': photo['decodedRGBSha256'],
            'dimensions': [width, height], 'window': [0, 0, width, height],
            'assets': {},
        }
        if crop['quad'] is not None:
            assert row['status'] == 'complete'
            assert crop['maskExact']
            entry['expectedProductionMaskSha256'] = crop['maskSha256']
            checked(row['fields'])
            with np.load(row['fields']['path']) as scores:
                for method in methods[1:]:
                    probability = score_probability(scores[method])
                    assert probability.shape == (320, 320)
                    assert np.isfinite(probability).all()
                    assert ((probability >= 0) & (probability <= 1)).all()
                    data = probability.astype('<f4').tobytes()
                    field = args.output/(row['id']+'-'+method+'.f32')
                    field.write_bytes(data)
                    entry['assets'][method] = {'material': {
                        'path': field.name, 'sha256': digest(data)}}
            candidate = {
                'quad': crop['quad'], 'needsReview': True,
                'provenance': {
                    'method': 'replayed-current-automatic-crop',
                    'reference': plan['crops'], 'id': row['id'],
                    'selected': crop['selected'],
                },
            }
        else:
            assert row['status'] == previous['status'] == 'failed'
            candidate = None
            entry['unresolvedReason'] = row['reason']
        detection = {
            'status': crop['status'],
            'candidates': [candidate] if candidate else [],
            'scope': 'Only selected geometry is replayed; no new support evidence.',
        }
        filename = row['id']+'.json'
        sha = write_json(args.output/'crops'/filename, detection)
        for method in methods:
            replay['rows'].append({
                'id': row['id'], 'method': method,
                'sourceSha256': photo['photoSha256'],
                'cropSeconds': None, 'selectedCrop': candidate,
                'assets': {'detection.json': {'path': filename, 'sha256': sha}},
            })
        manifest['rows'].append(entry)
    assert sum(bool(r['assets']) for r in manifest['rows']) == plan['expectedCrops']
    replay['probeManifestSha256'] = write_json(args.output/'manifest.json', manifest)
    write_json(args.output/'crops'/'report.json', replay)
    size = sum(p.stat().st_size for p in args.output.rglob('*') if p.is_file())
    assert size <= plan['resources']['maximumInputMiB']*1024**2
    print(json.dumps({'photos': len(selected), 'crops': plan['expectedCrops'],
                      'methods': methods, 'bytes': size}))


if __name__ == '__main__':
    main()
