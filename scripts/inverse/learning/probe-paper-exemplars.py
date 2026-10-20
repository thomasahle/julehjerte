"""Test per-photo lobe exemplars with fixed RGB and frozen neural features."""
import argparse
import json
import shutil
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps
import torch
from torch.nn import functional as F

from data import checked_asset, digest
from preserved_candidate import pinned
from u2netp_adaptation import input_tensor, normalize_scores, frozen_hash
from u2netp_material_candidate import load_material_candidate, module
from u2netp_material_training import material_training
from material_pilot import evaluate_materials
from paper_exemplars import (
    fit_exemplars, lobe_samples, overlap_region, quad_transform,
    rgb_texture_features, score_probability,
)


def reference(path):
    return {'path': str(path), 'sha256': digest(Path(path).read_bytes())}


def source_rgb(item):
    evidence = item['evidence']
    path = pinned({'path': evidence['photo'], 'sha256': evidence['photoSha256']})
    with Image.open(path) as image:
        rgb = np.asarray(ImageOps.exif_transpose(image).convert('RGB'))
    if digest(rgb.tobytes()) != evidence['decodedRGBSha256']:
        raise ValueError('Decoded image differs')
    return rgb


def geometry_index(training_plan):
    parent = json.loads(pinned(training_plan['syntheticParent']).read_bytes())
    result = {}
    for source in parent['sources']:
        root = Path(source['dataset'])
        manifest = json.loads(pinned({'path': str(root/'manifest.json'),
                                     'sha256': source['parentManifestSha256']}).read_bytes())
        for row in manifest['views']:
            result[source['parentManifestSha256'][:12]+':'+row['id']] = (
                root, row['assets']['labels.json'])
    return result


def measure(item, predictions, region):
    labels = np.where(region, item['materials'], 255)
    target = {**item, 'materials': labels}
    if not (labels != 255).any():
        raise ValueError('No known target pixels inside overlap')
    return evaluate_materials(predictions[None], [target])['rows'][0]


