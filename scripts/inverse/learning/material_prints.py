"""Paired printed photographs for the existing synthetic material replay.

Only RGB changes. Preserve source identity, body and fractional sheet coverage;
never use a color classifier to relabel printed ink as a different material.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

from data import checked_asset, digest
from material_pilot import conditional_material_labels

VARIANTS = ('print-flowers', 'print-stripes-dots', 'print-flowers-stripes')


def load_printed_replay(items, sources):
    originals = {i['id']: i for i in items if '--' not in i['id']}
    if len(originals) * 2 != len(items) or any(i['split'] != 'train' for i in items):
        raise ValueError('Require paired training-only original/scene replay')
    variants, records = {}, []
    for source in sources:
        root = Path(source['directory']); raw = (root/'manifest.json').read_bytes()
        if digest(raw) != source['manifestSha256']:
            raise ValueError('Printed replay manifest changed')
        manifest = json.loads(raw)
        if manifest.get('schema') != 'woven-heart-intervention-probe-1' or manifest.get('status') != 'complete' or manifest.get('profile') != 'printed':
            raise ValueError('Require complete controlled printed-photo replay')
        parent_hash = manifest['sourceManifestSha256']
        if parent_hash != source['parentManifestSha256']:
            raise ValueError('Printed replay belongs to another source')
        identities = {r['sourceViewId']: r for r in manifest['baselineIdentities']}
        for row in manifest['rows']:
            identity = parent_hash[:12]+':'+row['sourceViewId']
            if identity not in originals or row['sourceSplit'] != 'train':
                raise ValueError('Printed view is outside the declared training replay')
            original = originals[identity]; reference = identities[row['sourceViewId']]
            if row['variant'] == 'baseline':
                if row['assets']['photo.jpg']['sha256'] != original['photoSha256']:
                    raise ValueError('Printed baseline differs from the original photo')
                continue
            if row['variant'] not in VARIANTS:
                raise ValueError('Unexpected printed variant')
            images = variants.setdefault(identity, {})
            if row['variant'] in images:
                raise ValueError('Duplicate printed variant')
            labels = json.loads(checked_asset(root, row['assets']['labels.json']).read_text())
            for field in ['canonicalToPhoto', 'canonicalToCrop', 'actualQuad', 'nodesPhoto', 'seed', 'resolution']:
                if labels[field] != original['labels'][field]:
                    raise ValueError('Printed replay changed geometry or camera')
            if set(labels['interventions']['requested']) != {'paperPrints'} or labels['baselinePerturbations'] != original['labels']['perturbations']:
                raise ValueError('Printed replay changed a non-print photographic parameter')
            for name in ['photo-paper-a.png', 'photo-overlap-valid.png', 'crop-paper-a.png', 'crop-overlap-valid.png']:
                asset = row['assets'][name]
                checked_asset(root, asset)
                if asset['sha256'] != reference['imageHashes'][name]:
                    raise ValueError('Printing changed a supervision map')
            with Image.open(checked_asset(root, row['assets']['photo-paper-a.png'])) as image:
                coverage = np.asarray(image.convert('L')).astype(np.float32)/255
            if not np.array_equal(conditional_material_labels(coverage, original['body']), original['materials']):
                raise ValueError('Printed paper identity differs from the training labels')
            file = checked_asset(root, row['assets']['photo.jpg'])
            with Image.open(file) as image:
                if image.size != (labels['resolution'],)*2:
                    raise ValueError('Printed image dimensions changed')
                rgb = np.asarray(image.convert('RGB').resize(original['rgb'].shape[1::-1], Image.Resampling.BILINEAR)).copy()
            images[row['variant']] = {**original, 'id': identity+'--'+row['variant'], 'rgb': rgb, 'photoSha256': row['assets']['photo.jpg']['sha256']}
            records.append({'originalId': identity, 'variant': row['variant'], 'photoSha256': row['assets']['photo.jpg']['sha256'],
                            'rgbSha256': digest(rgb.tobytes()), 'bodySha256': digest(original['body'].tobytes()),
                            'materialsSha256': digest(original['materials'].tobytes())})
    if set(variants) != set(originals) or any(set(v) != set(VARIANTS) for v in variants.values()):
        raise ValueError('Every replay original requires exactly the three declared print variants')
    return {key: [value[v] for v in VARIANTS] for key, value in variants.items()}, records


def print_schedule(updates, seed):
    if type(updates) is not int or updates < 1:
        raise ValueError('Require positive updates')
    # Separate RNG leaves the geometry/real-image/reflection schedule unchanged.
    choices = np.random.default_rng(seed ^ 0x510e527f).integers(6, size=(updates, 4))
    return np.where(choices < 3, choices, -1).tolist()


def printed_batch(items, choices, variants):
    if len(items) != 4 or len(choices) != 4 or any(type(i) is not int or i not in [-1, 0, 1, 2] for i in choices):
        raise ValueError('Require four valid print decisions')
    return [variants[item['id']][choice] if choice >= 0 and item['id'] in variants else item for item, choice in zip(items, choices)]
