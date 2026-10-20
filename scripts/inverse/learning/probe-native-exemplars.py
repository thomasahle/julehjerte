"""Isolate reduced-grid losses with unchanged per-photo paper classifiers."""
import argparse
import json
import os
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
import torch
from torch.nn import functional as F

from data import digest
from preserved_candidate import pinned
from u2netp_material_candidate import module
from u2netp_material_training import material_training
from paper_exemplars import (
    fit_exemplar_classifier, fit_exemplars, score_exemplars, score_probability,
    lobe_samples, overlap_region, quad_transform, rgb_texture_features,
)


def reference(path):
    return {'path': str(path), 'sha256': digest(Path(path).read_bytes())}


def read_asset(root, asset):
    path = root/asset['path']
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('Asset escapes source directory')
    pinned({'path': str(path), 'sha256': asset['sha256']})
    return path


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2)+'\n')
    return reference(path)


def rgb_features(rgb, size=None):
    value = torch.from_numpy(rgb.copy().transpose(2, 0, 1)).float()[None]/255
    if size is not None:
        value = F.interpolate(value, (size, size), mode='bilinear', align_corners=False)
    return value[0].numpy().transpose(1, 2, 0)


def probability(features, model):
    return torch.from_numpy(score_exemplars(features, model)).sigmoid().numpy()


def colour_mask(mask, valid=None):
    colours = np.array([[255, 255, 255], [185, 19, 19]], np.uint8)
    rgb = colours[mask.astype(int)]
    if valid is not None:
        rgb[~valid] = [150, 150, 150]
    return Image.fromarray(rgb)


