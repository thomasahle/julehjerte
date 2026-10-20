"""Matched joint/residual continuation through the same exposed-paper fit."""
import argparse
import copy
import json
import shutil
import subprocess
import time
from pathlib import Path

import numpy as np
from PIL import Image
import torch

from data import digest
from exemplar_experiment import (
    FrozenFeatures, development_evaluation, display, measurement, prepare_case, reference,
)
from exemplar_projection import ExemplarProjection, overlap_loss
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
    assert plan['schema'] == 'context-residual-training-plan-1' and not args.output.exists()
    plan['_reference'] = reference(args.plan)
    p = plan['protocol']
    assert (p['resolution'], p['contextResolution'], p['updates']) == (320, 160, 96)
    assert p['ridgeRegularization'] == .1 and p['epochs'] == 1
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    torch.manual_seed(p['seed'])
    started = time.monotonic()
    wrapper, training_plan, training, parent_reference = load_material_candidate(
        pinned(plan['trainingParent']).parent)
    assert parent_reference == plan['trainingParent']
    body = wrapper.body.eval()
    for parameter in body.parameters():
        parameter.requires_grad_(False)
    body_hash = frozen_hash(body)
    loader = module(Path(training_plan['source']['path']).parent/'data_loader.py', 'residual_training_loader')
    rescale, normalize = loader.RescaleT(320), loader.ToTensorLab(flag=0)
    real, synthetic, separation = material_training(training_plan, rescale, normalize)
    evidence = [{'id': item['id'], **item['evidence'],
                 'inputTensorSha256': digest(item['input'].numpy().tobytes())} for item in real+synthetic]
    assert evidence == training['trainingInputs'] and len(synthetic) == 96
    del real
    prior = {r['id']: r for r in json.loads(pinned(plan['exemplar']).read_bytes())['rows']}
    control = json.loads(pinned(plan['controlTraining']).read_bytes())
    transfer = {r['id']: r for r in json.loads(pinned(plan['controlSynthetic']).read_bytes())['rows']}
    development = json.loads(pinned(plan['controlDevelopment']).read_bytes())
    assert control['status'] == development['status'] == 'complete'
    assert control['initialCheckpoint'] == plan['initialCheckpoint']
    assert control['initialBodySha256'] == development['bodySha256'] == body_hash
    cases = []
    for item in synthetic:
        labels = json.loads(pinned(prior[item['id']]['geometry']).read_bytes())
        matrix = np.asarray(labels['canonicalToPhoto']).reshape(3, 3)@np.diag([100, 100, 1])
        cases.append({'item': item, 'matrix': matrix})
    draws = np.random.default_rng(p['seed']).permutation(len(cases)).tolist()
    assert [cases[i]['item']['id'] for i in draws] == control['syntheticDraws']
    parent = ExemplarProjection(p['contextChannels'], p['projectionChannels'])
    parent.load_state_dict(torch.load(pinned(plan['initialCheckpoint']), map_location='cpu', weights_only=True))
    models = {name: copy.deepcopy(parent) for name in ['joint', 'residual']}
    optimizers = {name: torch.optim.AdamW(model.parameters(), lr=p['learningRate'], weight_decay=p['weightDecay'])
                  for name, model in models.items()}
    features = FrozenFeatures(body, p)
    args.output.mkdir(parents=True)
    report = {
        'schema': 'context-residual-training-results-1', 'status': 'training',
        'plan': reference(args.plan), 'scope': plan['scope'], 'bodySha256': body_hash,
        'initialCheckpoint': plan['initialCheckpoint'], 'sourceSeparation': separation,
        'trainingInputs': evidence, 'draws': control['syntheticDraws'],
        'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
        'sourceHashes': {n: reference(Path(__file__).with_name(n))['sha256'] for n in [
            'train-context-residual.py', 'exemplar_projection.py', 'exemplar_experiment.py',
            'u2netp_material_training.py', 'u2netp_material_candidate.py', 'u2netp_adaptation.py',
            'paper_exemplars.py', 'material_boundary_loss.py', 'probe-material-synthetic.py']},
        'history': [], 'rows': [], 'gallery': {}, 'checkpoints': {},
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
        for step, index in enumerate(draws, 1):
            case = cases[index]
            _, rgb, indices, count, region = prepare_case(case, p)
            target = torch.from_numpy(np.where(region, case['item']['materials'], 255))
            frozen = features(case['item'])
            record = {'step': step, 'id': case['item']['id'], 'arms': {}}
            for name, model in models.items():
                optimizer = optimizers[name]
                optimizer.zero_grad(set_to_none=True)
                score = model(rgb, frozen, indices, count, residual=name == 'residual')
                loss = overlap_loss(score, target, p['boundaryFactor'], p['boundaryRadius'], p['lossTemperature'])
                assert torch.isfinite(loss)
                loss.backward()
                norm = torch.nn.utils.clip_grad_norm_(model.parameters(), p['maximumGradientNorm'])
                assert torch.isfinite(norm) and norm > 0
                optimizer.step()
                record['arms'][name] = {'loss': float(loss.detach()), 'gradientNorm': float(norm)}
                if name == 'joint':
                    old = control['history'][step-1]['arms']['synthetic-control']
                    assert float(loss.detach()) == old['syntheticLoss'], 'Joint training loss replay'
                    assert float(norm) == old['gradientNorm'], 'Joint training gradient replay'
            report['history'].append(record)
            if step % 16 == 0:
                save()
                print(json.dumps({'step': step, 'seconds': time.monotonic()-started}), flush=True)
        expected = torch.load(pinned(plan['controlCheckpoint']), map_location='cpu', weights_only=True)
        assert all(torch.equal(value, expected[key]) for key, value in models['joint'].state_dict().items())
        report['jointControlWeightsExact'] = True
        for name, model in models.items():
            model.eval()
            for parameter in model.parameters():
                parameter.requires_grad_(False)
            file = args.output/(name+'.pt')
            torch.save(model.state_dict(), file)
            report['checkpoints'][name] = reference(file)
        arms = {training+'-trained-'+head: model for training, model in models.items()
                for head in ['joint', 'residual']}
        residual_methods = [name for name in arms if name.endswith('-residual')]
        report['status'] = 'synthetic-evaluation'
        panels = []
        chosen = {i for page in control['gallery']['synthetic'] for i in page['ids']}
        for index, case in enumerate(cases):
            item = case['item']
            photo, rgb, indices, count, region = prepare_case(case, p)
            valid = region & (item['materials'] != 255)
            row = {'id': item['id'], 'cohort': 'synthetic', 'kind': item['evidence']['kind'],
                   'metrics': {}, 'boundaries': {}, 'exactControlReplays': []}
            tiles = [('Photo', Image.fromarray(photo)),
                     ('Known overlap', display.colour_mask(item['materials'] >= .5, valid))]
            masks = {'valid': valid.astype(np.uint8)}
            with torch.no_grad():
                frozen = features(item)
                for method, model in arms.items():
                    field = model(rgb, frozen, indices, count, residual=method in residual_methods).sigmoid().numpy()
                    metric, bounds = measurement(item, field, region)
                    row['metrics'][method], row['boundaries'][method] = metric, bounds
                    masks[method] = (field >= .5).astype(np.uint8)
                    if method.startswith('joint-trained-'):
                        baseline = 'synthetic-control-'+method.removeprefix('joint-trained-')
                        with np.load(pinned(transfer[item['id']]['masks'])) as stored:
                            assert np.array_equal(stored[baseline], masks[method])
                        assert metric == transfer[item['id']]['metrics'][baseline]
                        row['exactControlReplays'].append(method)
                    tiles.append((f"{method}: {metric['materialPixelError']*100:.2f}%",
                                  display.colour_mask((field >= .5) ^ metric['materialPhaseExchanged'], valid)))
            file = args.output/f'synthetic-{index:03}.npz'
            np.savez_compressed(file, **masks)
            row['masks'] = reference(file)
            report['rows'].append(row)
            if item['id'] in chosen:
                panels.append({'id': item['id'], 'panels': tiles})
            if (index+1) % 16 == 0:
                save()
                print(json.dumps({'evaluated': index+1, 'seconds': time.monotonic()-started}), flush=True)
        report['summary'] = {}
        for kind in sorted({r['kind'] for r in report['rows']}):
            selected = [r for r in report['rows'] if r['kind'] == kind]
            report['summary'][kind] = {method: {
                'materialError': float(np.mean([r['metrics'][method]['materialPixelError'] for r in selected])),
                'boundaryError': float(np.mean([r['boundaries'][method]['boundaryError'] for r in selected])),
                'interiorError': float(np.mean([r['boundaries'][method]['interiorError'] for r in selected])),
            } for method in arms}
        report['gallery']['synthetic'] = display.gallery(panels, args.output, 'synthetic', 224)
        expected_masks = {
            'joint-trained-'+head: {r['id']: r['masks']['synthetic-control-'+head]
                                   for r in development['rows'] if r.get('masks')}
            for head in ['joint', 'residual']}
        report['status'] = 'development-evaluation'
        save()
        result = development_evaluation(plan, args.output, arms, features, rescale, normalize,
                                        report['sourceHashes'], save, expected_masks, residual_methods)
        report['rows'].extend(result['rows'])
        report['gallery']['development'] = result['gallery']
        report.update(manifest=result['manifest'], cropReplay=result['cropReplay'],
                      status='complete', frozenBodyExact=True, seconds=time.monotonic()-started)
    except Exception as error:
        report.update(status='failed', error=repr(error))
        raise
    finally:
        features.close()
        save()
    print(json.dumps({'status': report['status'], 'seconds': report['seconds'],
                      'summary': report['summary']}), flush=True)


if __name__ == '__main__':
    main()
