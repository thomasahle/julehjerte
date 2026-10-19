"""Replay a fixed candidate's provenance, immutable state and saved predictions.

This audit uses no evaluation photographs. Its scores remain training diagnostics.
"""
import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np
import torch

from data import digest
from material_pilot import material_replay
from material_prints import load_printed_replay
from preserved_candidate import initial_candidate, load_candidate, pinned, source_separation
from real_materials_learning import load_material_labels


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    torch.set_num_threads(1); torch.set_num_interop_threads(1)
    model, foreground, report = load_candidate(args.candidate)
    plan = json.loads(pinned(report['plan']).read_bytes())
    paths = {k: pinned(plan[k]) for k in ['sourceManifest', 'annotations', 'labelCatalog', 'evaluation']}
    labels = json.loads(paths['labelCatalog'].read_bytes())
    separation = source_separation(labels['instances'], json.loads(paths['evaluation'].read_bytes())['photos'],
                                   json.loads(paths['sourceManifest'].read_bytes()))
    assert separation == report['sourceSeparation']
    items, audit = load_material_labels(paths['labelCatalog'].parent, paths['sourceManifest'], paths['annotations'])
    assert audit == report['labelAudit'] and [i['id'] for i in items] == plan['trainIds']
    initial, _, parent = initial_candidate(plan)
    trainable = {name for name, parameter in model.named_parameters() if parameter.requires_grad}
    immutable = 0; changed = []
    for name, expected in initial.state_dict().items():
        actual = model.state_dict()[name]
        if name not in trainable:
            assert torch.equal(actual, expected), name
            immutable += 1
        elif not torch.equal(actual, expected):
            changed.append(name)
    assert changed and all(n.startswith(('material_tail.', 'material_decoder.')) for n in changed)
    protocol = plan['protocol']
    synthetic, replay = material_replay(parent, protocol['syntheticReplayGeometries'])
    printed, print_audit = load_printed_replay(synthetic, protocol['printedReplay'])
    assert replay == report['syntheticReplay'] and print_audit == report['printedReplay']
    # Reconstruct the schedule and selected IDs without calling the training sampler.
    rng = np.random.default_rng(protocol['seed'])
    draws = [{'synthetic': rng.integers(len(synthetic), size=4).tolist(),
              'realQuantiles': rng.random(2).tolist(), 'flips': (rng.random(2) < .5).tolist()}
             for _ in range(protocol['updates'])]
    choices = np.random.default_rng(protocol['seed'] ^ 0x510e527f).integers(6, size=(protocol['updates'], 4))
    prints = np.where(choices < 3, choices, -1).tolist()
    assert draws == report['draws'] and prints == report['printDraws']
    samples = []
    for draw, variants in zip(draws, prints):
        selected = [synthetic[j]['id'] for j in draw['synthetic'][:2]]
        selected += [items[min(len(items)-1, int(q*len(items)))]['id'] for q in draw['realQuantiles']]
        samples.append([printed[i][v]['id'] if v >= 0 and i in printed else i for i, v in zip(selected, variants)])
    assert samples == report['sampledIds'] and len(report['history']) == report['updates'] == protocol['updates']
    assert np.isfinite(report['history']).all()
    # Reuse the existing separate confusion-accounting implementation, not training metrics.
    metric_file = Path(__file__).with_name('audit-material-pilot.py')
    spec = importlib.util.spec_from_file_location('material_audit', metric_file)
    metrics = importlib.util.module_from_spec(spec); spec.loader.exec_module(metrics)
    probabilities = metrics.infer(model, items)
    original = metrics.infer(foreground, items)
    assert np.array_equal(probabilities[:, :1], original)
    archived = pinned({'path': str(args.candidate/'training-predictions.npz'), 'sha256': report['predictionsSha256']})
    with np.load(archived) as saved:
        assert saved['ids'].tolist() == plan['trainIds']
        np.testing.assert_array_equal(probabilities, saved['probabilities'])
    score = metrics.independent_metrics(probabilities, items)
    metrics.confirm_metrics(score, report['trainingMetrics'])
    size = sum(p.stat().st_size for p in args.candidate.rglob('*') if p.is_file())
    assert size <= plan['resources']['maxArtifactMiB']*1024**2
    result = {'schema': 'preserved-material-candidate-audit-1', 'status': 'complete', 'passed': True,
              'candidateReport': {'path': str(args.candidate/'report.json'), 'sha256': digest((args.candidate/'report.json').read_bytes())},
              'checkpointSha256': report['checkpointSha256'], 'sourceSeparation': separation,
              'immutableTensorsChecked': immutable, 'changedTrainableTensors': len(changed),
              'updatesVerified': len(samples), 'savedPredictionsExact': True, 'foregroundPredictionsExact': True,
              'trainingMetrics': score['macroMean'], 'candidateArtifactBytes': size,
              'sourceHashes': {str(p): digest(p.read_bytes()) for p in [Path(__file__), metric_file]},
              'scope': 'Independent saved-checkpoint and sampling audit. Metrics are in-sample partial-label diagnostics; no held-out photo or deployment claim.'}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x') as output: output.write(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__': main()
