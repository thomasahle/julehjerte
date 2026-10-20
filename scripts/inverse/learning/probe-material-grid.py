"""Separate output-grid capacity from learned material prediction errors.

Use all 32 declared synthetic training geometries. Their original, printed and
scene views have identical labels. Labels directly fit the reference grid; no
photo inference, checkpoint training, crop selection or template fitting occurs.
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import time

import numpy as np
from PIL import Image, ImageDraw
import torch

from data import digest
from material_grid_reference import fit_grid_reference
from material_provenance import verify_material_sources
from preserved_candidate import pinned
from u2netp_material_candidate import module
from u2netp_material_training import material_training


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    raw = args.plan.read_bytes(); plan = json.loads(raw)
    if plan['schema'] != 'material-grid-capacity-plan-1':
        raise ValueError('Unexpected plan')
    if shutil.disk_usage('.').free < plan['resources']['minimumFreeGiB']*1024**3:
        raise ValueError('Insufficient disk')
    torch.set_num_threads(1); torch.set_num_interop_threads(1)
    training = json.loads(pinned(plan['training']).read_bytes())
    verify_material_sources(training)
    training_plan = json.loads(pinned(training['plan']).read_bytes())
    loader = module(Path(training_plan['source']['path']).parent/'data_loader.py', 'grid_reference_input')
    real, items, separation = material_training(training_plan, loader.RescaleT(320), loader.ToTensorLab(flag=0))
    evidence = [{'id': i['id'], **i['evidence'], 'inputTensorSha256': digest(i['input'].numpy().tobytes())} for i in real+items]
    if evidence != training['trainingInputs']:
        raise ValueError('Inputs or material labels changed')
    originals = [i for i in items if i['evidence']['kind'] == 'synthetic-original']
    if len(originals) != 32 or len(items) != 96:
        raise ValueError('Unexpected geometry/view cohort')
    groups = {}
    for original in originals:
        variants = [i for i in items if i['id'].split('--', 1)[0] == original['id']]
        if len(variants) != 3 or any(not np.array_equal(i['materials'], original['materials']) for i in variants):
            raise ValueError('Counterpart geometry or labels differ')
        groups[original['id']] = [i['id'] for i in variants]
    probes = {name: json.loads(pinned(ref).read_bytes()) for name, ref in plan['probes'].items()}
    boundary_probe = module(Path(__file__).with_name('probe-material-synthetic.py'), 'grid_boundary_diagnostic')
    args.output.mkdir(parents=True, exist_ok=False)
    report = {'schema': 'material-grid-capacity-results-1', 'status': 'running',
              'scope': __doc__.strip(), 'plan': {'path': str(args.plan), 'sha256': digest(raw)},
              'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
              'sourceHashes': {str(p): digest(p.read_bytes()) for p in [
                  Path(__file__), Path(__file__).with_name('material_grid_reference.py'),
                  Path(__file__).with_name('probe-material-synthetic.py'),
                  Path(__file__).with_name('u2netp_material_training.py'),
                  Path(__file__).with_name('u2netp_material.py')]},
              'sourceSeparation': separation, 'geometryGroups': groups,
              'runtime': {'torch': torch.__version__, 'threads': 1, 'device': 'cpu'},
              'protocol': plan['protocol'], 'rows': [], 'gallery': []}
    predictions, grids = [], []
    started = time.perf_counter()

    def save():
        pinned(report['plan'])
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')

    for index, item in enumerate(originals):
        target = item['materials']
        probability, optimization, grid = fit_grid_reference(target, **plan['protocol']['fit'])
        predictions.append(probability); grids.append(grid)
        known = target != 255
        error = np.where(probability >= .5, 1-target.astype(float), target.astype(float))
        score = {'materialPhaseExchanged': False, 'materialPixelError': float(error[known].mean())}
        # Body channel is explicitly oracle here. Only material metrics are used.
        oracle = np.stack([item['body'] == 1, probability])[None]
        boundaries = boundary_probe.boundary_diagnostics(oracle, [item], {'rows': [score]})['rows'][0]
        row = {'id': item['id'], 'labelSha256': digest(target.tobytes()),
               'probabilitySha256': digest(probability.tobytes()), 'optimization': optimization,
               'gridReference': {**score, **boundaries},
               'fullPixelIdealError': float(np.minimum(target[known], 1-target[known]).mean()),
               'learned': {}}
        for name, probe in probes.items():
            values = {r['id']: r for r in probe['metrics']['rows']}
            edges = {r['id']: r for r in probe['boundaries']['rows']}
            if set(values) != {i['id'] for i in items}:
                raise ValueError('Probe cohort differs')
            row['learned'][name] = {i['evidence']['kind']: {
                'id': i['id'], 'materialPixelError': values[i['id']]['materialPixelError'],
                'boundaryError': edges[i['id']]['boundaryError'], 'interiorError': edges[i['id']]['interiorError']}
                for i in items if i['id'] in groups[item['id']]}
        report['rows'].append(row)
        if (index+1) % 8 == 0:
            save(); print(json.dumps({'geometries': index+1, 'seconds': time.perf_counter()-started}), flush=True)
    report['summary'] = {'geometries': len(originals), 'views': len(items),
        'gridReference': {key: float(np.mean([r['gridReference'][key] for r in report['rows']]))
                          for key in ['materialPixelError', 'boundaryError', 'interiorError']},
        'fullPixelIdealError': float(np.mean([r['fullPixelIdealError'] for r in report['rows']])),
        'learned': {name: {kind: {
            key: float(np.mean([r['learned'][name][kind][key] for r in report['rows']]))
            for key in ['materialPixelError', 'boundaryError', 'interiorError']}
            for kind in ['synthetic-original', 'synthetic-printed', 'synthetic-scene']} for name in probes}}
    # Every field is saved; galleries select the eight largest reference errors.
    np.savez_compressed(args.output/'references.npz', ids=np.array([i['id'] for i in originals]), material=np.stack(predictions), logits=np.stack(grids))
    worst = sorted(range(len(originals)), key=lambda i: report['rows'][i]['gridReference']['materialPixelError'], reverse=True)[:8]
    colours = np.array([[255, 130, 0], [0, 200, 255]], np.uint8)
    for start in range(0, len(worst), 4):
        selected = worst[start:start+4]; n = 320
        sheet = Image.new('RGB', (n*3, len(selected)*(n+36)), 'white'); pen = ImageDraw.Draw(sheet)
        for row_index, index in enumerate(selected):
            item = originals[index]; target = item['materials']; known = target != 255
            with Image.open(item['evidence']['photo']) as photo:
                sheet.paste(photo.convert('RGB').resize((n, n)), (0, row_index*(n+36)))
            for column, mask in enumerate([target >= .5, predictions[index] >= .5], start=1):
                rgb = np.full((n, n, 3), 130, np.uint8); rgb[known] = colours[mask[known].astype(int)]
                sheet.paste(Image.fromarray(rgb), (column*n, row_index*(n+36)))
            pen.text((4, row_index*(n+36)+n+2), item['id'], fill='black')
            pen.text((4, row_index*(n+36)+n+16),
                     f'{report["rows"][index]["gridReference"]["materialPixelError"]:.2%} oracle error / photo, target, 160-grid reference', fill='black')
        file = args.output/f'grid-reference-{start//4+1}.jpg'; sheet.save(file, quality=90)
        report['gallery'].append({'path': file.name, 'sha256': digest(file.read_bytes()), 'indices': selected})
    report.update(status='complete', seconds=time.perf_counter()-started,
        artifacts={p.name: digest(p.read_bytes()) for p in args.output.iterdir() if p.name != 'report.json'})
    save()
    if sum(p.stat().st_size for p in args.output.iterdir()) > plan['resources']['maxArtifactMiB']*1024**2:
        raise ValueError('Artifact budget exceeded')
    print(json.dumps(report['summary']), flush=True)


if __name__ == '__main__':
    main()
