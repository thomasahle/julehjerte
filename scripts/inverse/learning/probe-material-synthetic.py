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
import torch

from u2netp_material_candidate import load_material_candidate, module
from u2netp_material_training import material_training
from u2netp_adaptation import normalize_scores
from material_pilot import evaluate_materials
from data import digest


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
              'metrics': evaluate_materials(predictions, items), 'groups': {}, 'gallery': []}
    for kind in sorted({item['evidence']['kind'] for item in items}):
        indices = [i for i, item in enumerate(items) if item['evidence']['kind'] == kind]
        report['groups'][kind] = {'poolViews': len(indices), 'sampledViews': sum(draws[i] > 0 for i in indices),
                                  'draws': sum(draws[i] for i in indices),
                                  'metrics': evaluate_materials(predictions[indices], [items[i] for i in indices])}
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
            pen.text((4, row*(n+36)+n+16), f'{metrics["materialPixelError"]:.2%} paper error / {draws[index]} training draws / photo, labels, prediction', fill='black')
        file = args.output/f'largest-errors-{start//4+1}.jpg'; sheet.save(file, quality=90)
        report['gallery'].append({'path': file.name, 'sha256': digest(file.read_bytes()), 'indices': selected})
    (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({kind: group['metrics']['macroMean'] for kind, group in report['groups'].items()}))


if __name__ == '__main__':
    main()
