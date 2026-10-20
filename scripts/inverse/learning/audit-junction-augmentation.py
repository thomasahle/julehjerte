"""Independently check saved corner assignments and matched training conditions."""
import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np
import torch

from data import scores
from junction_augmentation import pinned, reference, schedule
from localization import aggregate

helper_file = Path(__file__).with_name('audit-junction-phase-average.py')
spec = importlib.util.spec_from_file_location('previous_audit', helper_file)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    report_file = args.run/'report.json'
    report = json.loads(report_file.read_text())
    assert report['schema'] == 'junction-augmentation-evaluation-1' and report['status'] == 'complete'
    plan = json.loads(pinned(report['plan']).read_text())
    baseline = json.loads(pinned(plan['baseline']).read_text())
    real = json.loads(pinned(plan['real']).read_text())
    training = json.loads(pinned(report['training']).read_text())
    train_plan = json.loads(pinned(training['plan']).read_text())
    original_training = json.loads(pinned(train_plan['training']).read_text())
    for ref in report['sources']+training['sources']:
        pinned(ref)
    initial = torch.load(pinned(train_plan['checkpoint']), map_location='cpu', weights_only=True)
    checkpoints = []
    for arm in training['arms']:
        state = torch.load(pinned(arm['checkpoint']), map_location='cpu', weights_only=True)
        assert set(state) == set(initial)
        buffers = [k for k in state if k.endswith(('running_mean', 'running_var', 'num_batches_tracked'))]
        assert len(buffers) == arm['frozenBatchNormBuffers']
        assert all(torch.equal(state[k], initial[k]) for k in buffers)
        assert all(torch.isfinite(v).all() for v in state.values())
        changed = sum(not torch.equal(v, initial[k]) for k, v in state.items())
        assert changed == arm['changedParameterTensors'] and changed > 0
        assert len(arm['updates']) == 128 and [u['step'] for u in arm['updates']] == list(range(1, 129))
        assert all(np.isfinite(u[k]) for u in arm['updates'] for k in ['loss', 'gradientNormBeforeClip'])
        checkpoints.append({'id': arm['id'], 'unchangedBatchNormBuffers': len(buffers), 'changedParameters': changed})
    from data import Corpus, training_supplements
    corpora = [Corpus(pinned(ref).parent) for ref in train_plan['preparedParents']]
    base = corpora[0]
    original_ids = [r['id'] for r in base.rows if base.split[base.views[r['id']]['designId']] == 'train']
    for extra in training_supplements(base, corpora[1:]):
        original_ids += [r['id'] for r in extra['rows']]
    printed = json.loads(pinned(train_plan['printed']).read_text())
    replay = schedule(sorted(original_ids), [r['id'] for r in printed['rows']], 128, train_plan['protocol']['seed'])
    assert replay == training['schedule']
    assert set(r['designId'] for r in training['inputValidation']) <= set(original_training['splits']['train']['designs'])
    assert helper.corner_counts([[1, 1], [1, 1]], [[1, 1]]) == [1, 2, 1]
    previous = {r['id']: r for r in baseline['rows']}
    assert [r['id'] for r in report['rows']] == [r['id'] for r in plan['expectedEvaluation']]
    checked = 0
    for row in report['rows']:
        with np.load(pinned(row['predictions'])) as data, np.load(pinned(previous[row['id']]['predictions'])) as old:
            for key in ['valid', 'reference_boundary', 'reference_nodes']:
                assert np.array_equal(data[key], old[key])
            valid = np.unpackbits(data['valid']).reshape(384, 384).astype(bool)
            for arm in plan['arms']:
                for readout in plan['readouts']:
                    prefix = arm+'_'+readout
                    metric = row['arms'][arm]['readouts'][readout]
                    boundary = np.unpackbits(data[prefix+'_boundary']).reshape(384, 384).astype(bool)
                    assert not (boundary & ~valid).any()
                    assert int(boundary.sum()) == metric['rawBoundaryPixels']
                    for field, label in [('nodes', 'junctions'), ('refined', 'refinedJunctions')]:
                        points = data[prefix+'_'+field]
                        assert points.ndim == 2 and points.shape[1] == 2 and np.isfinite(points).all()
                        assert (points >= 0).all() and (points < 384).all()
                        if len(points):
                            assert valid[points[:, 1].astype(int), points[:, 0].astype(int)].all()
                        assert scores(helper.corner_counts(points, data['reference_nodes'])) == metric[label]
                        checked += 1
                for kind in ['nodes', 'refined']:
                    counts = helper.corner_counts(data[arm+'_original_'+kind], data[arm+'_exchanged_'+kind])
                    assert scores(counts) == row['arms'][arm]['phaseAgreement'][kind]
    for arm in plan['arms']:
        for readout in plan['readouts']:
            rows = [r['arms'][arm]['readouts'][readout] for r in report['rows']]
            assert aggregate(rows) == report['summary'][arm][readout]['raw']
            assert aggregate([{**r, 'junctions': r['refinedJunctions']} for r in rows]) == report['summary'][arm][readout]['refined']
    real_checks = 0
    assert len(report['realRows']) == len(real['rows']) == 32
    for row, original in zip(report['realRows'], real['rows']):
        assert row['id'] == original['id'] and row['status'] == original['status']
        if row['status'] == 'crop-unresolved':
            continue
        with np.load(pinned(row['predictions'])) as data:
            for arm in plan['arms']:
                for kind in ['nodes', 'refined']:
                    counts = helper.corner_counts(data[arm+'_original_'+kind], data[arm+'_exchanged_'+kind])
                    assert scores(counts) == row['arms'][arm]['phaseAgreement'][kind]
                    real_checks += 1
    result = {'schema': 'junction-augmentation-audit-1', 'status': 'complete',
              'run': reference(report_file), 'source': reference(Path(__file__)), 'matchingImplementation': reference(helper_file),
              'terminalCheckpointChecks': checkpoints, 'trainingScheduleReplayed': True,
              'allSyntheticReferenceArraysUnchanged': True, 'syntheticViews': len(report['rows']),
              'independentCornerAssignments': checked, 'realRows': len(report['realRows']),
              'independentRealPhaseAssignments': real_checks, 'duplicateProposalNegativeControlPassed': True,
              'scope': 'Independent maximum-flow corner matching against the evaluation Hungarian scorer, all raw/refined/readout pairs. Reference/validity arrays, training schedule, BN buffers and summaries checked. Does not repeat model inference or independently score photographic accuracy.'}
    with args.output.open('x') as file:
        file.write(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
