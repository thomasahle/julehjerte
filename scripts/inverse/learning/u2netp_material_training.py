"""Source-checked material targets in the pretrained saliency input frame."""
import json
from pathlib import Path

import numpy as np
from PIL import Image

from u2netp_material import stretched_material_labels
from u2netp_adaptation import real_training, synthetic_training, input_tensor
from preserved_candidate import pinned
from real_materials import checked_materials
from material_pilot import conditional_material_labels
from data import checked_asset, digest


def material_training(plan, rescale, normalize):
    real, separation = real_training(plan, rescale, normalize)
    catalog = json.loads(pinned(plan['sourceManifest']).read_bytes())
    annotations = json.loads(pinned(plan['annotations']).read_bytes())
    labels = {body['id']: (item, body) for item, body, _ in checked_materials(catalog, annotations)}
    for row in real:
        body, materials = stretched_material_labels(*labels[row['id']])
        if not np.array_equal(body, row['labels']):
            raise ValueError('Material preparation changed the saliency body target')
        row.update(body=body, materials=materials.astype(np.float32))
        row['evidence']['materialLabelsSha256'] = digest(materials.tobytes())

    synthetic = synthetic_training(plan, rescale, normalize)
    parent = json.loads(pinned(plan['syntheticParent']).read_bytes())
    views, printed = {}, {}
    for source in parent['sources']:
        root = Path(source['dataset'])
        manifest = json.loads(pinned({'path': str(root/'manifest.json'), 'sha256': source['parentManifestSha256']}).read_bytes())
        for row in manifest['views']:
            views[source['parentManifestSha256'][:12]+':'+row['id']] = (root, row)
    for source in parent['sceneVariantSources']:
        root = Path(source['directory'])
        manifest = json.loads(pinned({'path': str(root/'manifest.json'), 'sha256': source['manifestSha256']}).read_bytes())
        for row in manifest['rows']:
            views[source['parentManifestSha256'][:12]+':'+row['sourceViewId']+'--'+row['variant']] = (root, row)
    for source in plan['printedReplay']:
        root = Path(source['directory'])
        manifest = json.loads(pinned({'path': str(root/'manifest.json'), 'sha256': source['manifestSha256']}).read_bytes())
        if manifest['status'] != 'complete' or manifest['profile'] != 'printed' or manifest['sourceManifestSha256'] != source['parentManifestSha256']:
            raise ValueError('Changed printed source')
        for row in manifest['rows']:
            key = source['parentManifestSha256'][:12]+':'+row['sourceViewId']
            if row['variant'] in ['print-flowers', 'print-stripes-dots', 'print-flowers-stripes']:
                printed.setdefault(key, {})[row['variant']] = (root, row)
    originals = []
    for item in synthetic:
        root, row = views[item['id']]
        asset = row['assets']['photo-paper-a.png']
        original_root, original = views[item['id'].split('--', 1)[0]]
        expected = original['assets']['photo-paper-a.png']['sha256']
        if asset['sha256'] != expected:
            raise ValueError('Scene changed material coverage')
        photo = checked_asset(root, row['assets']['photo.jpg'])
        if digest(photo.read_bytes()) != item['evidence']['photoSha256']:
            raise ValueError('Material labels belong to another input photograph')
        with Image.open(checked_asset(root, asset)) as image:
            coverage = np.asarray(image.convert('L'), dtype=np.float32)/255
        materials = conditional_material_labels(coverage, item['labels'])
        item.update(body=item['labels'], materials=materials)
        item['evidence'].update(materialCoverageSha256=expected, materialLabelsSha256=digest(materials.tobytes()))
        if '--' not in item['id']:
            originals.append(item)
    names = ['print-flowers', 'print-stripes-dots', 'print-flowers-stripes']
    for index, original in enumerate(originals):
        name = names[index % len(names)]
        root, row = printed[original['id']][name]
        if row['sourceSplit'] != 'train':
            raise ValueError('Printed evaluation example entered training')
        asset = row['assets']['photo-paper-a.png']; checked_asset(root, asset)
        if asset['sha256'] != original['evidence']['materialCoverageSha256']:
            raise ValueError('Printing changed material identity')
        # The saved intervention records must say that only paper ink changed.
        labels = json.loads(checked_asset(root, row['assets']['labels.json']).read_bytes())
        base_root, base_view = views[original['id']]
        base_labels = json.loads(checked_asset(base_root, base_view['assets']['labels.json']).read_bytes())
        for key in ['canonicalToPhoto', 'canonicalToCrop', 'actualQuad', 'nodesPhoto', 'seed', 'resolution']:
            if labels[key] != base_labels[key]:
                raise ValueError('Printing changed body geometry or camera')
        if set(labels['interventions']['requested']) != {'paperPrints'}:
            raise ValueError('Unrecognized printed intervention')
        photo = checked_asset(root, row['assets']['photo.jpg'])
        tensor, _, decoded = input_tensor(photo, row['assets']['photo.jpg']['sha256'], rescale, normalize)
        synthetic.append({**original, 'id': original['id']+'--'+name, 'input': tensor,
                          'evidence': {**original['evidence'], 'photo': str(photo),
                                       'photoSha256': row['assets']['photo.jpg']['sha256'],
                                       'decodedRGBSha256': decoded, 'kind': 'synthetic-printed'}})
    if len(synthetic) != plan['protocol']['syntheticGeometries']*3:
        raise ValueError('Require original, scene and printed views for every geometry')
    return real, synthetic, separation