def gallery(entries, directory, prefix, width):
    pages = []
    for start in range(0, len(entries), 3):
        batch = entries[start:start+3]
        columns = len(batch[0]['panels'])
        sheet = Image.new('RGB', (width*columns, (width+48)*len(batch)), '#eeeeee')
        draw = ImageDraw.Draw(sheet)
        for j, entry in enumerate(batch):
            y = j*(width+48)
            draw.text((3, y+2), entry['id'], fill='black')
            for k, (caption, panel) in enumerate(entry['panels']):
                if panel is not None:
                    panel = panel.copy()
                    panel.thumbnail((width-4, width-4))
                    sheet.paste(panel, (k*width+(width-panel.width)//2, y+20))
                draw.text((k*width+3, y+width+22), caption, fill='black')
        path = directory/f'{prefix}-{start//3+1:02}.jpg'
        sheet.save(path, quality=92)
        pages.append({**reference(path), 'ids': [entry['id'] for entry in batch]})
    return pages


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_bytes())
    if plan['schema'] != 'paper-exemplar-native-plan-1' or args.output.exists():
        raise ValueError('Require a new declared native-resolution diagnostic')
    if shutil.disk_usage('.').free < plan['resources']['minimumFreeGiB']*1024**3:
        raise ValueError('Insufficient free disk')
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    parent = json.loads(pinned(plan['parent']).read_bytes())
    colour = json.loads(pinned(plan['colour']).read_bytes())
    pipeline = json.loads(pinned(plan['previousPipeline']).read_bytes())
    inputs = json.loads(pinned(plan['previousInput']).read_bytes())
    pipeline_root = Path(plan['previousPipeline']['path']).parent
    input_root = Path(plan['previousInput']['path']).parent
    crop_bytes = (input_root/'crops'/'report.json').read_bytes()
    crops = json.loads(crop_bytes)
    assert digest(crop_bytes) == pipeline['cropReplay']['sha256']
    assert crops['probeManifestSha256'] == plan['previousInput']['sha256']
    assert pipeline['probeManifestSha256'] == plan['previousInput']['sha256']
    assert [r['id'] for r in inputs['rows']] == plan['expectedDevelopmentCases']
    assert all(record['status'] == 'complete' for record in [parent, colour, pipeline, inputs, crops])
    parent_plan = json.loads(pinned(parent['plan']).read_bytes())
    training = json.loads(pinned(parent_plan['training']).read_bytes())
    training_plan = json.loads(pinned(training['plan']).read_bytes())
    loader = module(Path(training_plan['source']['path']).parent/'data_loader.py', 'native_exemplar_data')
    real, synthetic, _ = material_training(training_plan, loader.RescaleT(320), loader.ToTensorLab(flag=0))
    assert len(synthetic) == plan['expectedSyntheticViews']
    assert len(real)+len(synthetic) == len(training['trainingInputs'])
    for item, expected in zip(real+synthetic, training['trainingInputs']):
        assert {'id': item['id'], **item['evidence'],
                'inputTensorSha256': digest(item['input'].numpy().tobytes())} == expected
    probe = module(Path(__file__).with_name('probe-paper-exemplars.py'), 'native_parent')
    boundary = module(Path(__file__).with_name('probe-material-synthetic.py'), 'native_boundary').boundary_diagnostics
    items = {r['id']: r for r in synthetic}
    chosen = {identity for page in parent['gallery']['synthetic'] for identity in page['ids']}
    classifier = parent_plan['classifier']
    args.output.mkdir(parents=True)
    (args.output/'crops').mkdir()
    rows, synthetic_review, real_review = [], [], []
    manifest = {**inputs, 'methods': ['native-rgb'], 'rows': [],
                'plan': reference(args.plan), 'scope': plan['scope']}
    replay = {'status': 'complete', 'rows': [], 'scope': plan['scope']}
    report = {
        'schema': 'paper-exemplar-native-results-1', 'status': 'running',
        'plan': reference(args.plan), 'rows': rows, 'scope': plan['scope'],
        'sourceHashes': {str(p): digest(p.read_bytes()) for p in [
            Path(__file__), Path(__file__).with_name('paper_exemplars.py'),
            Path(__file__).with_name('probe-paper-exemplars.py'),
            Path(__file__).with_name('probe-material-synthetic.py')]},
    }
    write_json(args.output/'report.json', report)
    for index, previous in enumerate(parent['rows']):
        old_colour = next(r for r in colour['rows'] if r['id'] == previous['id'])
        row = {'id': previous['id'], 'cohort': previous['cohort'], 'kind': previous['kind']}
        rows.append(row)
        item = items.get(row['id'], {'id': row['id'], 'evidence': previous['image']})
        rgb = probe.source_rgb(item)
        photo_panel = Image.fromarray(rgb)
        photo_panel.thumbnail((320, 320))
        if row['cohort'] == 'development':
            old_input = next(r for r in inputs['rows'] if r['id'] == row['id'])
            old_crop = next(r for r in crops['rows'] if r['id'] == row['id'] and r['method'] == 'production')
            detection = old_crop['assets']['detection.json']
            os.link(read_asset(input_root/'crops', detection), args.output/'crops'/detection['path'])
            replay['rows'].append({**old_crop, 'method': 'native-rgb'})
            staged = {**old_input, 'assets': {}}
            manifest['rows'].append(staged)
        if previous['status'] != 'complete':
            assert row['cohort'] == 'development' and old_colour['status'] == 'failed'
            assert old_crop['selectedCrop'] is None
            row.update(status='crop-unresolved', reason=previous['reason'])
            real_review.append({'id': row['id'], 'panels': [('Photo', photo_panel)]+[('No fixed crop', None)]*5})
            continue
        if row['cohort'] == 'synthetic':
            labels = json.loads(pinned(previous['geometry']).read_bytes())
            matrix = np.asarray(labels['canonicalToPhoto']).reshape(3, 3)@np.diag([100, 100, 1])
        else:
            assert previous['geometry']['fixedQuad'] == old_crop['selectedCrop']['quad']
            matrix = quad_transform(previous['geometry']['fixedQuad'])
        support = lobe_samples(matrix, 160, rgb.shape[1::-1])
        features = rgb_texture_features(rgb)
        texture, texture_fit = fit_exemplars(features, support, **classifier)
        with np.load(pinned(previous['fields'])) as saved:
            assert np.array_equal(texture, saved['rgb-texture']), row['id']+' texture replay'
        assert texture_fit == previous['fits']['rgb-texture']
        model, fit = fit_exemplar_classifier(features[..., :3], support, **classifier)
        low_score = score_exemplars(features[..., :3], model)
        with np.load(pinned(old_colour['fields'])) as saved:
            assert np.array_equal(low_score, saved['rgb-only']), row['id']+' RGB replay'
        assert fit == old_colour['rawFit']
        row.update(status='complete', textureReplayExact=True, rgbReplayExact=True, model=model, fit=fit)
        if row['cohort'] == 'synthetic':
            legacy = score_probability(low_score)
            direct = probability(rgb_features(rgb, 320), model)
            region = overlap_region(matrix, 320, rgb.shape[1::-1])
            target = {**item, 'materials': np.where(region, item['materials'], 255)}
            row['metrics'], row['boundaries'] = {}, {}
            for name, field in [('legacy-rgb', legacy), ('direct-rgb', direct)]:
                prediction = np.stack([np.ones_like(field), field])
                metric = probe.measure(item, prediction, region)
                row['metrics'][name] = {k: metric[k] for k in [
                    'id', 'knownMaterialPixels', 'materialPhaseExchanged', 'materialPixelError']}
                row['boundaries'][name] = boundary(prediction[None], [target], {'rows': [metric]})['rows'][0]
            assert row['metrics']['legacy-rgb'] == old_colour['metrics']['rgb-only']
            mask = (direct >= .5).astype(np.uint8)
            field_path = args.output/f'synthetic-{index:03}.npz'
            np.savez_compressed(field_path, mask=mask)
            row['nativeMask'] = reference(field_path)
            if row['id'] in chosen:
                valid = region & (item['materials'] != 255)
                synthetic_review.append({'id': row['id'], 'panels': [
                    ('Photo', photo_panel),
                    ('Known paper labels', colour_mask(item['materials'] >= .5, valid)),
                    ('Saved 160-grid classifier', colour_mask((legacy >= .5)^row['metrics']['legacy-rgb']['materialPhaseExchanged'], valid)),
                    ('Same classifier, direct RGB at 320', colour_mask((direct >= .5)^row['metrics']['direct-rgb']['materialPhaseExchanged'], valid)),
                ]})
        else:
            controls = {m: next(r for r in pipeline['rows'] if r['id'] == row['id'] and r['method'] == m)
                        for m in pipeline['methods']}
            original = controls['production']
            assert original['targetMaskSha256'] == old_input['expectedProductionMaskSha256']
            crop_path = read_asset(pipeline_root, original['assets']['crop.png'])
            crop_rgb = np.asarray(Image.open(crop_path).convert('RGB'))
            n = original['resolution']
            assert crop_rgb.shape == (n, n, 3)
            valid = (np.frombuffer(read_asset(pipeline_root, original['assets']['observed.bin']).read_bytes(),
                                   dtype=np.uint8).reshape(n, n) != 0
                     if 'observed.bin' in original['assets'] else np.ones((n, n), bool))
            direct = probability(rgb_features(crop_rgb), model)
            native = (direct >= .5).astype(np.uint8)
            native[~valid] = 0
            native_path = args.output/(row['id']+'.mask')
            native_path.write_bytes(native.tobytes())
            row['nativeMask'] = reference(native_path)
            row['resolution'] = n
            row['observedPixels'] = int(valid.sum())
            row['sourceCrop'] = reference(crop_path)
            staged['assets'] = {'native-rgb': {'mask': {
                'path': native_path.name, 'sha256': row['nativeMask']['sha256']}}}
            staged['classifier'] = {'model': model, 'fit': fit,
                                    'query': 'Unresized production crop RGB; no new per-query normalization'}
            masks = {}
            for name, control in controls.items():
                assert control['selectedCrop'] == original['selectedCrop']
                assert control['assets']['crop.png']['sha256'] == original['assets']['crop.png']['sha256']
                pixels = np.asarray(Image.open(read_asset(pipeline_root, control['assets']['mask.png'])).convert('RGB'))
                masks[name] = pixels[:, :, 1] < 128
                assert digest(masks[name].astype(np.uint8).tobytes()) == control['targetMaskSha256']
            panels = [('Photo', photo_panel), ('Fixed source crop', Image.fromarray(crop_rgb))]
            row['differences'] = {}
            for name, mask in [*masks.items(), ('native-rgb', native)]:
                difference = float((mask[valid] != masks['production'][valid]).mean())
                flipped = difference > .5
                row['differences'][name] = {
                    'phaseInvariantDifferenceFromProduction': min(difference, 1-difference),
                    'displayPhaseFlipped': flipped,
                }
                panels.append((name, colour_mask(mask.astype(bool)^flipped, valid)))
            real_review.append({'id': row['id'], 'panels': panels})
        write_json(args.output/'report.json', report)
        if (index+1) % 16 == 0:
            print('Classifiers replayed', index+1, 'of', len(parent['rows']), flush=True)
    assert len(manifest['rows']) == 32
    assert sum(bool(r['assets']) for r in manifest['rows']) == plan['expectedDevelopmentCrops']
    assert len([r for r in rows if r['cohort'] == 'synthetic']) == plan['expectedSyntheticViews']
    manifest['sourceHashes'] = report['sourceHashes']
    replay['probeManifestSha256'] = write_json(args.output/'manifest.json', manifest)['sha256']
    write_json(args.output/'crops'/'report.json', replay)
    report['summary'] = {}
    for kind in sorted({r['kind'] for r in rows if r['cohort'] == 'synthetic'}):
        selected = [r for r in rows if r['kind'] == kind]
        report['summary'][kind] = {name: {
            'materialError': float(np.mean([r['metrics'][name]['materialPixelError'] for r in selected])),
            'boundaryError': float(np.mean([r['boundaries'][name]['boundaryError'] for r in selected])),
            'interiorError': float(np.mean([r['boundaries'][name]['interiorError'] for r in selected])),
        } for name in ['legacy-rgb', 'direct-rgb']}
    report['gallery'] = {
        'synthetic': gallery(synthetic_review, args.output, 'synthetic', 320),
        'development': gallery(real_review, args.output, 'development', 256),
    }
    for file, sha in report['sourceHashes'].items():
        assert digest(Path(file).read_bytes()) == sha
    report['status'] = 'complete'
    write_json(args.output/'report.json', report)
    size = sum(p.stat().st_size for p in args.output.rglob('*') if p.is_file())
    assert size <= plan['resources']['maximumProbeMiB']*1024**2
    print(json.dumps({'summary': report['summary'], 'replayed': sum(r['status'] == 'complete' for r in rows),
                      'probeBytes': size}, indent=2))


if __name__ == '__main__':
    main()
