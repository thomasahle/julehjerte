"""Check whether residual context preserves the printed-paper benefit."""
import argparse
import json
import shutil
import time
from pathlib import Path

import numpy as np
from PIL import Image
import torch

from data import digest
from exemplar_experiment import FrozenFeatures, display, measurement, prepare_case, reference
from exemplar_projection import ExemplarProjection
from preserved_candidate import pinned
from u2netp_adaptation import frozen_hash
from u2netp_material_candidate import load_material_candidate, module
from u2netp_material_training import material_training


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_bytes())
    assert plan['schema'] == 'context-residual-transfer-plan-1' and not args.output.exists()
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    p = plan['protocol']
    wrapper, training_plan, training, parent_reference = load_material_candidate(
        pinned(plan['trainingParent']).parent)
    assert parent_reference == plan['trainingParent']
    body = wrapper.body.eval()
    for parameter in body.parameters():
        parameter.requires_grad_(False)
    body_hash = frozen_hash(body)
    loader = module(Path(training_plan['source']['path']).parent/'data_loader.py', 'residual_transfer_loader')
    rescale, normalize = loader.RescaleT(320), loader.ToTensorLab(flag=0)
    real, synthetic, separation = material_training(training_plan, rescale, normalize)
    evidence = [{'id': item['id'], **item['evidence'],
                 'inputTensorSha256': digest(item['input'].numpy().tobytes())} for item in real+synthetic]
    assert evidence == training['trainingInputs'] and len(synthetic) == 96
    del real
    prior = {r['id']: r for r in json.loads(pinned(plan['geometrySource']).read_bytes())['rows']}
    control = json.loads(pinned(plan['controlReport']).read_bytes())
    controls = {r['id']: r for r in control['rows'] if r['cohort'] == 'synthetic'}
    chosen = {i for page in control['gallery']['synthetic'] for i in page['ids']}
    models = {}
    for name, checkpoint in plan['models'].items():
        model = ExemplarProjection(p['contextChannels'], p['projectionChannels']).eval()
        model.load_state_dict(torch.load(pinned(checkpoint), map_location='cpu', weights_only=True))
        for parameter in model.parameters():
            parameter.requires_grad_(False)
        models[name] = model
    features = FrozenFeatures(body, p)
    args.output.mkdir(parents=True)
    started = time.monotonic()
    report = {'schema': 'context-residual-transfer-results-1', 'status': 'running',
              'plan': reference(args.plan), 'scope': plan['scope'], 'models': plan['models'],
              'bodySha256': body_hash, 'sourceSeparation': separation, 'inputEvidence': evidence,
              'sourceHashes': {n: reference(Path(__file__).with_name(n))['sha256'] for n in [
                  'probe-context-residual-transfer.py', 'exemplar_projection.py', 'exemplar_experiment.py',
                  'u2netp_material_training.py', 'paper_exemplars.py', 'probe-material-synthetic.py']},
              'rows': []}
    panels = []

    def save():
        assert frozen_hash(body) == body_hash
        assert shutil.disk_usage('.').free >= plan['resources']['minimumFreeGiB']*1024**3
        assert time.monotonic()-started < plan['resources']['maximumWallSeconds']
        assert sum(f.stat().st_size for f in args.output.rglob('*') if f.is_file()) < (
            plan['resources']['maximumArtifactMiB']*1024**2)
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')

    save()
    try:
        for index, item in enumerate(synthetic):
            identity = item['id']
            labels = json.loads(pinned(prior[identity]['geometry']).read_bytes())
            matrix = np.asarray(labels['canonicalToPhoto']).reshape(3, 3)@np.diag([100, 100, 1])
            photo, rgb, indices, count, region = prepare_case({'item': item, 'matrix': matrix}, p)
            valid = region & (item['materials'] != 255)
            row = {'id': identity, 'kind': item['evidence']['kind'], 'metrics': {}, 'boundaries': {},
                   'exactJointReplays': {}, 'status': 'running'}
            report['rows'].append(row)
            masks = {'valid': valid.astype(np.uint8)}
            tiles = [('Photo', Image.fromarray(photo)),
                     ('Known overlap', display.colour_mask(item['materials'] >= .5, valid))]
            with torch.no_grad():
                frozen = features(item)
                for name, model in models.items():
                    for residual in [False, True]:
                        method = name+('-residual' if residual else '-joint')
                        field = model(rgb, frozen, indices, count, residual=residual).sigmoid().numpy()
                        metrics, bounds = measurement(item, field, region)
                        row['metrics'][method] = metrics
                        row['boundaries'][method] = bounds
                        masks[method] = (field >= .5).astype(np.uint8)
                        if not residual:
                            with np.load(pinned(controls[identity]['masks'][name])) as stored:
                                assert np.array_equal(stored['mask'], masks[method])
                            assert metrics == controls[identity]['metrics'][name]
                            row['exactJointReplays'][name] = True
                        tiles.append((f"{method}: {metrics['materialPixelError']*100:.2f}%",
                                      display.colour_mask((field >= .5) ^ bool(metrics['materialPhaseExchanged']), valid)))
            file = args.output/f'masks-{index:03}.npz'
            np.savez_compressed(file, **masks)
            row.update(status='complete', masks=reference(file))
            worse = max(row['metrics'][name+'-residual']['materialPixelError']-
                        row['metrics'][name+'-joint']['materialPixelError'] for name in models)
            if identity in chosen or worse > .01:
                panels.append({'id': identity, 'panels': tiles})
            if (index+1) % 16 == 0:
                save()
                print(json.dumps({'cases': index+1, 'seconds': time.monotonic()-started}), flush=True)
        report['summary'] = {}
        for kind in sorted({r['kind'] for r in report['rows']}):
            rows = [r for r in report['rows'] if r['kind'] == kind]
            report['summary'][kind] = {method: float(np.mean([r['metrics'][method]['materialPixelError'] for r in rows]))
                                       for method in rows[0]['metrics']}
        report['gallery'] = display.gallery(panels, args.output, 'transfer', 192)
        report.update(status='complete', frozenBodyExact=True, seconds=time.monotonic()-started)
    except Exception as error:
        report.update(status='failed', error=repr(error))
        raise
    finally:
        features.close()
        save()
    print(json.dumps(report['summary']), flush=True)


if __name__ == '__main__':
    main()
