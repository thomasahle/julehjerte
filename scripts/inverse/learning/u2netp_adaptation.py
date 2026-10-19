"""Whole-paper decoder adaptation; keep upstream inputs and encoder immutable."""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
import torch

from data import checked_asset, digest
from foreground import ForegroundCorpus, physical_foreground
from preserved_candidate import pinned, source_separation
from real_foreground import check_current_training_sources
from real_materials import checked_materials
from real_annotations import polygon_fields


def stretched_body_labels(row, resolution=320):
    """Rasterize original polygons in the publisher's anisotropic image frame.

    Uncertainty distances stay in source pixels, not stretched output pixels.
    Overlap corner annotations and material polygons never enter these targets.
    """
    if type(resolution) is not int or not 32 <= resolution <= 1024:
        raise ValueError('Invalid body-label resolution')
    width, height = row['sourceSize']
    yy, xx = np.mgrid[:resolution, :resolution]
    x, y = (xx+.5)*width/resolution, (yy+.5)*height/resolution
    foreground = np.zeros(x.shape, dtype=bool)
    unknown = np.zeros(x.shape, dtype=bool)
    band = row['boundaryUncertaintyPixels']**2
    for polygon in row['foregroundPolygons']:
        inside, distance = polygon_fields(polygon, x, y)
        foreground |= inside
        unknown |= distance <= band
    for polygon in row['unknownPolygons']:
        inside, distance = polygon_fields(polygon, x, y)
        unknown |= inside | (distance <= band)
    labels = foreground.astype(np.uint8)
    labels[unknown] = 255
    if not np.any(labels == 1) or not np.any(labels == 0):
        raise ValueError('Require known foreground and background')
    return labels


def freeze_encoder(model):
    model.eval()  # All BatchNorm running statistics remain frozen.
    encoders = {'stage'+str(i) for i in range(1, 7)}
    decoders = {'stage'+str(i)+'d' for i in range(1, 6)}
    heads = {'side'+str(i) for i in range(1, 7)} | {'outconv'}
    for name, parameter in model.named_parameters():
        root = name.split('.')[0]
        if root not in encoders | decoders | heads:
            raise ValueError('Unexpected upstream parameter: '+name)
        parameter.requires_grad_(root not in encoders)
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


def frozen_hash(model):
    values = dict(model.named_buffers())
    values.update({n: p for n, p in model.named_parameters() if not p.requires_grad})
    return digest(b''.join(n.encode()+v.detach().cpu().contiguous().numpy().tobytes()
                           for n, v in sorted(values.items())))


def fused_logits(model, inputs):
    # Capture the existing fused head before sigmoid; do not fork upstream forward.
    values = []
    hook = model.outconv.register_forward_hook(lambda _module, _inputs, output: values.append(output))
    try:
        model(inputs)
    finally:
        hook.remove()
    if len(values) != 1:
        raise ValueError('Expected one fused saliency head')
    return values[0]


def normalize_scores(probabilities):
    low = probabilities.amin((-2, -1), keepdim=True)
    span = probabilities.amax((-2, -1), keepdim=True)-low
    return torch.where(span > 0, (probabilities-low)/span.clamp_min(torch.finfo(probabilities.dtype).tiny), 0)


def input_tensor(file, expected_sha256, rescale, normalize):
    if digest(Path(file).read_bytes()) != expected_sha256:
        raise ValueError('Changed training photograph: '+str(file))
    with Image.open(file) as original:
        rgb = np.asarray(ImageOps.exif_transpose(original).convert('RGB'))
    sample = rescale({'image': rgb, 'label': np.zeros((*rgb.shape[:2], 1), np.uint8), 'imidx': np.array([0])})
    tensor = normalize(sample)['image'].float().contiguous()
    if not torch.isfinite(tensor).all():
        raise ValueError('Nonfinite upstream image input')
    return tensor, list(rgb.shape[1::-1]), digest(rgb.tobytes())


