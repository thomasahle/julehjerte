"""Grouped, fixed-budget adaptation of the real annotation pilot.

This is an offline experiment, not a production model loader. Dataset allocation
and experiment folds are separate: the inspected pilot is not an unseen test.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
import torch

from data import checked_asset, digest
from foreground import ForegroundCorpus, physical_foreground, tensors
from real_foreground import masked_foreground_loss


def grouped_folds(items, audit, plan):
    if plan.get('schema') != 'woven-heart-real-pilot-folds-1' or plan['labelsManifestSha256'] != audit['manifestSha256'] or plan['annotationsSha256'] != audit['annotationsSha256']:
        raise ValueError('Fold plan does not belong to these reviewed labels')
    ids = [item['id'] for item in items]
    if len(set(ids)) != len(ids):
        raise ValueError('Duplicate pilot instance')
    proposed = [i for g in plan['groups'] for i in g['members']]
    if len(proposed) != len(set(proposed)) or set(proposed) != set(ids):
        raise ValueError('Every pilot instance needs exactly one declared motif group')
    group_names = [g['id'] for g in plan['groups']]
    if len(set(group_names)) != len(group_names) or any(not g.get('reason') or not g['members'] for g in plan['groups']):
        raise ValueError('Every distinct motif group needs members and a review reason')
    parent = dict(zip(ids, ids))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i

    def join(group):
        for i in group[1:]:
            parent[find(i)] = find(group[0])

    for group in plan['groups']:
        join(group['members'])
    for field in ['splitGroupId', 'nearDuplicateGroup']:
        by_group = {}
        for item in items:
            if not item.get(field):
                raise ValueError('Missing inherited source or duplicate group')
            by_group.setdefault(item[field], []).append(item['id'])
        for group in by_group.values():
            join(group)
    components = {}
    for i in ids:
        components.setdefault(find(i), []).append(i)
    if len(components) < 2:
        raise ValueError('Need at least two independent pilot groups')
    folds = []
    for members in sorted(map(sorted, components.values())):
        train = sorted(set(ids)-set(members))
        if len(train) < 2:
            raise ValueError('Too few training instances outside this whole group')
        folds.append({'id': 'fold-'+digest(json.dumps(members).encode())[:12], 'heldOut': members, 'train': train,
                      'groups': sorted(g['id'] for g in plan['groups'] if set(g['members']) & set(members))})
    return folds


def freeze_encoder(model):
    # requires_grad=False alone does not freeze BatchNorm running statistics.
    # eval() keeps those statistics fixed while autograd still trains the decoder.
    model.eval()
    for name, parameter in model.named_parameters():
        parameter.requires_grad_(not name.startswith('encoder.'))
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


def encoder_hash(model):
    return digest(b''.join(name.encode()+value.detach().cpu().contiguous().numpy().tobytes()
                           for name, value in sorted(model.encoder.state_dict().items())))


def adaptation_loss(model, batch, flips=(False, False)):
    rgb, target = tensors(batch, 'cpu')
    weight = torch.from_numpy(np.stack([i.get('weight', np.ones_like(i['target']))[None] for i in batch]))
    for enabled, dimension in zip(flips, [-1, -2]):
        if enabled:
            rgb, target, weight = rgb.flip(dimension), target.flip(dimension), weight.flip(dimension)
    return masked_foreground_loss(model(rgb), target, weight)


def schedule(updates, seed, replay_size):
    if type(updates) is not int or updates < 1 or type(replay_size) is not int or replay_size < 4:
        raise ValueError('Require positive updates and at least four replay photographs')
    rng = np.random.default_rng(seed)
    return [{'synthetic': rng.integers(replay_size, size=4).tolist(), 'realQuantiles': rng.random(2).tolist(),
             'flips': (rng.random(2) < .5).tolist()} for _ in range(updates)]


def step_batch(draw, synthetic, real):
    if not real:
        return [synthetic[i] for i in draw['synthetic']]
    return [synthetic[i] for i in draw['synthetic'][:2]]+[
        real[min(len(real)-1, int(u*len(real)))] for u in draw['realQuantiles']]


def replay_corpus(training, count):
    """A fixed, identity-selected replay subset; never read held-out RGB/targets.

    Keep each selected original and one previously verified scene counterpart.
    Scene manifests are pinned by the original training report; selected inputs,
    labels, transforms and targets are checked again here.
    """
    sources = training['sources']
    corpus = ForegroundCorpus([s['dataset'] for s in sources], [s['foreground'] for s in sources])
    if corpus.sources != sources:
        raise ValueError('Synthetic parent data differs from the pretrained run')
    first = {}
    for row in sorted(corpus.rows, key=lambda r: r['key']):
        if row['experimentalSplit'] == 'train':
            first.setdefault(row['geometrySha256'], row)
    candidates = [first[g] for g in sorted(first)]
    if not 4 <= count <= len(candidates):
        raise ValueError('Insufficient training-only replay geometries')
    selected = [candidates[i] for i in np.linspace(0, len(candidates)-1, count, dtype=int)]
    scene_sources = {}
    for source in training['sceneVariantSources']:
        root = Path(source['directory']); raw = (root/'manifest.json').read_bytes()
        if digest(raw) != source['manifestSha256']:
            raise ValueError('Scene replay manifest changed since synthetic training')
        manifest = json.loads(raw)
        if manifest['status'] != 'complete' or manifest['profile'] != 'scene-training' or manifest['sourceManifestSha256'] != source['parentManifestSha256']:
            raise ValueError('Unrecognized replay scene corpus')
        scene_sources[source['parentManifestSha256']] = (root, manifest)
    items, records = [], []
    for index, row in enumerate(selected):
        original = corpus.load(row)
        original['weight'] = np.ones_like(original['target'])
        items.append(original)
        parent = next(s['parentManifestSha256'] for s in sources if row['key'].startswith(s['parentManifestSha256'][:12]+':'))
        root, scene = scene_sources[parent]
        definitions = [d for d in scene['variants'] if d['name'] != 'baseline']
        definition = definitions[index % len(definitions)]
        matches = [r for r in scene['rows'] if r['sourceViewId'] == row['id'] and r['variant'] == definition['name']]
        if len(matches) != 1:
            raise ValueError('Missing or repeated replay counterpart')
        variant = matches[0]
        if variant['sourceSplit'] != 'train' or variant['sourceLabelsSha256'] != row['labels']['sha256'] or variant['designId'] != row['designId']:
            raise ValueError('Replay imported evaluation data or changed source geometry')
        labels = json.loads(checked_asset(root, variant['assets']['labels.json']).read_text())
        for field in ['canonicalToPhoto', 'canonicalToCrop', 'actualQuad', 'nodesPhoto', 'seed', 'resolution']:
            if labels[field] != original['labels'][field]:
                raise ValueError('Replay scene changed camera or body geometry')
        if not np.array_equal(physical_foreground(labels, corpus.resolution), original['target'] > .5):
            raise ValueError('Replay changed the selected paper footprint')
        photo = checked_asset(root, variant['assets']['photo.jpg'])
        with Image.open(photo) as image:
            if image.size != (labels['resolution'], labels['resolution']):
                raise ValueError('Replay photograph dimensions disagree')
            rgb = np.asarray(image.convert('RGB').resize((corpus.resolution, corpus.resolution), Image.Resampling.BILINEAR)).copy()
        items.append({**original, 'id': original['id']+'--'+definition['name'], 'rgb': rgb,
                      'photoSha256': variant['assets']['photo.jpg']['sha256']})
        records.append({'originalId': original['id'], 'sceneId': items[-1]['id'], 'split': original['split'],
                        'geometrySha256': original['geometrySha256'], 'originalPhotoSha256': original['photoSha256'],
                        'scenePhotoSha256': items[-1]['photoSha256'], 'sourceLabelsSha256': row['labels']['sha256'],
                        'sceneLabelsSha256': variant['assets']['labels.json']['sha256'],
                        'targetSha256': digest(original['target'].tobytes())})
    return items, records
