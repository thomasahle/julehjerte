"""Score a frozen foreground model on paired photographic interventions."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_erosion
import torch

from data import checked_asset, digest
from foreground import load_foreground_run, physical_foreground, foreground_metrics, infer


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True)
    parser.add_argument('--probe', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--device', default='mps', choices=['cpu', 'mps'])
    args = parser.parse_args()
    root, out = Path(args.probe).resolve(), Path(args.output).resolve()
    manifest_bytes = (root/'manifest.json').read_bytes(); manifest = json.loads(manifest_bytes)
    if manifest['schema'] != 'woven-heart-intervention-probe-1' or manifest['status'] != 'complete':
        raise ValueError('Require a completed controlled-intervention probe')
    out.mkdir(parents=True, exist_ok=False)
    torch.set_num_threads(2); torch.set_num_interop_threads(1)
    model, training = load_foreground_run(args.run, args.device)
    report = {'schema': 'woven-heart-foreground-interventions-1', 'status': 'loading', 'arguments': vars(args),
              'probeManifestSha256': digest(manifest_bytes), 'checkpointSha256': training['checkpointSha256'],
              'trainingReportSha256': digest((Path(args.run)/'report.json').read_bytes()),
              'sourceHashes': {name: digest((Path(__file__).parent/name).read_bytes()) for name in ['foreground-interventions.py', 'foreground.py', 'model.py', 'data.py']},
              'policy': 'Frozen model and threshold 0.5; interventions scored in unchanged physical-photo coordinates. No fitting, threshold tuning or retraining.',
              'limitations': ['Selected synthetic counterfactuals, not a new random generalization test.',
                              'Changing the background can alter nearby paper pixels through blur/resampling/JPEG. Interior RGB changes are measured explicitly.']}
    def save(): (out/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    save()
    items = []
    for row in manifest['rows']:
        if not row['invariants']['cameraAndPhotoNodesUnchanged'] or not row['invariants']['nonintervenedParametersUnchanged']:
            raise ValueError('Unverified paired control')
        labels = json.loads(checked_asset(root, row['assets']['labels.json']).read_text())
        image = Image.open(checked_asset(root, row['assets']['photo.jpg'])).convert('RGB')
        if image.size != (labels['resolution'], labels['resolution']): raise ValueError('Photo dimensions disagree')
        items.append({'id': row['id'], 'sourceViewId': row['sourceViewId'], 'variant': row['variant'],
                      'rgb': np.asarray(image.resize((256, 256), Image.Resampling.BILINEAR)).copy(),
                      'target': physical_foreground(labels, 256).astype(np.float32), 'labels': labels})
    baselines = {i['sourceViewId']: i for i in items if i['variant'] == 'baseline'}
    for item in items:
        baseline = baselines[item['sourceViewId']]
        if not np.array_equal(item['target'], baseline['target']) or item['labels']['canonicalToPhoto'] != baseline['labels']['canonicalToPhoto']:
            raise ValueError('Intervention changed physical foreground/camera')
    report['status'] = 'scoring'; save()
    _, predictions = infer(model, items, args.device)
    baseline_predictions = {i['sourceViewId']: p for i, p in zip(items, predictions) if i['variant'] == 'baseline'}
    report['metrics'] = {}; report['paired'] = []
    for variant in [v['name'] for v in manifest['variants']]:
        indices = [j for j, i in enumerate(items) if i['variant'] == variant]
        report['metrics'][variant] = foreground_metrics([predictions[j] for j in indices], [items[j] for j in indices])
    for item, probability in zip(items, predictions):
        baseline = baselines[item['sourceViewId']]; original = baseline_predictions[item['sourceViewId']]
        core = binary_erosion(item['target'] > .5, iterations=8)
        delta = np.abs(item['rgb'].astype(float)-baseline['rgb'].astype(float))/255
        report['paired'].append({'id': item['id'], 'sourceViewId': item['sourceViewId'], 'variant': item['variant'],
                                 'foregroundPixels': int(item['target'].sum()), 'corePixels': int(core.sum()),
                                 'paperCoreMeanAbsoluteRGBChange': float(delta[core].mean()),
                                 'paperCoreMeanAbsolutePredictionChange': float(np.abs(probability[core]-original[core]).mean()),
                                 'paperCoreFalseNegativeFraction': float((probability[core] < .5).mean()),
                                 'foregroundSha256': digest(item['target'].tobytes())})
    np.savez_compressed(out/'predictions.npz', ids=np.array([i['id'] for i in items]), probabilities=np.stack(predictions))
    # Each contact sheet is a complete paired intervention group, not selected
    # successful results. A=paper in these probability images, unrelated to sheet color.
    for source_id in baselines:
        chosen = [j for j, item in enumerate(items) if item['sourceViewId'] == source_id]
        sheet = Image.new('RGB', (256*len(chosen), 2*256+30), 'white'); pen = ImageDraw.Draw(sheet)
        for col, index in enumerate(chosen):
            item, probability = items[index], predictions[index]
            sheet.paste(Image.fromarray(item['rgb']), (col*256, 30))
            sheet.paste(Image.fromarray((probability*255).astype(np.uint8)).convert('RGB'), (col*256, 286))
            pen.text((col*256+4, 6), item['variant'], fill='black')
        sheet.save(out/(source_id+'.png'))
    report['artifacts'] = {p.name: digest(p.read_bytes()) for p in out.iterdir() if p.suffix in ['.png', '.npz']}
    report['status'] = 'complete'; save()
    print(json.dumps({k: {key: v[key] for key in ['views', 'iou', 'pixelError', 'backgroundFalsePositive', 'paperFalseNegative']} for k, v in report['metrics'].items()}, indent=2))


if __name__ == '__main__': main()
