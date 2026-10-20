"""Shared source-checked inputs and evaluation for exemplar projections."""
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image
import torch
from torch.nn import functional as F

from data import digest
from exemplar_projection import crop_context, sample_indices
from paper_exemplars import lobe_samples, overlap_region, quad_transform, score_exemplars
from preserved_candidate import pinned
from u2netp_adaptation import input_tensor
from u2netp_material_candidate import module


def reference(path):
    return {'path': str(path), 'sha256': digest(Path(path).read_bytes())}


geometry = module(Path(__file__).with_name('probe-paper-exemplars.py'), 'exemplar_geometry')
display = module(Path(__file__).with_name('probe-native-exemplars.py'), 'exemplar_gallery')
boundary = module(Path(__file__).with_name('probe-material-synthetic.py'), 'exemplar_boundary')


class FrozenFeatures:
    """Capture frozen decoder fields without retaining a feature bank."""
    def __init__(self, body, protocol):
        self.body, self.protocol, self.captured = body, protocol, {}
        if body.training or any(p.requires_grad for p in body.parameters()):
            raise ValueError('Require a frozen evaluation-mode backbone')
        self.handles = [
            getattr(body, name).register_forward_hook(self._capture(name))
            for name in protocol['layers']
        ]

    def _capture(self, name):
        return lambda _module, _input, value: self.captured.__setitem__(name, value.detach())

    def __call__(self, item):
        self.captured.clear()
        n = self.protocol['contextResolution']
        with torch.no_grad():
            self.body(item['input'][None])
            value = torch.cat([
                F.interpolate(self.captured[name], (n, n), mode='bilinear', align_corners=False)
                for name in self.protocol['layers']
            ], 1)[0]
        self.captured.clear()
        assert value.shape == (self.protocol['contextChannels'], n, n)
        return value

    def close(self):
        for handle in self.handles:
            handle.remove()
        self.handles.clear()
        self.captured.clear()


def prepare_case(case, protocol):
    rgb = geometry.source_rgb(case['item'])
    size = rgb.shape[1::-1]
    value = torch.from_numpy(rgb.copy().transpose(2, 0, 1)).float()/255
    n = protocol['resolution']
    value = F.interpolate(value[None], (n, n), mode='bilinear', align_corners=False)[0]
    support = lobe_samples(case['matrix'], protocol['contextResolution'], size)
    indices, count = sample_indices(support, protocol['minimumSamples'], protocol['maximumSamples'])
    region = overlap_region(case['matrix'], n, size)
    return rgb, value, indices, count, region


def measurement(item, field, region):
    prediction = np.stack([np.ones_like(field), field])
    metric = geometry.measure(item, prediction, region)
    target = {**item, 'materials': np.where(region, item['materials'], 255)}
    bounds = boundary.boundary_diagnostics(prediction[None], [target], {'rows': [metric]})['rows'][0]
    return {k: metric[k] for k in [
        'id', 'knownMaterialPixels', 'materialPhaseExchanged', 'materialPixelError',
    ]}, bounds


