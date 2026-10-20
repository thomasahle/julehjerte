"""Compare frozen joint/residual classifiers on every fixed real-photo crop."""
import argparse
import json
import shutil
import subprocess
import time
from pathlib import Path

import numpy as np
import torch

from exemplar_experiment import FrozenFeatures, development_evaluation, reference
from exemplar_projection import ExemplarProjection
from preserved_candidate import pinned
from u2netp_adaptation import frozen_hash
from u2netp_material_candidate import load_material_candidate, module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_bytes())
    assert plan['schema'] == 'context-residual-real-plan-1' and not args.output.exists()
    plan['_reference'] = reference(args.plan)
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    p = plan['protocol']
    wrapper, training_plan, _, parent_reference = load_material_candidate(
        pinned(plan['trainingParent']).parent)
    assert parent_reference == plan['trainingParent']
    body = wrapper.body.eval()
    for parameter in body.parameters():
        parameter.requires_grad_(False)
    body_hash = frozen_hash(body)
    loader = module(Path(training_plan['source']['path']).parent/'data_loader.py', 'residual_real_loader')
    rescale, normalize = loader.RescaleT(320), loader.ToTensorLab(flag=0)
    controls = json.loads(pinned(plan['controlReport']).read_bytes())
    assert controls['status'] == 'complete' and controls['initialBodySha256'] == body_hash
    previous = {r['id']: r for r in controls['rows'] if r['cohort'] == 'development'}
    assert list(previous) == plan['expectedDevelopmentCases']
    models, expected, residual_methods = {}, {}, []
    for name, checkpoint in plan['models'].items():
        model = ExemplarProjection(p['contextChannels'], p['projectionChannels']).eval()
        model.load_state_dict(torch.load(pinned(checkpoint), map_location='cpu', weights_only=True))
        for parameter in model.parameters():
            parameter.requires_grad_(False)
        models[name+'-joint'] = models[name+'-residual'] = model
        residual_methods.append(name+'-residual')
        expected[name+'-joint'] = {i: r['masks'][name] for i, r in previous.items() if r.get('masks')}
    features = FrozenFeatures(body, p)
    args.output.mkdir(parents=True)
    started = time.monotonic()
    report = {
        'schema': 'context-residual-real-results-1', 'status': 'running',
        'plan': reference(args.plan), 'scope': plan['scope'], 'models': plan['models'],
        'bodySha256': body_hash, 'sourceCommit': subprocess.check_output(
            ['git', 'rev-parse', 'HEAD'], text=True).strip(),
        'sourceHashes': {n: reference(Path(__file__).with_name(n))['sha256'] for n in [
            'probe-context-residual-real.py', 'exemplar_projection.py', 'exemplar_experiment.py',
            'paper_exemplars.py', 'probe-paper-exemplars.py', 'probe-native-exemplars.py',
            'u2netp_adaptation.py', 'u2netp_material_candidate.py']},
        'rows': [],
    }

    def save():
        assert frozen_hash(body) == body_hash
        assert shutil.disk_usage('.').free >= plan['resources']['minimumFreeGiB']*1024**3
        assert time.monotonic()-started < plan['resources']['maximumWallSeconds']
        assert sum(f.stat().st_size for f in args.output.rglob('*') if f.is_file()) < (
            plan['resources']['maximumArtifactMiB']*1024**2)
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')

    save()
    try:
        result = development_evaluation(plan, args.output, models, features, rescale, normalize,
                                        report['sourceHashes'], save, expected, residual_methods)
        report.update(result)
        for row in report['rows']:
            if row['status'] != 'complete':
                continue
            row['jointResidualDifference'] = {}
            for name in plan['models']:
                a, b = [np.frombuffer(pinned(row['masks'][name+'-'+head]).read_bytes(), np.uint8)
                        for head in ['joint', 'residual']]
                # Both masks use the same phase and set unobserved pixels false.
                row['jointResidualDifference'][name] = {
                    'changedPixels': int((a != b).sum()), 'totalPixels': int(a.size)}
        report.update(status='complete', frozenBodyExact=True, seconds=time.monotonic()-started)
    except Exception as error:
        report.update(status='failed', error=repr(error))
        raise
    finally:
        features.close()
        save()
    print(json.dumps({'status': report['status'], 'seconds': report['seconds'],
                      'complete': sum(r['status'] == 'complete' for r in report['rows']),
                      'unresolved': sum(r['status'] == 'crop-unresolved' for r in report['rows']),
                      'exactJointReplays': sum(len(r.get('exactReplays', {})) for r in report['rows'])}))


if __name__ == '__main__':
    main()
