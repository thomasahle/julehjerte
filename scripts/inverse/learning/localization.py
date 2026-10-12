"""Re-score saved models with thin one-to-one boundaries and frozen thresholds."""
import argparse
import json
import platform
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
import scipy
import torch

from data import Corpus, digest, scores, detect_nodes, point_counts
from metrics import thin_boundary, pixel_matching_counts
from classical import corner_response
from model import ProposalNet
from train import infer


def measure(item, boundary, nodes):
    valid = item['valid']
    prediction, target = thin_boundary(boundary & valid), thin_boundary(item['boundary'] & valid)
    return {'id': item['id'], 'designId': item['designId'], 'split': item['split'],
            'boundary': {str(t): scores(pixel_matching_counts(prediction, target, t)) for t in [1, 2, 3]},
            'junctions': scores(point_counts(nodes, item['nodes'])),
            'rawBoundaryPixels': int((boundary & valid).sum()), 'thinBoundaryPixels': int(prediction.sum())}


def aggregate(rows):
    def pooled(values):
        return scores([sum(r[k] for r in values) for k in ['matched', 'predicted', 'target']])
    return {split: {'views': len(subset), 'boundary': {str(t): pooled([r['boundary'][str(t)] for r in subset]) for t in [1, 2, 3]},
                    'junctions': pooled([r['junctions'] for r in subset]),
                    'viewsWithEveryJunctionRecovered': sum(r['junctions']['matched'] == r['junctions']['target'] for r in subset),
                    'viewsWithReferenceJunctions': sum(r['junctions']['target'] > 0 for r in subset),
                    'nonemptyViewsWithEveryJunctionRecovered': sum(r['junctions']['target'] > 0 and r['junctions']['matched'] == r['junctions']['target'] for r in subset),
                    'maximumJunctionProposals': max(r['junctions']['predicted'] for r in subset),
                    'macroBoundaryF1': {str(t): float(np.mean([r['boundary'][str(t)]['f1'] for r in subset])) for t in [1, 2, 3]},
                    'rawBoundaryPixels': sum(r['rawBoundaryPixels'] for r in subset),
                    'thinBoundaryPixels': sum(r['thinBoundaryPixels'] for r in subset)}
            for split in sorted({r['split'] for r in rows}) for subset in [[r for r in rows if r['split'] == split]]}


