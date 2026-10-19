"""Compare fixed neural paper fields with neural-seeded and RGB-only palettes.

Palette estimation uses the 320-pixel full-photo frame. Native review applies
the inferred palette to original RGB pixels, in strips to bound memory. No
annotation, crop, template or per-photo method choice enters calibration.
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageOps
import torch

from data import digest
from material_pilot import evaluate_materials
from palette_calibration import calibrate, mixture
from preserved_candidate import pinned
from u2netp_adaptation import normalize_scores
from u2netp_material_candidate import load_material_candidate, module
from u2netp_material_training import material_training


METHODS = ['network', 'learned', 'rgb']


def photo(file, sha, decoded):
    path = pinned({'path': str(file), 'sha256': sha})
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert('RGB')
    if digest(image.tobytes()) != decoded:
        raise ValueError('Decoded photo differs: '+str(file))
    return image


def calibrated(rgb, prediction):
    body, material = prediction
    values = {'network': prediction}; evidence = {}
    for method in METHODS[1:]:
        result, info = calibrate(rgb, body, material, np.ones(body.shape, bool), palette=method, mode='illumination')
        values[method] = np.stack([body, result]); evidence[method] = info
        assert np.array_equal(values[method][0], body)
    return values, evidence


def native_mask(image, info):
    """Classify original RGB before display reduction; store no full-size field."""
    result = np.empty((image.height, image.width), np.uint8)
    for y in range(0, image.height, 128):
        rgb = np.asarray(image.crop((0, y, image.width, min(y+128, image.height))), dtype=float)/255
        p, _ = mixture(rgb, info['colors'], info['mode'])
        result[y:y+len(p)] = p >= .5
    return Image.fromarray(result).resize((320, 320), Image.Resampling.NEAREST)


def shown(body, material):
    values = np.full((*body.shape, 3), 130, np.uint8)
    values[(body >= .5) & ~material] = [255, 130, 0]
    values[(body >= .5) & material] = [0, 200, 255]
    return Image.fromarray(values)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(); raw = args.plan.read_bytes(); plan = json.loads(raw)
    assert plan['schema'] == 'u2netp-material-calibration-plan-1' and plan['methods'] == METHODS
    if shutil.disk_usage('.').free < 10*1024**3: raise ValueError('Insufficient free disk')
    args.output.mkdir(parents=True, exist_ok=False)
    torch.set_num_threads(1); torch.set_num_interop_threads(1)
    reference = pinned(plan['training']); model, training_plan, training, _ = load_material_candidate(reference.parent)
    loader = module(Path(training_plan['source']['path']).parent/'data_loader.py', 'calibration_input')
    probe = module(Path(__file__).with_name('probe-material-synthetic.py'), 'calibration_metrics')
    real, synthetic, separation = material_training(training_plan, loader.RescaleT(320), loader.ToTensorLab(flag=0))
    items = real+synthetic
    assert [{'id': item['id'], **item['evidence'], 'inputTensorSha256': digest(item['input'].numpy().tobytes())} for item in items] == training['trainingInputs']
    report = {'schema': 'u2netp-material-calibration-1', 'status': 'running', 'plan': {'path': str(args.plan), 'sha256': digest(raw)},
              'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
              'sourceHashes': {str(Path(__file__).with_name(name)): digest(Path(__file__).with_name(name).read_bytes()) for name in
                               ['calibrate-u2netp-material.py', 'palette_calibration.py', 'probe-material-synthetic.py', 'material_pilot.py', 'material_metrics.py']},
              'sourceSeparation': separation, 'methods': METHODS, 'training': {}, 'native': {'rows': [], 'gallery': []}, 'scope': plan['scope']}
    def save():
        for file, sha in report['sourceHashes'].items(): pinned({'path': file, 'sha256': sha})
        for key in ['training', 'nativeProbe', 'syntheticReference']: pinned(plan[key])
        pinned(report['plan'])
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    predictions = {method: [] for method in METHODS}; evidence = []
    with torch.no_grad():
        for index, item in enumerate(items):
            logits = model(item['input'][None])
            predicted = torch.cat([normalize_scores(logits[:, :1].sigmoid()), logits[:, 1:].sigmoid()], dim=1)[0].numpy()
            source = item['evidence']; image = photo(source['photo'], source['photoSha256'], source['decodedRGBSha256'])
            values, info = calibrated(np.asarray(image.resize((320, 320), Image.Resampling.BILINEAR)), predicted)
            for method in METHODS: predictions[method].append(values[method])
            evidence.append({'id': item['id'], 'methods': info})
            if (index+1) % 16 == 0: print(index+1, 'of', len(items), flush=True)
    predictions = {method: np.stack(values) for method, values in predictions.items()}
    groups = {'real-training': list(range(len(real)))}
    for kind in sorted({item['evidence']['kind'] for item in synthetic}):
        groups[kind] = [i for i, item in enumerate(items) if i >= len(real) and item['evidence']['kind'] == kind]
    for kind, indices in groups.items():
        selected = [items[i] for i in indices]; report['training'][kind] = {}
        for method in METHODS:
            values = predictions[method][indices]; metrics = evaluate_materials(values, selected)
            report['training'][kind][method] = {'metrics': metrics, 'boundaries': probe.boundary_diagnostics(values, selected, metrics)}
    assert report['training']['real-training']['network']['metrics'] == training['trainingMetrics']['final']
    old = json.loads(pinned(plan['syntheticReference']).read_bytes())
    for kind in groups:
        if kind != 'real-training':
            assert report['training'][kind]['network']['metrics'] == old['groups'][kind]['metrics']
            assert report['training'][kind]['network']['boundaries'] == old['groups'][kind]['boundaries']
    report['trainingCalibration'] = evidence
    report['unchangedNetworkMetricsExact'] = True
    del model, predictions
    saved_probe = pinned(plan['nativeProbe']); native = json.loads(saved_probe.read_bytes())
    assert native['status'] == 'complete' and native['resolution'] == 320 and native['training'] == plan['training']
    report['native']['scope'] = 'Same fixed source-separated development photos. No complete ground truth. Body remains byte-identical; only known training labels are scored above.'
    panels = []
    for row in native['rows']:
        image = photo(row['file'], row['photoSha256'], row['decodedRGBSha256'])
        assert list(image.size) == row['dimensions'] and row['window'] == [0, 0, *image.size]
        fields = []
        for key in ['body', 'material']:
            asset = row['assets'][key]; file = (saved_probe.parent/asset['path']).resolve()
            if not file.is_relative_to(saved_probe.parent.resolve()): raise ValueError('Unsafe field path')
            fields.append(np.fromfile(pinned({'path': str(file), 'sha256': asset['sha256']}), dtype='<f4').reshape(320, 320))
        body, material = fields
        values, info = calibrated(np.asarray(image.resize((320, 320), Image.Resampling.BILINEAR)), np.stack(fields))
        evidence = {'id': row['id'], 'source': {k: row[k] for k in ['file', 'photoSha256', 'decodedRGBSha256', 'dimensions', 'inputSha256', 'window']},
                    'fieldReference': row['assets'], 'methods': info,
                    'probabilitySha256At320': {k: digest(values[k][1].astype('<f4').tobytes()) for k in METHODS}}
        report['native']['rows'].append(evidence)
        images = [image.resize((320, 320), Image.Resampling.BILINEAR), shown(body, material >= .5)]
        for method in METHODS[1:]:
            mask = np.asarray(native_mask(image, info[method]), bool) if info[method]['applied'] else material >= .5
            images.append(shown(body, mask))
        panels.append((row['id'], images))
        if len(panels) == 4 or row == native['rows'][-1]:
            sheet = Image.new('RGB', (1280, len(panels)*346), 'white'); pen = ImageDraw.Draw(sheet)
            for y, (identity, images) in enumerate(panels):
                for x, item in enumerate(images): sheet.paste(item, (x*320, y*346))
                pen.text((4, y*346+322), identity+' / photo, network, neural-selected palette, RGB-cluster palette', fill='black')
            name = f'photos-{len(report["native"]["gallery"])+1}.jpg'; sheet.save(args.output/name, quality=88)
            report['native']['gallery'].append({'path': name, 'sha256': digest((args.output/name).read_bytes())}); panels = []
        save()
    report['native']['bodyFieldsUnchanged'] = True
    report['native']['reviewMaterialResolution'] = 'Palette learned at 320; mixture evaluated on original RGB, thresholded at source resolution then nearest sampled to gallery. Failed calibration retains neural field.'
    report['logicalBytes'] = sum(file.stat().st_size for file in args.output.iterdir() if file.is_file())
    assert report['logicalBytes'] < 10*1024**2
    report['status'] = 'complete'; save()
    print(json.dumps({kind: {m: r['metrics']['macroMean']['materialPixelError'] for m, r in group.items()} for kind, group in report['training'].items()}), flush=True)


if __name__ == '__main__': main()
