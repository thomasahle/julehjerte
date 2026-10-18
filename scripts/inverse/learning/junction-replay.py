"""Compare the current app initializer and frozen CNN corner refinement."""
import argparse
import json
from pathlib import Path
import time

import numpy as np
import torch

from classical import refine_corners
from data import Corpus, checked_asset, digest, observable_nodes, boundary_pixels, detect_nodes, point_counts, scores
from localization import measure, aggregate
from model import ProposalNet
from train import infer


def bounded_refinement(mask, nodes, valid, radius):
    """Preserve every proposal; reject moves outside the observed region."""
    refined = refine_corners(mask, nodes, radius)
    if len(refined):
        indices = np.floor(refined).astype(int)
        inside = valid[indices[:, 1], indices[:, 0]]
        refined[~inside] = nodes[~inside]
    return refined


def summarize(rows):
    return {split: {**scores([sum(r['counts'][i] for r in subset) for i in range(3)]),
                    'views': len(subset),
                    'allJunctionsRecovered': sum(r['counts'][0] == r['counts'][2] for r in subset),
                    'maximumProposals': max(r['counts'][1] for r in subset)}
            for split in sorted({r['split'] for r in rows})
            for subset in [[r for r in rows if r['split'] == split]]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepared', default='tmp/heart-learning/prepared-v1')
    parser.add_argument('--run', default='tmp/heart-learning/balanced-corners-v1')
    parser.add_argument('--app-baseline', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--device', choices=['cpu', 'mps', 'cuda'], default='mps')
    args = parser.parse_args()
    output = Path(args.output); output.mkdir(parents=True, exist_ok=False)
    corpus = Corpus(args.prepared); app_root = Path(args.app_baseline); run = Path(args.run)
    app = json.loads((app_root/'manifest.json').read_text())
    prior = json.loads((run/'report.json').read_text())
    if app['status'] != 'complete' or prior['status'] != 'complete':
        raise ValueError('Only complete app replays and training runs can be compared')
    for record in [app, prior]:
        if record['preparedManifestSha256'] != digest((corpus.root/'manifest.json').read_bytes()) or record['datasetManifestSha256'] != corpus.prepared['datasetManifestSha256']:
            raise ValueError('Changed frozen study inputs')
    code = Path(__file__).parent
    if prior['checkpointSha256'] != digest((run/'model.pt').read_bytes()) or prior['sourceHashes']['model.py'] != digest((code/'model.py').read_bytes()):
        raise ValueError('Changed model or checkpoint')
    app_rows = {r['id']: r for r in app['rows']}
    selected = [r for r in corpus.rows if corpus.split[corpus.views[r['id']]['designId']] != 'train']
    if len(app_rows) != len(app['rows']) or set(app_rows) != {r['id'] for r in selected}:
        raise ValueError('App baseline omits or duplicates evaluation views')
    report = {'schema': 'heart-junction-replay-1', 'status': 'loading', 'arguments': vars(args),
              'preparedManifestSha256': app['preparedManifestSha256'], 'datasetManifestSha256': app['datasetManifestSha256'],
              'appManifestSha256': digest((app_root/'manifest.json').read_bytes()),
              'trainingReportSha256': digest((run/'report.json').read_bytes()), 'checkpointSha256': prior['checkpointSha256'],
              'sourceHashes': {p.name: digest(p.read_bytes()) for p in code.glob('*.py')},
              'threshold': prior['selectedThresholds'][1],
              'protocol': ['No training, changed input mask, or neural threshold tuning.',
                           'The app initializer is replayed at the frozen study resolution; it is not a completed template solve.',
                           'Refinement uses only the production binary mask; no reference coordinates enter a local move.',
                           'Refinement preserves proposal count; moves outside the known valid region revert to the original proposal.',
                           'Refinement choices none/5px/9px are selected by original development F1 only.',
                           'Repeatedly inspected synthetic diagnostic splits, not pristine or topology-disjoint test sets.'],
              'rows': {name: [] for name in ['legacy-trace', 'app-trace', 'cnn', 'cnn-refined-5', 'cnn-refined-9']}}
    def save():
        temp = output/'report.writing.json'; temp.write_text(json.dumps(report, indent=2)+'\n'); temp.replace(output/'report.json')
    save()
    try:
        torch.set_num_threads(2); torch.set_num_interop_threads(1); device = torch.device(args.device)
        model = ProposalNet('random').to(device)
        model.load_state_dict(torch.load(run/'model.pt', map_location=device, weights_only=True))
        app_boundaries = []
        for start in range(0, len(selected), 8):
            batch = selected[start:start+8]; items = [corpus.load(row) for row in batch]
            _, predictions = infer(model, items, device, 8)
            for row, item, prediction in zip(batch, items, predictions):
                replay = app_rows[row['id']]
                if replay['inputMaskSha256'] != row['assets']['mask.png']['sha256'] or replay['split'] != item['split']:
                    raise ValueError('Changed replay mask identity or split')
                trace = json.loads(checked_asset(app_root, replay['trace']).read_text())
                matrix = np.diag([corpus.resolution/trace['width'], corpus.resolution/trace['width'], 1])
                app_nodes = observable_nodes(trace['curves'], matrix)
                n = corpus.resolution
                app_nodes = app_nodes[(app_nodes >= 0).all(1) & (app_nodes < n).all(1)]
                if len(app_nodes): app_nodes = app_nodes[item['valid'][app_nodes[:, 1].astype(int), app_nodes[:, 0].astype(int)]]
                app_boundaries.append(measure(item, boundary_pixels(trace['curves'], matrix, n), app_nodes))
                nodes = detect_nodes(prediction[1]*item['valid'], prior['selectedThresholds'][1])
                variants = {'legacy-trace': item['baselineNodes'], 'app-trace': app_nodes, 'cnn': nodes}
                for radius in [5, 9]:
                    variants[f'cnn-refined-{radius}'] = bounded_refinement(item['mask'], nodes, item['valid'], radius)
                for name, proposed in variants.items():
                    report['rows'][name].append({'id': item['id'], 'designId': item['designId'], 'split': item['split'],
                        'counts': point_counts(proposed, item['nodes']), 'predicted': proposed.tolist(), 'reference': item['nodes'].tolist()})
            print(start+len(batch), '/', len(selected), flush=True)
        report['metrics'] = {name: summarize(rows) for name, rows in report['rows'].items()}
        report['appBoundary'] = aggregate(app_boundaries)
        report['appBoundaryRows'] = app_boundaries
        choices = ['cnn', 'cnn-refined-5', 'cnn-refined-9']
        report['developmentSelected'] = max(choices, key=lambda name: report['metrics'][name]['development']['f1'])
        report['status'] = 'complete'; save()
        print(json.dumps({'metrics': report['metrics'], 'selected': report['developmentSelected']}), flush=True)
    except Exception as error:
        report['status'] = 'failed'; report['error'] = str(error); save(); raise


if __name__ == '__main__':
    started = time.perf_counter(); main(); print('Seconds', time.perf_counter()-started, flush=True)