def comparisons(items, predictions, thresholds, output):
    # First six per split remain selected by manifest order, not their score.
    for split in sorted({i['split'] for i in items}):
        indices = [i for i, item in enumerate(items) if item['split'] == split][:6]
        n = 256; sheet = Image.new('RGB', (n*4, (n+24)*len(indices)), 'white'); draw = ImageDraw.Draw(sheet)
        for row, i in enumerate(indices):
            item, prediction = items[i], predictions[i]
            masks = [item['boundary'], item['baselineBoundary'], prediction[0] >= thresholds[0]]
            panels = [item['rgb']] + [np.where(thin_boundary(mask & item['valid'])[..., None], [255, 30, 30], item['rgb']).astype(np.uint8) for mask in masks]
            for column, panel in enumerate(panels): sheet.paste(Image.fromarray(panel).resize((n, n)), (column*n, row*(n+24)))
            draw.text((3, row*(n+24)+n+3), item['id']+' | input / reference / trace / learned (same thinning)', fill='black')
        sheet.save(output/(split+'-thin-comparison.png'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepared', default='tmp/heart-learning/prepared-v1')
    parser.add_argument('--run', action='append', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--device', default='mps', choices=['cpu', 'mps', 'cuda'])
    args = parser.parse_args()
    output = Path(args.output); output.mkdir(parents=True, exist_ok=False)
    torch.set_num_threads(2); torch.set_num_interop_threads(1)
    device = torch.device(args.device)
    report = {'schema': 'heart-boundary-localization-1', 'status': 'loading', 'arguments': vars(args),
              'sourceHashes': {p.name: digest(p.read_bytes()) for p in Path(__file__).parent.glob('*.py')},
              'runtime': {'python': platform.python_version(), 'numpy': np.__version__, 'scipy': scipy.__version__, 'torch': torch.__version__, 'device': str(device)},
              'protocol': ['Identical Guo–Hall thinning of prediction and reference within the known valid region.',
                           'Maximum-cardinality one-to-one matching at Euclidean radii 1, 2, 3 pixels.',
                           'Saved checkpoint and development-selected thresholds remain frozen; no training or retuning.',
                           'Synthetic component evaluation; recipe holdouts are not topology-disjoint or unseen real photographs.',
                           'Raster pixel counts are not arc length; this does not certify graph connectivity or cutting legality.'], 'models': {}}
    def save():
        temporary = output/'report.writing.json'; temporary.write_text(json.dumps(report, indent=2)+'\n'); temporary.replace(output/'report.json')
    save()
    try:
        corpus = Corpus(args.prepared)
        report['preparedManifestSha256'] = digest((corpus.root/'manifest.json').read_bytes())
        report['datasetManifestSha256'] = corpus.prepared['datasetManifestSha256']
        items = []
        for row in corpus.rows:
            if corpus.split[corpus.views[row['id']]['designId']] != 'train': items.append(corpus.load(row))
        print('Loaded', len(items), 'held-out views', flush=True)
        baseline = []
        for index, item in enumerate(items):
            print('baseline', index, item['id'], flush=True)
            baseline.append(measure(item, item['baselineBoundary'], item['baselineNodes']))
        report['baseline'] = aggregate(baseline); report['baselineRows'] = baseline
        # Scales and this threshold list are fixed before scoring recipe
        # holdouts; only the lattice development views choose the threshold.
        responses = [corner_response(i['mask'])*i['valid'] for i in items]
        threshold_search = []
        for threshold in [1e-6, 3e-6, 1e-5, 3e-5, 1e-4, 3e-4]:
            counts = np.zeros(3, np.int64)
            for item, response in zip(items, responses):
                if item['split'] == 'development': counts += point_counts(detect_nodes(response, threshold), item['nodes'])
            threshold_search.append({'threshold': threshold, **scores(counts)})
        classical_threshold = max(threshold_search, key=lambda x: x['f1'])['threshold']
        classical_rows = [{**row, 'junctions': scores(point_counts(detect_nodes(response, classical_threshold), item['nodes']))}
                          for row, item, response in zip(baseline, items, responses)]
        report['classical'] = {'name': 'Harris response of production mask', 'selectedThreshold': classical_threshold,
                               'thresholdSearch': threshold_search, 'metrics': aggregate(classical_rows), 'rows': classical_rows,
                               'note': 'Boundary scores reuse the original trace. Only junction proposals differ.'}
        del responses
        save()
        for directory in args.run:
            started = time.perf_counter(); folder = Path(directory)
            prior = json.loads((folder/'report.json').read_text())
            if prior['status'] != 'complete': raise ValueError('Only completed runs can be rescored')
            for key in ['datasetManifestSha256', 'preparedManifestSha256']:
                if prior[key] != report[key]: raise ValueError('Changed '+key)
            if prior['sourceHashes']['model.py'] != report['sourceHashes']['model.py']:
                raise ValueError('Changed model implementation')
            if prior['checkpointSha256'] != digest((folder/'model.pt').read_bytes()):
                raise ValueError('Changed selected checkpoint')
            model = ProposalNet('random').to(device)
            model.load_state_dict(torch.load(folder/'model.pt', map_location=device, weights_only=True))
            _, predictions = infer(model, items, device, 8)
            thresholds = prior['selectedThresholds']
            rows = []
            for index, (item, prediction) in enumerate(zip(items, predictions)):
                print(folder.name, index, item['id'], flush=True)
                rows.append(measure(item, prediction[0] >= thresholds[0], detect_nodes(prediction[1]*item['valid'], thresholds[1])))
            name = folder.name
            if name in report['models']: raise ValueError('Run names must be unique')
            report['models'][name] = {'reportPath': str(folder/'report.json'), 'reportSha256': digest((folder/'report.json').read_bytes()),
                                      'checkpointSha256': prior['checkpointSha256'], 'thresholds': thresholds,
                                      'selectedEpoch': prior['selectedEpoch'], 'initialization': prior['initialization'],
                                      'metrics': aggregate(rows), 'rows': rows, 'evaluationSeconds': time.perf_counter()-started}
            comparison_output = output/name; comparison_output.mkdir()
            comparisons(items, predictions, thresholds, comparison_output)
            report['status'] = 'evaluating'; save()
            print(name, json.dumps(report['models'][name]['metrics']), flush=True)
            del model, predictions
        report['status'] = 'complete'; save()
    except Exception as error:
        report['status'] = 'failed'; report['error'] = str(error); save(); raise


if __name__ == '__main__':
    main()