def gallery(entries, output, prefix):
    result = []
    colours = np.array([[255, 130, 0], [0, 200, 255]], np.uint8)
    for start in range(0, len(entries), 4):
        rows = entries[start:start+4]
        sheet = Image.new('RGB', (1280, len(rows)*360), 'white')
        pen = ImageDraw.Draw(sheet)
        for j, entry in enumerate(rows):
            row, item = entry['record'], entry['item']
            photo = Image.fromarray(source_rgb(item)).resize((320, 320), Image.Resampling.BILINEAR)
            sheet.paste(photo, (0, j*360))
            if row['status'] == 'complete':
                display = entry['display']
                # All methods share one displayed physical region. For synthetic
                # diagnostics it is the true overlap; for real photos the fixed
                # proposal and existing body estimate can both be wrong.
                for k, method in enumerate(['baseline', 'rgb-texture', 'neural-texture'], 1):
                    probability = entry['probabilities'][method]
                    labels = probability >= .5
                    if row['cohort'] == 'synthetic':
                        labels ^= row['metrics'][method]['materialPhaseExchanged']
                    elif method == 'baseline' and display.any():
                        labels ^= np.mean(labels[display] !=
                                          (entry['probabilities']['rgb-texture'][display] >= .5)) > .5
                    image = np.full((320, 320, 3), 130, np.uint8)
                    image[display] = colours[labels[display].astype(int)]
                    sheet.paste(Image.fromarray(image), (320*k, j*360))
                caption = 'Photo / prior head / RGB texture exemplars / RGB + neural exemplars'
                if row['cohort'] == 'synthetic':
                    caption += ' | error: '+', '.join(
                        f"{row['metrics'][m]['materialPixelError']:.2%}"
                        for m in ['baseline', 'rgb-texture', 'neural-texture'])
            else:
                caption = 'Retained failure: '+row['reason']
            pen.text((3, j*360+323), row['id'], fill='black')
            pen.text((3, j*360+340), caption, fill='black')
        path = output/f'{prefix}-{start//4+1}.jpg'
        sheet.save(path, quality=90)
        result.append({**reference(path), 'ids': [r['record']['id'] for r in rows]})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_bytes())
    if plan['schema'] != 'paper-exemplar-plan-1' or args.output.exists():
        raise ValueError('Require a declared experiment and new output directory')
    if shutil.disk_usage('.').free < plan['resources']['minimumFreeGiB']*1024**3:
        raise ValueError('Insufficient disk space')
    torch.set_num_threads(1); torch.set_num_interop_threads(1)
    pinned(plan['training'])
    model, training_plan, training, training_reference = load_material_candidate(
        Path(plan['training']['path']).parent)
    if training_reference != plan['training']:
        raise ValueError('Changed checkpoint')
    before = frozen_hash(model)
    loader = module(Path(training_plan['source']['path']).parent/'data_loader.py', 'exemplar_input')
    rescale, normalize = loader.RescaleT(320), loader.ToTensorLab(flag=0)
    real_training, synthetic, separation = material_training(training_plan, rescale, normalize)
    if len(real_training)+len(synthetic) != len(training['trainingInputs']):
        raise ValueError('Changed diagnostic input count')
    for item, expected in zip(real_training+synthetic, training['trainingInputs']):
        if {'id': item['id'], **item['evidence'],
            'inputTensorSha256': digest(item['input'].numpy().tobytes())} != expected:
            raise ValueError('Changed training diagnostic input')
    native = json.loads(pinned(plan['development']).read_bytes())
    crops = json.loads(pinned(plan['crops']).read_bytes())
    quads = {row['id']: row['quad'] for row in crops['rows']}
    geometry = geometry_index(training_plan)
    cases = []
    for item in synthetic:
        root, asset = geometry[item['id'].split('--')[0]]
        path = checked_asset(root, asset)
        labels = json.loads(path.read_bytes())
        # Renderer coordinates use a 100-unit overlap; the classifier uses one.
        matrix = np.asarray(labels['canonicalToPhoto']).reshape(3, 3)@np.diag([100, 100, 1])
        cases.append((item, 'synthetic', matrix, reference(path), None))
    for row in native['rows']:
        tensor, size, decoded = input_tensor(row['file'], row['photoSha256'], rescale, normalize)
        if decoded != row['decodedRGBSha256'] or digest(tensor.numpy().tobytes()) != row['inputSha256']:
            raise ValueError('Development input differs')
        item = {'id': row['id'], 'input': tensor, 'evidence': {
            'photo': row['file'], 'photoSha256': row['photoSha256'], 'decodedRGBSha256': decoded,
            'kind': 'development'}}
        quad = quads[row['id']]
        cases.append((item, 'development', quad_transform(quad) if quad is not None else None,
                      {'fixedQuad': quad}, row))
    if len(synthetic) != 96 or len(native['rows']) != 32:
        raise ValueError('Changed fixed cohorts')
    args.output.mkdir(parents=True)
    entries = []
    boundary = module(Path(__file__).with_name('probe-material-synthetic.py'),
                      'exemplar_boundary_metrics').boundary_diagnostics
    for index, (item, cohort, matrix, geometry_ref, prior) in enumerate(cases):
        started = time.monotonic()
        row = {'id': item['id'], 'cohort': cohort, 'kind': item['evidence']['kind'],
               'image': item['evidence'], 'geometry': geometry_ref, 'status': 'failed'}
        entry = {'record': row, 'item': item}
        entries.append(entry)
        if matrix is None:
            row['reason'] = 'No fixed automatic crop; no lobe labels can be inferred.'
            continue
        rgb = source_rgb(item)
        size = rgb.shape[1::-1]
        support = lobe_samples(matrix, 160, size)
        region = overlap_region(matrix, 320, size)
        row['supportPixels'] = support.sum((1, 2)).tolist()
        if support.sum((1, 2)).min() < plan['classifier']['minimum']:
            row['reason'] = 'Too few visible samples in one or both lobes.'
            continue
        captured = {}
        def capture(name):
            return lambda _module, _input, output: captured.__setitem__(name, output)
        handles = [getattr(model.body, name).register_forward_hook(capture(name))
                   for name in plan['features']['layers']]
        try:
            with torch.no_grad():
                logits = model(item['input'][None])
        finally:
            for handle in handles:
                handle.remove()
        body = normalize_scores(logits[:, :1].sigmoid())[0, 0].numpy()
        baseline = logits[0, 1].sigmoid().numpy()
        if prior is not None:
            reference_dir = Path(plan['development']['path']).parent
            row['priorFieldParity'] = {}
            for name, field in [('body', body), ('material', baseline)]:
                asset = prior['assets'][name]
                previous = np.fromfile(pinned({'path': str(reference_dir/asset['path']),
                                              'sha256': asset['sha256']}), dtype='<f4').reshape(320, 320)
                row['priorFieldParity'][name] = {
                    'exact': bool(np.array_equal(field, previous)),
                    'maximumDifference': float(np.abs(field-previous).max()),
                    'changedThresholdPixels': int(((field >= .5) != (previous >= .5)).sum())}
        features = rgb_texture_features(rgb)
        neural = torch.cat([F.interpolate(captured[name], (160, 160), mode='bilinear',
                                          align_corners=False) for name in plan['features']['layers']], 1)
        neural = neural[0].numpy().transpose(1, 2, 0)
        scores, fits = {}, {}
        scores['rgb-texture'], fits['rgb-texture'] = fit_exemplars(features, support, **plan['classifier'])
        scores['neural-texture'], fits['neural-texture'] = fit_exemplars(
            np.concatenate([features, neural], axis=-1), support, **plan['classifier'])
        probabilities = {'baseline': baseline, **{k: score_probability(v) for k, v in scores.items()}}
        row.update(status='complete', fits=fits, seconds=time.monotonic()-started)
        path = args.output/f'fields-{index:03}.npz'
        np.savez_compressed(path, **scores)
        row['fields'] = reference(path)
        entry.update(probabilities=probabilities, display=region & (body >= .5))
        if cohort == 'synthetic':
            entry['display'] = region & (item['materials'] != 255)
            row['metrics'], row['boundaries'] = {}, {}
            for name, probability in probabilities.items():
                prediction = np.stack([body, probability])
                metric = measure(item, prediction, region)
                row['metrics'][name] = metric
                target = {**item, 'materials': np.where(region, item['materials'], 255)}
                row['boundaries'][name] = boundary(prediction[None], [target], {'rows': [metric]})['rows'][0]
        if (index+1) % 16 == 0:
            print(json.dumps({'processed': index+1, 'total': len(cases)}), flush=True)
        if sum(p.stat().st_size for p in args.output.iterdir()) > plan['resources']['maximumArtifactMiB']*1024**2:
            raise ValueError('Artifact budget exceeded')
    if frozen_hash(model) != before:
        raise ValueError('Frozen model changed')
    synthetic_entries = [e for e in entries if e['record']['cohort'] == 'synthetic']
    report = {'schema': 'paper-exemplar-probe-1', 'status': 'complete', 'plan': reference(args.plan),
              'sourceHashes': {p.name: digest(p.read_bytes()) for p in [
                  Path(__file__), Path(__file__).with_name('paper_exemplars.py')]},
              'training': training_reference, 'sourceSeparation': separation,
              'frozenStateExact': True, 'rows': [e['record'] for e in entries], 'summary': {},
              'scope': plan['scope'], 'gallery': {}}
    for kind in sorted({e['record']['kind'] for e in synthetic_entries}):
        selected = [e['record'] for e in synthetic_entries if e['record']['kind'] == kind]
        complete = [r for r in selected if r['status'] == 'complete']
        report['summary'][kind] = {
            'total': len(selected), 'complete': len(complete),
            'failed': [r['id'] for r in selected if r['status'] != 'complete'],
            'methods': {method: {
                'materialError': float(np.mean([r['metrics'][method]['materialPixelError'] for r in complete])),
                'jointError': float(np.mean([r['metrics'][method]['materialJointError'] for r in complete])),
                'boundaryError': float(np.mean([r['boundaries'][method]['boundaryError'] for r in complete])),
                'interiorError': float(np.mean([r['boundaries'][method]['interiorError'] for r in complete])),
            } for method in ['baseline', 'rgb-texture', 'neural-texture']} if complete else {}}
    # Retain the union of each method's worst eight cases; no model selection.
    review = set()
    for method in ['baseline', 'rgb-texture', 'neural-texture']:
        ranked = sorted((e for e in synthetic_entries if e['record']['status'] == 'complete'),
                        key=lambda e: e['record']['metrics'][method]['materialPixelError'], reverse=True)
        review.update(e['record']['id'] for e in ranked[:8])
    chosen = [e for e in synthetic_entries if e['record']['id'] in review or e['record']['status'] != 'complete']
    report['gallery']['synthetic'] = gallery(chosen, args.output, 'synthetic')
    report['gallery']['development'] = gallery(
        [e for e in entries if e['record']['cohort'] == 'development'], args.output, 'development')
    report['artifactBytesBeforeReport'] = sum(p.stat().st_size for p in args.output.iterdir())
    if report['artifactBytesBeforeReport'] > plan['resources']['maximumArtifactMiB']*1024**2:
        raise ValueError('Artifact budget exceeded')
    (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report['summary'], indent=2))


if __name__ == '__main__':
    main()
