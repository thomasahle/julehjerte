"""Pair training-only scene changes with each existing background choice."""
import json
from pathlib import Path

import numpy as np
from PIL import Image

from data import checked_asset, digest
from foreground import physical_foreground


def training_scenes(corpus, items, backgrounds, directories):
    if not directories:
        return {}, []
    sources = {s['parentManifestSha256']: s for s in corpus.sources}
    originals = {i['id']: i for i in items}
    choices = {i['id']: i for base in items if base['split'] == 'train' for i in [base, *backgrounds.get(base['id'], [])]}
    paired, records, seen = {}, [], set()
    for directory in directories:
        root = Path(directory).resolve(); raw = (root/'manifest.json').read_bytes(); manifest = json.loads(raw)
        if manifest.get('schema') != 'woven-heart-intervention-probe-1' or manifest.get('status') != 'complete' or manifest.get('profile') != 'scene-training':
            raise ValueError('Require a completed paired scene-training probe')
        parent = manifest['sourceManifestSha256']
        if parent not in sources:
            raise ValueError('Unknown scene parent dataset')
        definitions = {v['name']: v for v in manifest['variants']}
        if len(definitions) != len(manifest['variants']) or definitions.get('baseline', {}).get('interventions', {}) != {}:
            raise ValueError('Repeated or changed scene baseline')
        source_rows = {r['id']: r for r in corpus.rows if r['key'].startswith(parent[:12]+':')}
        baselines, source_keys, count = set(), set(), 0
        for row in manifest['rows']:
            key = parent[:12]+':'+row['sourceViewId']; original = originals.get(key); source = source_rows.get(row['sourceViewId'])
            if original is None or source is None:
                raise ValueError('Unknown scene source view')
            if original['split'] != 'train' or source['experimentalSplit'] != 'train' or row['sourceSplit'] != 'train':
                raise ValueError('Scene augmentation cannot import development or held-out data')
            if row['designId'] != source['designId'] or row['sourceLabelsSha256'] != source['labels']['sha256']:
                raise ValueError('Scene source geometry identity changed')
            variant = row['variant']; pair = (key, variant)
            if pair in seen or variant not in definitions:
                raise ValueError('Repeated or undeclared scene variant')
            seen.add(pair); source_keys.add(key)
            labels = json.loads(checked_asset(root, row['assets']['labels.json']).read_text())
            for field in ['canonicalToPhoto', 'canonicalToCrop', 'actualQuad', 'proposedCropQuad', 'nodesPhoto', 'nodesCrop', 'seed', 'resolution']:
                if labels[field] != original['labels'][field]:
                    raise ValueError('Scene changed selected-body geometry or camera')
            file = checked_asset(root, row['assets']['photo.jpg'])
            if variant == 'baseline':
                if row['assets']['photo.jpg']['sha256'] != original['photoSha256'] or labels['perturbations'] != original['labels']['perturbations']:
                    raise ValueError('Scene baseline changed')
                baselines.add(key); continue
            definition = definitions[variant]; background = definition.get('pairedBackgroundVariant')
            base = choices.get(key if background == 'baseline' else key+'--'+str(background))
            if base is None or base['id'] in paired:
                raise ValueError('Missing or repeated paired background choice')
            requested = {**base['labels'].get('interventions', {}).get('requested', {}), 'scene': 'neighbors-handle'}
            if definition.get('interventions') != requested or labels.get('interventions', {}).get('requested') != requested:
                raise ValueError('Scene does not match its paired background intervention')
            if labels['perturbations'] != {**base['labels']['perturbations'], 'scene': 'neighbors-handle'} or labels.get('baselinePerturbations') != original['labels']['perturbations']:
                raise ValueError('Scene changed nonintervened photographic parameters')
            scene = labels.get('scene', {}); n = labels['resolution']
            counts = scene.get('visibleDistractorPixels', {})
            if set(counts) != {'neighbor', 'handle'} or any(not isinstance(v, int) or v < 0 for v in counts.values()):
                raise ValueError('Invalid distractor counts')
            mask = np.asarray(Image.open(checked_asset(root, row['assets']['photo-distractors.png'])).convert('RGBA'))
            if mask.shape != (n, n, 4) or not np.all(mask[..., 3] == 255) or not np.all(mask[..., :3] == mask[..., :1]) or not np.isin(mask[..., 0], [0, 255]).all():
                raise ValueError('Invalid visible distractor labels')
            occupied = mask[..., 0] > 0
            if (occupied & physical_foreground(original['labels'])).any():
                raise ValueError('Distractors occlude the selected body')
            if scene.get('kind') != 'neighbors-handle' or int(occupied.sum()) != sum(counts.values()):
                raise ValueError('Distractor identity or counts disagree')
            image = Image.open(file).convert('RGB')
            if image.size != (n, n):
                raise ValueError('Scene photograph dimensions disagree')
            paired[base['id']] = {**base, 'id': key+'--'+variant, 'sceneVariant': variant, 'pairedBaseId': base['id'],
                                  'rgb': np.asarray(image.resize((corpus.resolution, corpus.resolution), Image.Resampling.BILINEAR)).copy(),
                                  'labels': labels, 'photo': str(file), 'photoSha256': row['assets']['photo.jpg']['sha256']}
            count += 1
        if source_keys != baselines:
            raise ValueError('Every scene source requires an unchanged baseline')
        records.append({'directory': str(root), 'manifestSha256': digest(raw), 'parentManifestSha256': parent,
                        'sourceViews': len(source_keys), 'pairedVariants': count, 'policy': 'Only selected-body training groups; each original/background image has one optional scene counterpart with the same target.'})
    if set(paired) != set(choices):
        raise ValueError('Every training background choice requires a scene counterpart')
    return paired, records