def development_evaluation(plan, output, models, features, rescale, normalize,
                           source_hashes, save, expected_masks=None, residual_methods=()):
    """Fixed production RGB/crops, all cases, and optional exact mask replay.

    Returns rows and artifact references. No labels from this development
    cohort enter fitting, normalization, training, or checkpoint selection.
    """
    p = plan['protocol']
    native = {r['id']: r for r in json.loads(pinned(plan['native']).read_bytes())['rows']}
    prior = {r['id']: r for r in json.loads(pinned(plan['exemplar']).read_bytes())['rows']}
    development = json.loads(pinned(plan['development']).read_bytes())
    inputs = json.loads(pinned(plan['previousInput']).read_bytes())
    pipeline = json.loads(pinned(plan['previousPipeline']).read_bytes())
    pipeline_root = Path(plan['previousPipeline']['path']).parent
    input_root = Path(plan['previousInput']['path']).parent
    crop_report = json.loads((input_root/'crops'/'report.json').read_bytes())
    assert digest((input_root/'crops'/'report.json').read_bytes()) == pipeline['cropReplay']['sha256']
    assert [r['id'] for r in development['rows']] == plan['expectedDevelopmentCases']
    methods = list(models)
    assert set(residual_methods) <= set(methods)
    manifest = {**inputs, 'methods': methods, 'rows': [], 'plan': plan['_reference'],
                'scope': plan['scope'], 'sourceHashes': source_hashes}
    crop_replay = {'status': 'complete', 'rows': [], 'scope': plan['scope']}
    (output/'crops').mkdir()
    rows, panels = [], []
    for entry in development['rows']:
        identity = entry['id']
        native_row = native[identity]
        old_input = next(r for r in inputs['rows'] if r['id'] == identity)
        old_crop = next(r for r in crop_report['rows'] if r['id'] == identity and r['method'] == 'production')
        for method in methods:
            crop_replay['rows'].append({**old_crop, 'method': method})
        detection = old_crop['assets']['detection.json']
        destination = output/'crops'/detection['path']
        destination.parent.mkdir(parents=True, exist_ok=True)
        os.link(display.read_asset(input_root/'crops', detection), destination)
        staged = {**old_input, 'assets': {}}
        manifest['rows'].append(staged)
        row = {'id': identity, 'cohort': 'development', 'status': 'crop-unresolved'}
        rows.append(row)
        tensor, _, decoded = input_tensor(entry['file'], entry['photoSha256'], rescale, normalize)
        assert decoded == entry['decodedRGBSha256']
        assert digest(tensor.numpy().tobytes()) == entry['inputSha256']
        item = {'id': identity, 'input': tensor, 'evidence': {
            'photo': entry['file'], 'photoSha256': entry['photoSha256'], 'decodedRGBSha256': decoded}}
        photo = geometry.source_rgb(item)
        if native_row['status'] == 'crop-unresolved':
            assert old_crop['selectedCrop'] is None
            panels.append({'id': identity, 'panels': [('Photo', Image.fromarray(photo))]+[
                ('No fixed crop', None)]*(2+len(methods))})
            continue
        matrix = quad_transform(prior[identity]['geometry']['fixedQuad'])
        assert prior[identity]['geometry']['fixedQuad'] == old_crop['selectedCrop']['quad']
        _, rgb, indices, count, _ = prepare_case({'item': item, 'matrix': matrix}, p)
        frozen = features(item)
        original = next(r for r in pipeline['rows'] if r['id'] == identity and r['method'] == 'production')
        crop = np.asarray(Image.open(display.read_asset(pipeline_root, original['assets']['crop.png'])).convert('RGB'))
        n = original['resolution']
        assert crop.shape == (n, n, 3)
        crop_rgb = torch.from_numpy(crop.copy().transpose(2, 0, 1)).float()/255
        valid = (np.frombuffer(display.read_asset(pipeline_root, original['assets']['observed.bin']).read_bytes(),
                              np.uint8).reshape(n, n) != 0
                 if 'observed.bin' in original['assets'] else np.ones((n, n), bool))
        raw = torch.from_numpy(score_exemplars(crop_rgb.numpy().transpose(1, 2, 0),
                                              native_row['model'])).sigmoid().numpy() >= .5
        raw[~valid] = False
        assert raw.tobytes() == pinned(native_row['nativeMask']).read_bytes()
        tiles = [('Photo', Image.fromarray(photo)), ('Fixed crop', Image.fromarray(crop)),
                 ('RGB only', display.colour_mask(raw, valid))]
        row.update(status='complete', rgbReferenceExact=True, masks={}, differences={}, exactReplays={})
        for method, model in models.items():
            with torch.no_grad():
                residual = method in residual_methods
                context = model.context(frozen)
                classifier = model.fit(rgb, context, indices, count, residual=residual)
                high = crop_context(context, matrix, photo.shape[1::-1], n)
                field = model.score(crop_rgb, high, classifier, residual=residual).sigmoid().numpy()
            mask = field >= .5
            mask[~valid] = False
            if method in (expected_masks or {}):
                assert mask.tobytes() == pinned(expected_masks[method][identity]).read_bytes()
                row['exactReplays'][method] = True
            file = output/(identity+'-'+method+'.mask')
            file.write_bytes(mask.astype(np.uint8).tobytes())
            row['masks'][method] = reference(file)
            staged['assets'][method] = {'mask': {'path': file.name, 'sha256': row['masks'][method]['sha256']}}
            difference = float((mask[valid] != raw[valid]).mean())
            flip = difference > .5
            row['differences'][method] = {
                'phaseInvariantDifferenceFromRgb': min(difference, 1-difference),
                'displayPhaseFlipped': flip, 'classFraction': float(mask[valid].mean())}
            tiles.append((method, display.colour_mask(mask ^ flip, valid)))
        panels.append({'id': identity, 'panels': tiles})
        save()
    assert len(manifest['rows']) == 32 and sum(bool(r['assets']) for r in manifest['rows']) == 26
    (output/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    crop_replay['probeManifestSha256'] = reference(output/'manifest.json')['sha256']
    (output/'crops'/'report.json').write_text(json.dumps(crop_replay, indent=2)+'\n')
    return {
        'rows': rows, 'gallery': display.gallery(panels, output, 'development', 256),
        'manifest': reference(output/'manifest.json'), 'cropReplay': reference(output/'crops'/'report.json'),
    }
