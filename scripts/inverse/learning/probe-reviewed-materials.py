"""Score a fixed material model on newly reviewed, previously untrained photos.

This is an annotation-driven development diagnostic, not a template benchmark.
Partial labels affect only scoring and display, never model or palette inputs.
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import time

import numpy as np
from PIL import Image, ImageDraw, ImageOps
import torch

from data import digest
from material_pilot import evaluate_materials
from palette_calibration import calibrate
from preserved_candidate import pinned, source_separation
from real_foreground import check_current_training_sources
from real_materials import checked_materials
from u2netp_adaptation import input_tensor, normalize_scores, frozen_hash
from u2netp_material import stretched_material_labels
from u2netp_material_candidate import load_material_candidate, module


METHODS = ['network', 'learned', 'rgb']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    raw = args.plan.read_bytes(); plan = json.loads(raw)
    if plan['schema'] != 'reviewed-material-probe-plan-1' or plan['methods'] != METHODS:
        raise ValueError('Unsupported probe protocol')
    if shutil.disk_usage('.').free < 10*1024**3:
        raise ValueError('Insufficient free disk')
    torch.set_num_threads(1); torch.set_num_interop_threads(1)
    catalog = json.loads(pinned(plan['sourceManifest']).read_bytes())
    labels = json.loads(pinned(plan['annotations']).read_bytes())
    evaluation = json.loads(pinned(plan['reservedEvaluation']).read_bytes())
    audit = json.loads(pinned(plan['labelAudit']).read_bytes())
    rows = list(checked_materials(catalog, labels))
    bodies = [b for _, b, _ in rows]
    if [b['id'] for b in bodies] != plan['ids']:
        raise ValueError('Changed probe identity or order')
    current = check_current_training_sources(bodies, plan['sourceManifest']['path'])
    separation = source_separation(bodies, evaluation['photos'], catalog)
    model, training_plan, training, reference = load_material_candidate(pinned(plan['training']).parent)
    trained = {r['photoSha256'] for r in training['trainingInputs']}
    if trained & {s['sha256'] for _, _, s in rows}:
        raise ValueError('An inspected photo was already used in this model')
    assets = {s['sha256']: s for s in catalog['assets']}
    previous = [assets[r['photoSha256']] for r in training['trainingInputs'] if r['kind'] == 'reviewed-real-body']
    if {s['nearDuplicateGroup'] for s in previous} & {s['nearDuplicateGroup'] for _, _, s in rows}:
        raise ValueError('A probe photo shares a reviewed duplicate group with training')
    group_overlap = sorted({s['splitGroupId'] for s in previous} & {s['splitGroupId'] for _, _, s in rows})
    loader = module(Path(training_plan['source']['path']).parent/'data_loader.py', 'reviewed_material_input')
    rescale, normalize = loader.RescaleT(320), loader.ToTensorLab(flag=0)
    frozen = frozen_hash(model)
    args.output.mkdir(parents=True, exist_ok=False)
    files = [Path(__file__), *[Path(__file__).with_name(n) for n in
             ['palette_calibration.py', 'material_pilot.py', 'material_metrics.py',
              'u2netp_adaptation.py', 'u2netp_material.py', 'u2netp_material_candidate.py']]]
    report = {'schema': 'reviewed-material-probe-1', 'status': 'running',
              'plan': {'path': str(args.plan), 'sha256': digest(raw)}, 'training': reference,
              'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
              'sourceHashes': {str(p): digest(p.read_bytes()) for p in files},
              'currentSourceCheck': current, 'reservedEvaluationSeparation': separation,
              'sourceGroupsSharedWithTraining': group_overlap,
              'noTrainingPhotoOrReviewedDuplicate': True, 'methods': METHODS,
              'resolution': 320, 'rows': [], 'gallery': [], 'scope': plan['scope']}
    def save():
        for file, sha in report['sourceHashes'].items(): pinned({'path': file, 'sha256': sha})
        for key in ['training', 'annotations', 'sourceManifest', 'reservedEvaluation', 'labelAudit']:
            pinned(plan[key])
        pinned(report['plan'])
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    predictions = {m: [] for m in METHODS}; items = []; panels = []
    expected = {r['id']: r for r in audit['verification']['instances']}
    with torch.no_grad():
        for index, (annotation, body_row, source) in enumerate(rows):
            tensor, size, decoded = input_tensor(source['localPath'], source['sha256'], rescale, normalize)
            if size != body_row['sourceSize']:
                raise ValueError('EXIF-oriented input differs from annotation frame')
            body, material = stretched_material_labels(annotation, body_row)
            evidence = expected[body_row['id']]
            if (digest(body.tobytes()) != evidence['bodyLabelSha256'] or
                    digest(material.tobytes()) != evidence['materialLabelSha256']):
                raise ValueError('Training-frame labels differ from reviewed audit')
            item = {'id': body_row['id'], 'body': body, 'materials': material}; items.append(item)
            started = time.perf_counter(); logits = model(tensor[None])
            prediction = torch.cat([normalize_scores(logits[:, :1].sigmoid()), logits[:, 1:].sigmoid()], dim=1)[0].numpy()
            seconds = time.perf_counter()-started
            with Image.open(source['localPath']) as original:
                photo = ImageOps.exif_transpose(original).convert('RGB').resize((320, 320), Image.Resampling.BILINEAR)
            rgb = np.asarray(photo); values = {'network': prediction}; palettes = {}
            for method in METHODS[1:]:
                fraction, info = calibrate(rgb, prediction[0], prediction[1], np.ones(body.shape, bool), palette=method, mode='illumination')
                values[method] = np.stack([prediction[0], fraction]); palettes[method] = info
            stored = {}
            for name, field in [('body', prediction[0]), *[(m, values[m][1]) for m in METHODS]]:
                file = args.output/(item['id']+'-'+name+'.f32'); file.write_bytes(field.astype('<f4').tobytes())
                if not np.array_equal(np.fromfile(file, dtype='<f4').reshape(320, 320), field.astype('<f4')):
                    raise ValueError('Stored field differs')
                stored[name] = {'path': file.name, 'sha256': digest(file.read_bytes())}
            report['rows'].append({'id': item['id'], 'photo': source['localPath'], 'photoSha256': source['sha256'],
                                   'dimensions': size, 'decodedRGBSha256': decoded,
                                   'inputSha256': digest(tensor.numpy().tobytes()),
                                   'assets': stored, 'palettes': palettes, 'inferenceSeconds': seconds})
            overlay = rgb.astype(float)
            overlay[body == 0] *= .5
            overlay[body == 255] = .5*overlay[body == 255]+65
            for v, color in [(0, [255, 130, 0]), (1, [0, 200, 255])]:
                overlay[material == v] = .55*overlay[material == v]+.45*np.array(color)
            images = [photo, Image.fromarray(overlay.astype(np.uint8)), Image.fromarray(np.uint8(prediction[0]*255))]
            for method in METHODS:
                predictions[method].append(values[method])
                shown = np.full((320, 320, 3), 130, np.uint8)
                shown[(prediction[0] >= .5) & (values[method][1] < .5)] = [255, 130, 0]
                shown[(prediction[0] >= .5) & (values[method][1] >= .5)] = [0, 200, 255]
                images.append(Image.fromarray(shown))
            panels.append((item['id'], images))
            if len(panels) == 2 or index == len(rows)-1:
                sheet = Image.new('RGB', (1920, len(panels)*344), 'white'); pen = ImageDraw.Draw(sheet)
                for y, (identity, images) in enumerate(panels):
                    for x, image in enumerate(images): sheet.paste(image, (x*320, y*344))
                    pen.text((4, y*344+323), identity+' / photo, reviewed labels, body, network, learned palette, RGB palette', fill='black')
                file = args.output/('photos-'+str(len(report['gallery'])+1)+'.jpg'); sheet.save(file, quality=90)
                report['gallery'].append({'path': file.name, 'sha256': digest(file.read_bytes())}); panels = []
            save(); print(item['id'], round(seconds, 3), flush=True)
    if frozen_hash(model) != frozen:
        raise ValueError('Probe changed frozen model state')
    report.update(status='complete', frozenStateUnchanged=True,
                  metrics={m: evaluate_materials(np.stack(predictions[m]), items) for m in METHODS})
    save()
    if sum(p.stat().st_size for p in args.output.iterdir() if p.is_file()) > 20*1024**2:
        raise ValueError('Probe artifact budget exceeded')
    print(json.dumps({m: report['metrics'][m]['macroMean'] for m in METHODS}))


if __name__ == '__main__': main()
