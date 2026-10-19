"""Measure a fixed identity head on its entire declared synthetic training pool.

Group original, scene and printed counterparts with identical geometry. These
are training diagnostics, including unsampled views, never a held-out benchmark.
"""
import argparse
from collections import Counter
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation
import torch

from u2netp_material_candidate import load_material_candidate, module
from u2netp_material_training import material_training
from u2netp_adaptation import normalize_scores
from material_pilot import evaluate_materials
from data import digest


def boundary_diagnostics(predictions, items, metrics):
    """Separate two-pixel boundary bands from interiors without reassigning A/B.

    Only known paper labels form boundary seeds; unknown/background interfaces
    do not become material edges. Error still uses fractional coverage labels.
    """
    rows = []
    for prediction, item, score in zip(predictions, items, metrics['rows']):
        target = item['materials']; known = target != 255; hard = target >= .5
        edge = np.zeros(target.shape, bool)
        horizontal = known[:, 1:] & known[:, :-1] & (hard[:, 1:] != hard[:, :-1])
        vertical = known[1:] & known[:-1] & (hard[1:] != hard[:-1])
        edge[:, 1:] |= horizontal; edge[:, :-1] |= horizontal
        edge[1:] |= vertical; edge[:-1] |= vertical
        band = binary_dilation(edge, structure=np.ones((3, 3), bool), iterations=2) & known
        predicted = (prediction[1] >= .5) ^ score['materialPhaseExchanged']
        error = np.where(predicted, 1-target.astype(float), target.astype(float))
        row = {'id': item['id'], 'boundaryPixels': int(band.sum()), 'interiorPixels': int((known & ~band).sum())}
        for key, region in [('boundaryError', band), ('interiorError', known & ~band)]:
            row[key] = float(error[region].mean()) if region.any() else None
        assert abs(float(error[known].mean())-score['materialPixelError']) < 1e-12
        rows.append(row)
    return {'radiusPixels': 2, 'distance': 'Chebyshev from both pixels of each known-label class transition',
            'scope': 'Descriptive raster error by region at 320 pixels; no topology or cutting-path certificate.',
            'rows': rows,
            'macroMean': {key: float(np.mean([r[key] for r in rows if r[key] is not None]))
                          if any(r[key] is not None for r in rows) else None for key in ['boundaryError', 'interiorError']}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--training', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    torch.set_num_threads(1); torch.set_num_interop_threads(1)
    model, plan, training, reference = load_material_candidate(args.training)
    loader = module(Path(plan['source']['path']).parent/'data_loader.py', 'synthetic_material_input')
    real, items, separation = material_training(plan, loader.RescaleT(320), loader.ToTensorLab(flag=0))
    for item, expected in zip(real+items, training['trainingInputs']):
        assert {'id': item['id'], **item['evidence'], 'inputTensorSha256': digest(item['input'].numpy().tobytes())} == expected
    assert len(real)+len(items) == len(training['trainingInputs'])
    args.output.mkdir(parents=True, exist_ok=False)
    draws = Counter(draw['synthetic'] for draw in training['draws'])
    predictions = []
    with torch.no_grad():
        for index, item in enumerate(items):
            logits = model(item['input'][None])
            predictions.append(torch.cat([normalize_scores(logits[:, :1].sigmoid()), logits[:, 1:].sigmoid()], dim=1)[0].numpy())
            if (index+1) % 16 == 0: print(index+1, 'of', len(items), flush=True)
    predictions = np.stack(predictions)
    report = {'schema': 'material-synthetic-training-probe-1', 'status': 'complete', 'scope': __doc__.strip(),
              'training': reference, 'sourceSeparation': separation, 'implementationSha256': digest(Path(__file__).read_bytes()),
              'metrics': evaluate_materials(predictions, items), 'groups': {}, 'gallery': [],
              'trainingPhaseUpdates': len(training['history']), 'parentTraining': training.get('parentTraining')}
    report['boundaries'] = boundary_diagnostics(predictions, items, report['metrics'])
    for kind in sorted({item['evidence']['kind'] for item in items}):
        indices = [i for i, item in enumerate(items) if item['evidence']['kind'] == kind]
        selected = [items[i] for i in indices]
        metrics = evaluate_materials(predictions[indices], selected)
        report['groups'][kind] = {'poolViews': len(indices), 'sampledViews': sum(draws[i] > 0 for i in indices),
                                  'draws': sum(draws[i] for i in indices),
                                  'metrics': metrics, 'boundaries': boundary_diagnostics(predictions[indices], selected, metrics)}
    # Select failures by labelled error for diagnosis, never to choose a model.
    ordered = sorted(range(len(items)), key=lambda i: report['metrics']['rows'][i]['materialPixelError'], reverse=True)[:8]
    n = 320
    for start in range(0, len(ordered), 4):
        selected = ordered[start:start+4]
        sheet = Image.new('RGB', (3*n, len(selected)*(n+36)), 'white'); pen = ImageDraw.Draw(sheet)
        for row, index in enumerate(selected):
            item, metrics = items[index], report['metrics']['rows'][index]
            with Image.open(item['evidence']['photo']) as source: photo = source.convert('RGB').resize((n, n))
            labels = np.full((n, n, 3), 130, np.uint8)
            labels[item['materials'] == 0] = [255, 130, 0]; labels[item['materials'] == 1] = [0, 200, 255]
            material = (predictions[index, 1] >= .5) ^ metrics['materialPhaseExchanged']
            predicted = np.full_like(labels, 130)
            known = item['materials'] != 255
            predicted[known & ~material] = [255, 130, 0]; predicted[known & material] = [0, 200, 255]
            for column, image in enumerate([photo, Image.fromarray(labels), Image.fromarray(predicted)]):
                sheet.paste(image, (column*n, row*(n+36)))
            pen.text((4, row*(n+36)+n+2), item['id'], fill='black')
            pen.text((4, row*(n+36)+n+16), f'{metrics["materialPixelError"]:.2%} paper error / {draws[index]} draws this phase / photo, labels, prediction', fill='black')
        file = args.output/f'largest-errors-{start//4+1}.jpg'; sheet.save(file, quality=90)
        report['gallery'].append({'path': file.name, 'sha256': digest(file.read_bytes()), 'indices': selected})
    (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({kind: group['metrics']['macroMean'] for kind, group in report['groups'].items()}))


if __name__ == '__main__':
    main()
