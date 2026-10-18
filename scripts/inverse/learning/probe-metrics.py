"""Score frozen neural proposals on single-factor photographic interventions."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion
import torch

from data import checked_asset, digest, observable_nodes, detect_nodes, point_counts, scores
from model import ProposalNet


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--solves', required=True)
    parser.add_argument('--run', default='tmp/heart-learning/balanced-corners-v1')
    parser.add_argument('--output', required=True)
    parser.add_argument('--device', choices=['cpu', 'mps', 'cuda'], default='mps')
    args = parser.parse_args()
    solves_root = Path(args.solves)
    solves = json.loads((solves_root/'report.json').read_text())
    probe_root = Path(solves['probe']); probe_bytes = (probe_root/'manifest.json').read_bytes(); probe = json.loads(probe_bytes)
    run = Path(args.run); prior = json.loads((run/'report.json').read_text())
    if solves['status'] != 'complete' or probe['status'] != 'complete' or prior['status'] != 'complete':
        raise ValueError('Require completed input artifacts')
    if digest(probe_bytes) != solves['probeManifestSha256'] or digest((run/'model.pt').read_bytes()) != prior['checkpointSha256']:
        raise ValueError('Changed probe or checkpoint')
    if prior['sourceHashes']['model.py'] != digest(Path(__file__).with_name('model.py').read_bytes()):
        raise ValueError('Changed model implementation')
    solve_rows = {r['id']: r for r in solves['rows']}
    if len(solve_rows) != len(solves['rows']) or set(solve_rows) != {r['id'] for r in probe['rows']}:
        raise ValueError('Solver report omitted or duplicated views')
    designs = {d['id']: d for d in probe['designs']}
    output = Path(args.output); output.mkdir(parents=True, exist_ok=False)
    report = {'schema': 'heart-intervention-junctions-1', 'status': 'running', 'arguments': vars(args),
              'scope': 'Post-hoc controlled interventions on selected synthetic failures; no retraining or threshold tuning.',
              'solvesReportSha256': digest((solves_root/'report.json').read_bytes()),
              'probeManifestSha256': digest(probe_bytes), 'trainingReportSha256': digest((run/'report.json').read_bytes()),
              'checkpointSha256': prior['checkpointSha256'], 'threshold': prior['selectedThresholds'][1],
              'sourceHashes': {p.name: digest(p.read_bytes()) for p in Path(__file__).parent.glob('*.py')}, 'rows': []}
    def save(): (output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    torch.set_num_threads(2); torch.set_num_interop_threads(1); device = torch.device(args.device)
    model = ProposalNet('random').to(device)
    model.load_state_dict(torch.load(run/'model.pt', map_location=device, weights_only=True)); model.eval()
    save()
    try:
        for row in probe['rows']:
            entry = {'id': row['id'], 'sourceViewId': row['sourceViewId'], 'variant': row['variant']}
            report['rows'].append(entry)
            solve = solve_rows[row['id']]
            if 'mask.png' not in solve['assets']:
                entry['error'] = 'Production preprocessing produced no mask'; save(); continue
            rgb = np.asarray(Image.open(checked_asset(probe_root, row['assets']['crop.png'])).convert('RGB')).copy()
            mask = np.asarray(Image.open(checked_asset(solves_root, solve['assets']['mask.png'])).convert('L')).copy()/255
            n = len(mask)
            if rgb.shape != (n, n, 3): raise ValueError('Changed mask or photo dimensions')
            labels = json.loads(checked_asset(probe_root, row['assets']['labels.json']).read_text())
            if labels['resolution'] != n: raise ValueError('Label projection resolution differs')
            graph = json.loads(checked_asset(probe_root, designs[row['designId']]['assets']['graph.json']).read_text())
            matrix = np.asarray(labels['canonicalToCrop']).reshape(3, 3)
            nodes = observable_nodes([e['cubic'] for e in graph['edges'] if e['visible']], matrix)
            valid = binary_erosion(np.asarray(Image.open(checked_asset(probe_root, row['assets']['crop-overlap-valid.png'])).convert('L')) > 127, iterations=2)
            nodes = nodes[(nodes >= 0).all(1) & (nodes < n).all(1)]
            if len(nodes): nodes = nodes[valid[nodes[:, 1].astype(int), nodes[:, 0].astype(int)]]
            rgb_tensor = torch.from_numpy(np.ascontiguousarray(rgb.transpose(2, 0, 1)[None])).to(device, dtype=torch.float32)/255
            mask_tensor = torch.from_numpy(mask[None, None].astype(np.float32)).to(device)
            with torch.no_grad(): heat = torch.sigmoid(model(rgb_tensor, mask_tensor))[0, 1].cpu().numpy().astype(np.float16)
            predicted = detect_nodes(heat*valid, prior['selectedThresholds'][1])
            trace = json.loads(checked_asset(solves_root, solve['assets']['trace.json']).read_text())
            app_nodes = observable_nodes(trace['curves'], np.diag([n/trace['width'], n/trace['width'], 1]))
            app_nodes = app_nodes[(app_nodes >= 0).all(1) & (app_nodes < n).all(1)]
            if len(app_nodes): app_nodes = app_nodes[valid[app_nodes[:, 1].astype(int), app_nodes[:, 0].astype(int)]]
            entry.update({'counts': point_counts(predicted, nodes), 'appCounts': point_counts(app_nodes, nodes),
                          'predicted': predicted.tolist(), 'appPredicted': app_nodes.tolist(), 'reference': nodes.tolist()})
            save()
        variants = sorted({r['variant'] for r in report['rows']})
        report['metrics'] = {}
        for variant in variants:
            subset = [r for r in report['rows'] if r['variant'] == variant]
            successful = [r for r in subset if 'counts' in r]
            report['metrics'][variant] = {'views': len(subset), 'failures': len(subset)-len(successful),
                **{name: scores([sum(r[key][i] for r in successful) for i in range(3)]) for name, key in [('cnn', 'counts'), ('app', 'appCounts')]}}
        report['status'] = 'complete'; save(); print(json.dumps(report['metrics']))
    except Exception as error: report['status'] = 'failed'; report['error'] = str(error); save(); raise


if __name__ == '__main__': main()
