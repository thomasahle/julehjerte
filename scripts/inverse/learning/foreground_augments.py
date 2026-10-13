"""Join controlled background variants to existing training-only geometry groups."""
import json
from pathlib import Path

import numpy as np
from PIL import Image

from data import checked_asset, digest


def training_variants(corpus, items, directories):
    sources = {s['parentManifestSha256']: s for s in corpus.sources}
    originals = {i['id']: i for i in items}
    groups, records, seen = {}, [], set()
    for directory in directories:
        root = Path(directory).resolve(); raw = (root/'manifest.json').read_bytes(); manifest = json.loads(raw)
        if manifest.get('schema') != 'woven-heart-intervention-probe-1' or manifest.get('status') != 'complete' or manifest.get('profile') != 'background':
            raise ValueError('Require completed controlled background variants')
        parent = manifest['sourceManifestSha256']
        if parent not in sources: raise ValueError('Augmentation has an unknown parent dataset')
        definitions = {v['name']: v.get('interventions', {}) for v in manifest['variants']}
        if len(definitions) != len(manifest['variants']) or definitions.get('baseline') != {}:
            raise ValueError('Missing or repeated baseline definition')
        for name, options in definitions.items():
            if name != 'baseline' and not options or any(k not in ['background', 'backgroundStyle'] for k in options):
                raise ValueError('Only explicit background changes are allowed')
            if 'background' in options and (not isinstance(options['background'], list) or len(options['background']) != 3 or not all(isinstance(v, (int, float)) and np.isfinite(v) and 0 <= v <= 255 for v in options['background'])):
                raise ValueError('Invalid background color')
            if 'backgroundStyle' in options and options['backgroundStyle'] not in ['wood-stripes', 'soft-cloth', 'plain']:
                raise ValueError('Invalid background texture')
        source_rows = {r['id']: r for r in corpus.rows if r['key'].startswith(parent[:12]+':')}
        imported, baselines, source_keys = 0, set(), set()
        for row in manifest['rows']:
            key = parent[:12]+':'+row['sourceViewId']; base = originals.get(key); source = source_rows.get(row['sourceViewId'])
            if base is None or source is None: raise ValueError('Unknown augmentation view')
            if base['split'] != 'train' or source['experimentalSplit'] != 'train' or row['sourceSplit'] != 'train':
                raise ValueError('Augmentation attempted to import development or held-out data')
            if row['designId'] != source['designId'] or row['sourceLabelsSha256'] != source['labels']['sha256']:
                raise ValueError('Changed source design or labels')
            variant = row['variant']; pair = (key, variant)
            if pair in seen: raise ValueError('Repeated source/variant pair')
            seen.add(pair); source_keys.add(key)
            if variant not in definitions: raise ValueError('Undeclared augmentation variant')
            labels = json.loads(checked_asset(root, row['assets']['labels.json']).read_text())
            for field in ['canonicalToPhoto', 'canonicalToCrop', 'actualQuad', 'proposedCropQuad', 'nodesPhoto', 'nodesCrop', 'seed', 'resolution']:
                if labels[field] != base['labels'][field]: raise ValueError('Augmentation changed camera or geometry')
            baseline = base['labels']['perturbations']; requested = definitions[variant]
            if set(labels['perturbations']) != set(baseline): raise ValueError('Photographic parameter set changed')
            for field, value in baseline.items():
                if labels['perturbations'][field] != requested.get(field, value): raise ValueError('Nonintervened photographic parameter changed')
            if variant != 'baseline' and (labels.get('baselinePerturbations') != baseline or labels.get('interventions', {}).get('requested') != requested):
                raise ValueError('Changed intervention provenance')
            file = checked_asset(root, row['assets']['photo.jpg'])
            if variant == 'baseline':
                if row['assets']['photo.jpg']['sha256'] != base['photoSha256']: raise ValueError('Baseline photograph changed')
                baselines.add(key); continue
            image = Image.open(file).convert('RGB'); n = labels['resolution']
            if image.size != (n, n): raise ValueError('Variant photograph dimensions disagree')
            groups.setdefault(key, []).append({**base, 'id': key+'--'+variant, 'variant': variant,
                                               'rgb': np.asarray(image.resize((corpus.resolution, corpus.resolution), Image.Resampling.BILINEAR)).copy(),
                                               'labels': labels, 'photo': str(file), 'photoSha256': row['assets']['photo.jpg']['sha256']})
            imported += 1
        if source_keys != baselines: raise ValueError('Every augmented source needs its original baseline')
        records.append({'directory': str(root), 'manifestSha256': digest(raw), 'parentManifestSha256': parent,
                        'augmentedSourceViews': len(source_keys), 'importedVariantViews': imported,
                        'policy': 'Training-only variants share the original source target and global geometry split; original baseline photographs verified byte-for-byte.'})
    return groups, records
