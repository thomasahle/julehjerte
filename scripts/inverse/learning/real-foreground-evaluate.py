"""Replay frozen foreground checkpoints on the reviewed real annotation pilot."""
import argparse
import html
import json
from pathlib import Path
import platform

import numpy as np
from PIL import Image
import torch

from data import digest
from foreground import load_foreground_run, tensors
from real_foreground import known_region_metrics, load_real_labels, masked_foreground_loss


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--labels', type=Path, required=True)
    parser.add_argument('--run', type=Path, action='append', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    torch.set_num_threads(2); torch.set_num_interop_threads(1)
    items, audit = load_real_labels(args.labels)
    names = [p.name for p in args.run]
    if len(set(names)) != len(names):
        raise ValueError('Checkpoint run names must be distinct')
    args.output.mkdir(parents=True, exist_ok=False)
    source_root = Path(__file__).parent
    report = {'schema': 'woven-heart-real-foreground-diagnostic-1', 'status': 'running', 'labelsAudit': audit,
              'sourceHashes': {name: digest((source_root/name).read_bytes()) for name in ['real_foreground.py', 'real-foreground-evaluate.py', 'foreground.py', 'model.py']},
              'runtime': {'python': platform.python_version(), 'torch': torch.__version__, 'device': 'cpu', 'threads': 2},
              'scope': 'Frozen synthetic-trained checkpoints; ten newly annotated real development examples. No fitting, fine-tuning, new checkpoint selection or unseen-test claim.',
              'inputs': [{'id': i['id'], 'rgbSha256': digest(i['rgb'].tobytes()), 'targetSha256': digest(i['target'].tobytes()),
                          'weightSha256': digest(i['weight'].tobytes()), 'splitGroupId': i['splitGroupId'], 'motif': i['motif']} for i in items],
              'runs': {}}
    def save():
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    save()
    for item in items:
        Image.fromarray(item['rgb']).save(args.output/(item['id']+'-source.png'))
    for run in args.run:
        model, source = load_foreground_run(run)
        predictions, losses = [], []
        with torch.no_grad():
            for start in range(0, len(items), 4):
                batch = items[start:start+4]; rgb, target = tensors(batch, 'cpu')
                weight = torch.from_numpy(np.stack([i['weight'][None] for i in batch]))
                logits = model(rgb)
                losses.append((float(masked_foreground_loss(logits, target, weight)), len(batch)))
                predictions.extend(logits.sigmoid()[:, 0].numpy())
        metrics = known_region_metrics(predictions, items)
        metrics['maskedLoss'] = sum(loss*n for loss, n in losses)/len(items)
        filename = run.name+'-predictions.npz'
        np.savez_compressed(args.output/filename, ids=np.array([i['id'] for i in items]), probabilities=np.stack(predictions))
        report['runs'][run.name] = {'checkpointSha256': source['checkpointSha256'], 'sourceReportSha256': digest((run/'report.json').read_bytes()),
                                   'predictions': {'path': filename, 'sha256': digest((args.output/filename).read_bytes())}, 'metrics': metrics}
        for item, probability in zip(items, predictions):
            Image.fromarray(np.uint8(np.clip(probability*255, 0, 255))).save(args.output/(item['id']+'-'+run.name+'-probability.png'))
            prediction, target, known = probability >= .5, item['target'] == 1, item['weight'] == 1
            error = item['rgb'].copy()
            error[known & prediction & ~target] = [255, 60, 30]
            error[known & ~prediction & target] = [30, 100, 255]
            error[~known] = np.uint8(.5*error[~known]+.5*np.array([255, 180, 0]))
            Image.fromarray(error).save(args.output/(item['id']+'-'+run.name+'-error.png'))
        save(); print(run.name, json.dumps(metrics['macroMean']), flush=True)
    sections = []
    for item in items:
        sections.append('<section><h2>'+html.escape(item['motif']['candidateFamily'])+'</h2><img src="'+item['id']+'-source.png" alt="Source">')
        for name in names:
            sections.append('<figure><figcaption>'+html.escape(name)+'</figcaption><img src="'+item['id']+'-'+name+'-probability.png" alt="Paper probability"><img src="'+item['id']+'-'+name+'-error.png" alt="Known pixel errors"></figure>')
        sections.append('</section>')
    (args.output/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Frozen models on real labels</title><style>body{font:16px system-ui;margin:24px;background:#eee}section{background:white;padding:12px;margin:16px 0}figure{display:inline-block;margin:8px}img{width:256px;height:256px}</style><h1>Real annotation diagnostic</h1><p>Red: false paper. Blue: missed paper. Gold: unknown, excluded from scores. The same observations and weights are used for both frozen models. These are development examples, not an unseen benchmark.</p>'+''.join(sections))
    report['artifacts'] = {p.name: digest(p.read_bytes()) for p in sorted(args.output.iterdir()) if p.suffix in ['.png', '.npz', '.html']}
    report['status'] = 'complete'; save()


if __name__ == '__main__': main()
