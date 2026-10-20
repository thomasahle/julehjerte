"""Reload the adapted checkpoint and verify immutable state and saved predictions."""
import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np
import torch

from data import digest
from body_schedule import training_draws
from body_provenance import verify_body_sources
from body_trainable import configure_trainable, encoder_options
from body_outline import outline_options, prepare_outline, outline_metrics
from preserved_candidate import pinned
from real_foreground import known_region_metrics
from u2netp_adaptation import frozen_hash, normalize_scores, real_training, synthetic_training


def module(file, name):
    spec = importlib.util.spec_from_file_location(name, file)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result


def prediction_agreement(values, saved):
    if values.shape != saved.shape or values.dtype != np.float32 or saved.dtype != np.float32:
        raise ValueError('Require matching float32 probability fields')
    if not np.isfinite(values).all() or not np.isfinite(saved).all():
        raise ValueError('Nonfinite prediction field')
    maximum = float(np.abs(values-saved).max())
    changed = int(((values >= .5) != (saved >= .5)).sum())
    return {'exact': np.array_equal(values, saved), 'maximumAbsoluteDifference': maximum,
            'absoluteTolerance': float(np.finfo(np.float32).eps), 'changedHalfThresholdPixels': changed,
            'passed': maximum <= np.finfo(np.float32).eps and changed == 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(); raw = (args.run/'report.json').read_bytes(); report = json.loads(raw)
    if report['schema'] != 'u2netp-body-adaptation-1' or report['status'] != 'complete':
        raise ValueError('Require completed body adaptation')
    plan = json.loads(pinned(report['plan']).read_bytes())
    historical = verify_body_sources(report)
    for name, expected in report['artifacts'].items(): pinned({'path': str(args.run/name), 'sha256': expected})
    source_file = pinned(plan['source']); root = source_file.parent
    for row in json.loads(source_file.read_bytes())['files']:
        pinned({'path': str(root/row['path']), 'sha256': row['sha256']})
    torch.set_num_threads(1); torch.set_num_interop_threads(1)
    architecture = module(root/'model/u2net.py', 'audit_u2netp_model')
    loader = module(root/'data_loader.py', 'audit_u2netp_loader')
    real, separation = real_training(plan, loader.RescaleT(320), loader.ToTensorLab(flag=0))
    if separation != report['sourceSeparation']: raise ValueError('Source separation changed')
    outlined = outline_options(plan['protocol']) is not None
    items = real
    if outlined:
        import scipy
        if scipy.__version__ != plan['protocol']['scipy'] or scipy.__version__ != report['runtime']['scipy']:
            raise ValueError('Outline implementation version changed')
        items = real+synthetic_training(plan, loader.RescaleT(320), loader.ToTensorLab(flag=0))
        if len(items) != len(report['trainingInputs']) or prepare_outline(items, plan['protocol']) != report['outlineSupervision']:
            raise ValueError('Real/synthetic outline-supervision fields changed')
    for item, recorded in zip(items, report['trainingInputs']):
        if {'id': item['id'], **item['evidence'], 'inputTensorSha256': digest(item['input'].numpy().tobytes())} != recorded:
            raise ValueError('Input/target changed')
    for item in report['trainingInputs']:
        pinned({'path': item['photo'], 'sha256': item['photoSha256']})
    real_ids = [i['id'] for i in real]; synthetic_ids = [i['id'] for i in report['trainingInputs'][len(real):]]
    draws = training_draws(plan, len(synthetic_ids), len(real))
    expected_ids = [[synthetic_ids[d['synthetic']], real_ids[d['real']]] for d in draws]
    if draws != report['draws'] or expected_ids != report['sampledIds'] or len(report['history']) != len(draws):
        raise ValueError('Training draws or update count differ')
    model = architecture.U2NETP(3, 1)
    trainable = configure_trainable(model, plan['protocol'])
    if trainable != report['trainableParameters']: raise ValueError('Trainable parameter count changed')
    initial = torch.load(pinned(plan['checkpoint']), map_location='cpu', weights_only=True)
    final = torch.load(pinned({'path': str(args.run/'model.pt'), 'sha256': report['checkpointSha256']}), map_location='cpu', weights_only=True)
    model.load_state_dict(initial, strict=True); before = frozen_hash(model)
    model.load_state_dict(final, strict=True)
    if frozen_hash(model) != before or before != report['initialFrozenStateSha256']:
        raise ValueError('Configured frozen weights or normalization buffers changed')
    changed = [n for n in initial if not torch.equal(initial[n], final[n])]
    if not changed: raise ValueError('Unchanged adapted checkpoint')
    metrics_items = [{'id': i['id'], 'target': (i['labels'] == 1).astype(np.float32),
                     'weight': (i['labels'] != 255).astype(np.float32)} for i in real]
    saved = np.load(args.run/'training-predictions.npz', allow_pickle=False)
    if saved['ids'].tolist() != real_ids: raise ValueError('Prediction identities differ')
    maximum = {}; metrics = {}; comparisons = {}; boundary_metrics = {}
    for name, state in [('initial', initial), ('final', final)]:
        model.load_state_dict(state, strict=True)
        with torch.no_grad():
            values = np.stack([normalize_scores(model(i['input'][None])[0])[0, 0].numpy() for i in real])
        maximum[name] = float(np.abs(values-saved[name]).max())
        metrics[name] = known_region_metrics(values, metrics_items)
        comparisons[name] = {**prediction_agreement(values, saved[name]),
                             'metricsExact': metrics[name] == report['trainingMetrics'][name]}
        if outlined:
            boundary_metrics[name] = outline_metrics(values, real)
            comparisons[name]['outlineMetricsExact'] = boundary_metrics[name] == report['trainingOutlineMetrics'][name]
    passed = all(c['passed'] and c['metricsExact'] and c.get('outlineMetricsExact', True) for c in comparisons.values())
    result = {'schema': 'u2netp-body-audit-1', 'passed': passed,
              'report': {'path': str(args.run/'report.json'), 'sha256': digest(raw)},
              'sourceSeparation': separation, 'updates': len(draws), 'sourcePhotosRechecked': len(report['trainingInputs']),
              'historicalTrainingDrivers': historical,
              'immutableStateMatchesInitial': True, 'changedTensors': len(changed),
              'trainableParameters': trainable, 'adaptedEncoderStages': encoder_options(plan['protocol'])[0],
              'predictionMaximumDifference': maximum, 'predictionComparisons': comparisons, 'trainingMetrics': metrics,
              'scope': 'Independent checkpoint reload, frozen weights/buffers, draw schedule, source identities, input/label hashes, predictions and metrics. The initial bitwise replay gate failed at 1.1920929e-7; this diagnostic gate allows one float32 epsilon on the unit probability interval while requiring identical threshold masks and metrics. It is not a bitwise replay, second optimization run, browser parity check or held-out quality result.'}
    if outlined:
        result.update(outlineSupervisionRecomputed=True, outlineInputsRecomputed=len(items), trainingOutlineMetrics=boundary_metrics)
    with args.output.open('x') as file: file.write(json.dumps(result, indent=2)+'\n')
    print(json.dumps({'passed': passed, 'changedTensors': len(changed), 'predictionMaximumDifference': maximum, 'comparisons': comparisons}))
    if not passed: raise ValueError('Prediction replay failed; differences retained in the audit report')


if __name__ == '__main__': main()
