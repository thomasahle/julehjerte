"""Inputs and diagnostics for a grouped body/material learning pilot."""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion
import torch

from data import checked_asset, digest
from real_finetune import replay_corpus
from material_metrics import material_metrics


def conditional_material_labels(coverage_a, body):
    """Retain fractional material coverage; omit the uncertain outer two pixels.

    Full-photo synthetic coverage is zero in the background. Its resampling may
    mix background into paper at the silhouette; only an eroded known body gets
    material supervision. Body supervision itself remains unchanged.
    """
    body = np.asarray(body)
    coverage_a = np.asarray(coverage_a)
    if body.ndim != 2 or not np.isin(body, [0, 1]).all():
        raise ValueError('Require a binary full-photo body')
    if coverage_a.ndim != 2 or not np.isfinite(coverage_a).all() or ((coverage_a < 0) | (coverage_a > 1)).any():
        raise ValueError('Require finite A coverage in [0, 1]')
    height, width = body.shape
    image = Image.fromarray(coverage_a.astype(np.float32))
    fraction = np.asarray(image.resize((width, height), Image.Resampling.BILINEAR))
    safe = binary_erosion(body == 1, iterations=2)
    result = np.full(body.shape, 255, np.float32)
    result[safe] = 1-fraction[safe]
    return result


def material_replay(training, count):
    """Use only the already checked training replay and its undegraded labels."""
    items, replay = replay_corpus(training, count)
    sources, scenes = {}, {}
    for source in training['sources']:
        root = Path(source['dataset']); raw = (root/'manifest.json').read_bytes()
        if digest(raw) != source['parentManifestSha256']:
            raise ValueError('Synthetic material parent manifest changed')
        manifest = json.loads(raw)
        for row in manifest['views']:
            key = source['parentManifestSha256'][:12]+':'+row['id']
            if key in sources:
                raise ValueError('Duplicate synthetic material view')
            sources[key] = (root, row)
    for source in training['sceneVariantSources']:
        root = Path(source['directory']); raw = (root/'manifest.json').read_bytes()
        if digest(raw) != source['manifestSha256']:
            raise ValueError('Synthetic scene manifest changed')
        manifest = json.loads(raw)
        for row in manifest['rows']:
            key = source['parentManifestSha256'][:12]+':'+row['sourceViewId']+'--'+row['variant']
            if key in scenes:
                raise ValueError('Duplicate synthetic scene view')
            scenes[key] = (root, row)
    records = []
    for item in items:
        identity = item['id'].split('--', 1)[0]
        root, view = sources[identity]
        asset = view['assets']['photo-paper-a.png']
        original = checked_asset(root, asset)
        with Image.open(original) as image:
            if image.size != (item['labels']['resolution'],)*2:
                raise ValueError('Synthetic material camera dimensions changed')
            coverage = np.asarray(image.convert('L')).astype(np.float32)/255
        if '--' in item['id']:
            scene_root, scene = scenes[item['id']]
            scene_asset = scene['assets']['photo-paper-a.png']
            if checked_asset(scene_root, scene_asset).read_bytes() != original.read_bytes():
                raise ValueError('Scene augmentation changed selected-paper identities')
        body = item['target'].astype(np.uint8)
        item['body'] = body
        item['materials'] = conditional_material_labels(coverage, body)
        records.append({'id': item['id'], 'split': item['split'],
                        'sourceMaterialSha256': asset['sha256'],
                        'bodySha256': digest(body.tobytes()),
                        'materialSha256': digest(item['materials'].tobytes()),
                        'knownMaterialPixels': int((item['materials'] != 255).sum())})
    return items, {'foregroundReplay': replay, 'materialReplay': records,
                   'policy': 'Training-only replay; undegraded fractional coverage; outer two body pixels have unknown material. Scene identities match the original exactly.'}


def material_tensors(items, flips=(False, False)):
    if not items or len(flips) != 2 or any(type(v) not in [bool, np.bool_] for v in flips):
        raise ValueError('Require samples and two reflection decisions')
    rgb = torch.from_numpy(np.ascontiguousarray(np.stack([i['rgb'].transpose(2, 0, 1) for i in items]))).float()/255
    body = torch.from_numpy(np.stack([i['body'] for i in items]))
    materials = torch.from_numpy(np.stack([i['materials'] for i in items])).float()
    if rgb.shape[1] != 3 or body.shape != rgb[:, 0].shape or materials.shape != body.shape:
        raise ValueError('RGB and label dimensions disagree')
    for enabled, dimension in zip(flips, [-1, -2]):
        if enabled:
            rgb, body, materials = rgb.flip(dimension), body.flip(dimension), materials.flip(dimension)
    return rgb, body, materials


def evaluate_materials(probabilities, items):
    report = material_metrics(probabilities, items)
    for row, probability, item in zip(report['rows'], probabilities, items):
        known = item['materials'] != 255
        if not known.any():
            row['perMaterial'] = None
            continue
        target = item['materials'][known].astype(float)
        body, predicted = np.asarray(probability)[:, known] >= .5
        if row['materialPhaseExchanged']:
            predicted = ~predicted
        parts = {}
        for label, weight in [('A', 1-target), ('B', target)]:
            wrong = predicted if label == 'A' else ~predicted
            joint = np.where(body, wrong, 1.)
            mass = float(weight.sum())
            parts[label] = {'observedMass': mass,
                            'materialError': float((weight*wrong).sum()/mass) if mass else None,
                            'jointError': float((weight*joint).sum()/mass) if mass else None}
        row['perMaterial'] = parts
        row['balancedMaterialJointError'] = float(np.mean([p['jointError'] for p in parts.values() if p['jointError'] is not None]))
    values = [r['balancedMaterialJointError'] for r in report['rows'] if r.get('perMaterial')]
    report['macroMean']['balancedMaterialJointError'] = float(np.mean(values)) if values else None
    report['contributingInstances']['balancedMaterialJointError'] = len(values)
    return report
