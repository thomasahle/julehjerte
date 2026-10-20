"""Train a small context projection through per-photo lobe ridge fitting."""
import argparse
import copy
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import numpy as np
from PIL import Image
import torch
from torch.nn import functional as F

from data import digest
from exemplar_projection import ExemplarProjection, crop_context, overlap_loss, sample_indices, score_ridge
from paper_exemplars import lobe_samples, overlap_region, quad_transform, score_exemplars
from preserved_candidate import pinned
from u2netp_adaptation import frozen_hash, input_tensor
from u2netp_material_candidate import load_material_candidate, module
from u2netp_material_training import material_training


def reference(path):
    path = Path(path)
    return {'path': str(path), 'sha256': digest(path.read_bytes())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_bytes())
    p = plan['protocol']
    assert plan['schema'] == 'exemplar-projection-plan-1' and not args.output.exists()
    assert p['resolution'] == 320 and p['contextResolution'] == 160
    assert p['ridgeRegularization'] == .1
    assert shutil.disk_usage('.').free >= plan['resources']['minimumFreeGiB']*1024**3
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    torch.manual_seed(p['seed'])
    wrapper, training_plan, training, parent_reference = load_material_candidate(
        pinned(plan['trainingParent']).parent)
    assert parent_reference == plan['trainingParent']
    body = wrapper.body.eval()
    for parameter in body.parameters():
        parameter.requires_grad_(False)
    initial_body = frozen_hash(body)
    loader = module(Path(training_plan['source']['path']).parent/'data_loader.py', 'projection_loader')
    rescale, normalize = loader.RescaleT(320), loader.ToTensorLab(flag=0)
    real, synthetic, separation = material_training(training_plan, rescale, normalize)
    evidence = [{'id': item['id'], **item['evidence'],
                 'inputTensorSha256': digest(item['input'].numpy().tobytes())}
                for item in real+synthetic]
    assert evidence == training['trainingInputs'] and len(synthetic) == 96
    del real
    old = json.loads(pinned(plan['exemplar']).read_bytes())
    native = json.loads(pinned(plan['native']).read_bytes())
    prior = {row['id']: row for row in old['rows']}
    native_by_id = {row['id']: row for row in native['rows']}
    helper = module(Path(__file__).with_name('probe-paper-exemplars.py'), 'projection_geometry')
    display = module(Path(__file__).with_name('probe-native-exemplars.py'), 'projection_gallery')
    boundary = module(Path(__file__).with_name('probe-material-synthetic.py'), 'projection_boundary').boundary_diagnostics
    cases = []
    for item in synthetic:
        labels = json.loads(pinned(prior[item['id']]['geometry']).read_bytes())
        matrix = np.asarray(labels['canonicalToPhoto']).reshape(3, 3)@np.diag([100, 100, 1])
        cases.append({'item': item, 'matrix': matrix})
    chosen = {identity for page in old['gallery']['synthetic'] for identity in page['ids']}
    model = ExemplarProjection(p['contextChannels'], p['projectionChannels'])
    assert sum(v.numel() for v in model.parameters()) == p['parameters']
    initial = copy.deepcopy(model).eval()
    for parameter in initial.parameters():
        parameter.requires_grad_(False)
    captured = {}

    def capture(name):
        return lambda _module, _input, value: captured.__setitem__(name, value.detach())

    handles = [getattr(body, name).register_forward_hook(capture(name)) for name in p['layers']]

    def features(item):
        captured.clear()
        with torch.no_grad():
            body(item['input'][None])
            context = torch.cat([F.interpolate(captured[name], (160, 160), mode='bilinear',
                                                align_corners=False) for name in p['layers']], 1)[0]
        assert context.shape == (192, 160, 160)
        return context

    def prepare(case):
        rgb = helper.source_rgb(case['item'])
        size = rgb.shape[1::-1]
        rgb_tensor = torch.from_numpy(rgb.copy().transpose(2, 0, 1)).float()/255
        rgb_tensor = F.interpolate(rgb_tensor[None], (320, 320), mode='bilinear', align_corners=False)[0]
        support = lobe_samples(case['matrix'], 160, size)
        indices, count = sample_indices(support, p['minimumSamples'], p['maximumSamples'])
        region = overlap_region(case['matrix'], 320, size)
        return rgb, rgb_tensor, indices, count, region

    args.output.mkdir(parents=True)
    torch.save(initial.state_dict(), args.output/'initial.pt')
    rng = np.random.default_rng(p['seed'])
    draws = np.concatenate([rng.permutation(len(cases)) for _ in range(p['epochs'])]).tolist()
    assert len(draws) == p['updates']
    sources = [
        'train-exemplar-projection.py', 'exemplar_projection.py', 'paper_exemplars.py',
        'probe-paper-exemplars.py', 'probe-native-exemplars.py', 'material_boundary_loss.py',
        'u2netp_material_training.py', 'u2netp_material_candidate.py',
    ]
    report = {
        'schema': 'exemplar-projection-training-1', 'status': 'initial-evaluation',
        'plan': reference(args.plan), 'parent': parent_reference,
        'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
        'sourceHashes': {str(Path(__file__).with_name(n)): reference(Path(__file__).with_name(n))['sha256'] for n in sources},
        'sourceSeparation': separation, 'parentInputsVerified': evidence,
        'trainedIds': [c['item']['id'] for c in cases], 'draws': draws,
        'initialProjection': reference(args.output/'initial.pt'),
        'initialBodySha256': initial_body, 'history': [], 'rows': [],
        'runtime': {'torch': torch.__version__, 'device': 'cpu', 'threads': 1},
        'scope': plan['scope'], 'parameters': p['parameters'],
    }
    started = time.monotonic()

    def save():
        assert frozen_hash(body) == initial_body
        assert shutil.disk_usage('.').free >= plan['resources']['minimumFreeGiB']*1024**3
        assert time.monotonic()-started < plan['resources']['maximumWallSeconds'], 'Wall-clock resource cap'
        total = sum(f.stat().st_size for f in args.output.rglob('*') if f.is_file())
        assert total < plan['resources']['maximumArtifactMiB']*1024**2
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')

    def measurement(item, field, region):
        prediction = np.stack([np.ones_like(field), field])
        metric = helper.measure(item, prediction, region)
        target = {**item, 'materials': np.where(region, item['materials'], 255)}
        bounds = boundary(prediction[None], [target], {'rows': [metric]})['rows'][0]
        return {k: metric[k] for k in ['id', 'knownMaterialPixels', 'materialPhaseExchanged', 'materialPixelError']}, bounds

    save()
    synthetic_rows = {}
    for index, case in enumerate(cases):
        item = case['item']
        _, rgb, indices, count, region = prepare(case)
        with torch.no_grad():
            field = initial(rgb, features(item), indices, count).sigmoid().numpy()
        reference_row = native_by_id[item['id']]
        raw = torch.from_numpy(score_exemplars(rgb.numpy().transpose(1, 2, 0),
                                              reference_row['model'])).sigmoid().numpy()
        with np.load(pinned(reference_row['nativeMask'])) as saved:
            assert np.array_equal(raw >= .5, saved['mask']), item['id']+' native RGB replay'
        metrics, bounds = measurement(item, field, region)
        baseline_metrics, baseline_bounds = measurement(item, raw, region)
        assert baseline_metrics == reference_row['metrics']['direct-rgb']
        row = {'id': item['id'], 'cohort': 'synthetic', 'kind': item['evidence']['kind'],
               'metrics': {'rgb-only': baseline_metrics, 'initial': metrics},
               'boundaries': {'rgb-only': baseline_bounds, 'initial': bounds},
               'rgbReferenceExact': True}
        file = args.output/f'initial-{index:03}.npz'
        np.savez_compressed(file, mask=(field >= .5).astype(np.uint8))
        row['initialMask'] = reference(file)
        report['rows'].append(row)
        synthetic_rows[item['id']] = row
        if (index+1) % 16 == 0:
            save()
            print('Initial evaluation', index+1, '/ 96', flush=True)
    report['status'] = 'training'
    save()
    optimizer = torch.optim.AdamW(model.parameters(), lr=p['learningRate'], weight_decay=p['weightDecay'])
    for step, index in enumerate(draws):
        case = cases[index]
        _, rgb, indices, count, region = prepare(case)
        target = torch.from_numpy(np.where(region, case['item']['materials'], 255))
        optimizer.zero_grad(set_to_none=True)
        score = model(rgb, features(case['item']), indices, count)
        loss = overlap_loss(score, target, p['boundaryFactor'], p['boundaryRadius'], p['lossTemperature'])
        assert torch.isfinite(loss)
        loss.backward()
        norm = torch.nn.utils.clip_grad_norm_(model.parameters(), p['maximumGradientNorm'])
        assert torch.isfinite(norm)
        optimizer.step()
        report['history'].append({'step': step+1, 'id': case['item']['id'],
                                  'loss': float(loss.detach()), 'gradientNorm': float(norm)})
        if (step+1) % 16 == 0:
            save()
            print(json.dumps({'step': step+1, 'loss': float(loss.detach()),
                              'seconds': time.monotonic()-started}), flush=True)
    model.eval()
    torch.save(model.state_dict(), args.output/'projection.pt')
    report.update(status='final-evaluation', checkpoint=reference(args.output/'projection.pt'))
    save()
    synthetic_panels = []
    for index, case in enumerate(cases):
        item = case['item']
        rgb_array, rgb, indices, count, region = prepare(case)
        with torch.no_grad():
            field = model(rgb, features(item), indices, count).sigmoid().numpy()
        row = synthetic_rows[item['id']]
        row['metrics']['trained'], row['boundaries']['trained'] = measurement(item, field, region)
        file = args.output/f'trained-{index:03}.npz'
        np.savez_compressed(file, mask=(field >= .5).astype(np.uint8))
        row['trainedMask'] = reference(file)
        if item['id'] in chosen:
            valid = region & (item['materials'] != 255)
            panels = [('Photo', Image.fromarray(rgb_array)), ('Known labels', display.colour_mask(item['materials'] >= .5, valid))]
            for name, asset in [('rgb-only', native_by_id[item['id']]['nativeMask']),
                                ('initial', row['initialMask']), ('trained', row['trainedMask'])]:
                with np.load(pinned(asset)) as saved:
                    mask = saved['mask'].astype(bool)
                panels.append((name, display.colour_mask(mask ^ row['metrics'][name]['materialPhaseExchanged'], valid)))
            synthetic_panels.append({'id': item['id'], 'panels': panels})
        if (index+1) % 16 == 0:
            save()
            print('Final evaluation', index+1, '/ 96', flush=True)
    report['summary'] = {}
    for kind in sorted({r['kind'] for r in synthetic_rows.values()}):
        selected = [r for r in synthetic_rows.values() if r['kind'] == kind]
        report['summary'][kind] = {name: {
            'materialError': float(np.mean([r['metrics'][name]['materialPixelError'] for r in selected])),
            'boundaryError': float(np.mean([r['boundaries'][name]['boundaryError'] for r in selected])),
            'interiorError': float(np.mean([r['boundaries'][name]['interiorError'] for r in selected])),
        } for name in ['rgb-only', 'initial', 'trained']}
    report['gallery'] = {'synthetic': display.gallery(synthetic_panels, args.output, 'synthetic', 256)}
    report['status'] = 'development-evaluation'
    save()
    development = json.loads(pinned(plan['development']).read_bytes())
    inputs = json.loads(pinned(plan['previousInput']).read_bytes())
    pipeline = json.loads(pinned(plan['previousPipeline']).read_bytes())
    pipeline_root = Path(plan['previousPipeline']['path']).parent
    input_root = Path(plan['previousInput']['path']).parent
    crop_report = json.loads((input_root/'crops'/'report.json').read_bytes())
    assert digest((input_root/'crops'/'report.json').read_bytes()) == pipeline['cropReplay']['sha256']
    assert [r['id'] for r in development['rows']] == plan['expectedDevelopmentCases']
    methods = ['initial-projection', 'trained-projection']
    manifest = {**inputs, 'methods': methods, 'rows': [], 'plan': reference(args.plan), 'scope': plan['scope']}
    crop_replay = {'status': 'complete', 'rows': [], 'scope': plan['scope']}
    (args.output/'crops').mkdir()
    real_panels = []
    for entry in development['rows']:
        identity = entry['id']
        native_row = native_by_id[identity]
        old_input = next(r for r in inputs['rows'] if r['id'] == identity)
        old_crop = next(r for r in crop_report['rows'] if r['id'] == identity and r['method'] == 'production')
        for method in methods:
            crop_replay['rows'].append({**old_crop, 'method': method})
        detection = old_crop['assets']['detection.json']
        destination = args.output/'crops'/detection['path']
        destination.parent.mkdir(parents=True, exist_ok=True)
        os.link(display.read_asset(input_root/'crops', detection), destination)
        staged = {**old_input, 'assets': {}}
        manifest['rows'].append(staged)
        row = {'id': identity, 'cohort': 'development', 'status': 'crop-unresolved'}
        report['rows'].append(row)
        tensor, _, decoded = input_tensor(entry['file'], entry['photoSha256'], rescale, normalize)
        assert decoded == entry['decodedRGBSha256']
        assert digest(tensor.numpy().tobytes()) == entry['inputSha256']
        item = {'id': identity, 'input': tensor, 'evidence': {
            'photo': entry['file'], 'photoSha256': entry['photoSha256'], 'decodedRGBSha256': decoded}}
        photo = helper.source_rgb(item)
        if native_row['status'] == 'crop-unresolved':
            assert old_crop['selectedCrop'] is None
            real_panels.append({'id': identity, 'panels': [('Photo', Image.fromarray(photo))]+[('No fixed crop', None)]*4})
            continue
        matrix = quad_transform(prior[identity]['geometry']['fixedQuad'])
        assert prior[identity]['geometry']['fixedQuad'] == old_crop['selectedCrop']['quad']
        case = {'item': item, 'matrix': matrix}
        _, rgb, indices, count, _ = prepare(case)
        frozen = features(item)
        original = next(r for r in pipeline['rows'] if r['id'] == identity and r['method'] == 'production')
        crop = np.asarray(Image.open(display.read_asset(pipeline_root, original['assets']['crop.png'])).convert('RGB'))
        n = original['resolution']
        assert crop.shape == (n, n, 3)
        crop_rgb = torch.from_numpy(crop.copy().transpose(2, 0, 1)).float()/255
        valid = (np.frombuffer(display.read_asset(pipeline_root, original['assets']['observed.bin']).read_bytes(), np.uint8).reshape(n, n) != 0
                 if 'observed.bin' in original['assets'] else np.ones((n, n), bool))
        raw = torch.from_numpy(score_exemplars(crop_rgb.numpy().transpose(1, 2, 0), native_row['model'])).sigmoid().numpy() >= .5
        raw[~valid] = False
        assert raw.tobytes() == pinned(native_row['nativeMask']).read_bytes()
        panels = [('Photo', Image.fromarray(photo)), ('Fixed crop', Image.fromarray(crop)),
                  ('RGB only', display.colour_mask(raw, valid))]
        row.update(status='complete', rgbReferenceExact=True, masks={}, differences={})
        for method, candidate in zip(methods, [initial, model]):
            with torch.no_grad():
                context = candidate.context(frozen)
                classifier = candidate.fit(rgb, context, indices, count)
                high = crop_context(context, matrix, photo.shape[1::-1], n)
                field = score_ridge(torch.cat([crop_rgb, high]), classifier).sigmoid().numpy()
            mask = field >= .5
            mask[~valid] = False
            file = args.output/(identity+'-'+method+'.mask')
            file.write_bytes(mask.astype(np.uint8).tobytes())
            row['masks'][method] = reference(file)
            staged['assets'][method] = {'mask': {'path': file.name, 'sha256': row['masks'][method]['sha256']}}
            difference = float((mask[valid] != raw[valid]).mean())
            flip = difference > .5
            row['differences'][method] = {
                'phaseInvariantDifferenceFromRgb': min(difference, 1-difference),
                'displayPhaseFlipped': flip, 'classFraction': float(mask[valid].mean())}
            panels.append((method, display.colour_mask(mask ^ flip, valid)))
        real_panels.append({'id': identity, 'panels': panels})
        save()
    assert len(manifest['rows']) == 32 and sum(bool(r['assets']) for r in manifest['rows']) == 26
    manifest['sourceHashes'] = report['sourceHashes']
    for path, value in [(args.output/'manifest.json', manifest), (args.output/'crops'/'report.json', crop_replay)]:
        path.write_text(json.dumps(value, indent=2)+'\n')
    report['gallery']['development'] = display.gallery(real_panels, args.output, 'development', 256)
    for handle in handles:
        handle.remove()
    assert len(report['history']) == 192
    assert frozen_hash(body) == initial_body
    report.update(status='complete', frozenBodyExact=True, seconds=time.monotonic()-started,
                  manifest=reference(args.output/'manifest.json'), cropReplay=reference(args.output/'crops'/'report.json'))
    save()
    print(json.dumps({'status': 'complete', 'seconds': report['seconds'], 'summary': report['summary']}, indent=2), flush=True)


if __name__ == '__main__':
    main()