def real_training(plan, rescale, normalize):
    catalog = json.loads(pinned(plan['sourceManifest']).read_bytes())
    annotations = json.loads(pinned(plan['annotations']).read_bytes())
    evaluation = json.loads(pinned(plan['evaluation']).read_bytes())
    rows = list(checked_materials(catalog, annotations))
    bodies = [b for _, b, _ in rows]
    if [r['id'] for r in bodies] != plan['trainIds']:
        raise ValueError('Changed training identity/order')
    check_current_training_sources(bodies, plan['sourceManifest']['path'])
    separation = source_separation(bodies, evaluation['photos'], catalog)
    items = []
    for _, body, source in rows:
        tensor, size, decoded = input_tensor(source['localPath'], source['sha256'], rescale, normalize)
        if size != body['sourceSize']:
            raise ValueError('EXIF-oriented source differs from reviewed coordinates')
        labels = stretched_body_labels(body)
        items.append({'id': body['id'], 'input': tensor, 'labels': labels,
                      'evidence': {'photo': source['localPath'], 'photoSha256': source['sha256'],
                                   'decodedRGBSha256': decoded, 'labelsSha256': digest(labels.tobytes()),
                                   'splitGroupId': source['splitGroupId'], 'kind': 'reviewed-real-body'}})
    return items, separation


def synthetic_training(plan, rescale, normalize):
    parent = json.loads(pinned(plan['syntheticParent']).read_bytes())
    sources = parent['sources']
    corpus = ForegroundCorpus([s['dataset'] for s in sources], [s['foreground'] for s in sources], resolution=320)
    if corpus.sources != sources:
        raise ValueError('Synthetic parent data changed')
    first = {}
    for row in sorted(corpus.rows, key=lambda r: r['key']):
        if row['experimentalSplit'] == 'train':
            first.setdefault(row['geometrySha256'], row)
    candidates = [first[k] for k in sorted(first)]
    count = plan['protocol']['syntheticGeometries']
    if not 4 <= count <= len(candidates):
        raise ValueError('Invalid synthetic replay count')
    selected = [candidates[i] for i in np.linspace(0, len(candidates)-1, count, dtype=int)]
    scenes = {}
    for source in parent['sceneVariantSources']:
        folder = Path(source['directory'])
        scene = json.loads(pinned({'path': str(folder/'manifest.json'), 'sha256': source['manifestSha256']}).read_bytes())
        if scene['status'] != 'complete' or scene['profile'] != 'scene-training' or scene['sourceManifestSha256'] != source['parentManifestSha256']:
            raise ValueError('Changed synthetic scene source')
        scenes[source['parentManifestSha256']] = (folder, scene)
    items = []
    for index, row in enumerate(selected):
        original = corpus.load(row)  # Verifies physical labels and original assets.
        labels = original['target'].astype(np.uint8)
        tensor, _, decoded = input_tensor(original['photo'], original['photoSha256'], rescale, normalize)
        evidence = {'photo': original['photo'], 'photoSha256': original['photoSha256'],
                    'decodedRGBSha256': decoded, 'labelsSha256': digest(labels.tobytes()),
                    'geometrySha256': row['geometrySha256'], 'split': original['split'], 'kind': 'synthetic-original'}
        items.append({'id': original['id'], 'input': tensor, 'labels': labels, 'evidence': evidence})
        parent_hash = next(s['parentManifestSha256'] for s in sources if row['key'].startswith(s['parentManifestSha256'][:12]+':'))
        folder, scene = scenes[parent_hash]
        definitions = [v for v in scene['variants'] if v['name'] != 'baseline']
        definition = definitions[index % len(definitions)]
        matches = [r for r in scene['rows'] if r['sourceViewId'] == row['id'] and r['variant'] == definition['name']]
        if len(matches) != 1:
            raise ValueError('Missing or repeated scene counterpart')
        variant = matches[0]
        if variant['sourceSplit'] != 'train' or variant['sourceLabelsSha256'] != row['labels']['sha256'] or variant['designId'] != row['designId']:
            raise ValueError('Invalid scene role or provenance')
        scene_labels = json.loads(checked_asset(folder, variant['assets']['labels.json']).read_bytes())
        for field in ['canonicalToPhoto', 'actualQuad', 'resolution']:
            if scene_labels[field] != original['labels'][field]:
                raise ValueError('Scene changed selected body geometry')
        if not np.array_equal(physical_foreground(scene_labels, 320), labels):
            raise ValueError('Scene changed physical body')
        photo = checked_asset(folder, variant['assets']['photo.jpg'])
        tensor, _, decoded = input_tensor(photo, variant['assets']['photo.jpg']['sha256'], rescale, normalize)
        items.append({'id': original['id']+'--'+definition['name'], 'input': tensor, 'labels': labels,
                      'evidence': {**evidence, 'photo': str(photo), 'photoSha256': variant['assets']['photo.jpg']['sha256'],
                                   'decodedRGBSha256': decoded, 'kind': 'synthetic-scene'}})
    return items
