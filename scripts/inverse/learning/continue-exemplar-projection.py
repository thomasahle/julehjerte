"""Compare synthetic-only and mixed real supervision from one fixed projection."""
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
from paper_exemplars import lobe_samples, quad_transform
from preserved_candidate import pinned
from u2netp_adaptation import frozen_hash
from u2netp_material_candidate import load_material_candidate, module
from u2netp_material_training import material_training


def real_cases(examples, real, development_ids):
    items = {r['id']: r for r in real}
    identities = [r['id'] for r in examples]
    if len(set(identities)) != len(identities) or set(identities) & set(development_ids):
        raise ValueError('Duplicate or development identity in real supervision')
    cases = []
    for example in examples:
        item = items[example['id']]
        annotation = json.loads(pinned(example['source']).read_bytes())
        body = next(r for r in annotation['instances'] if r['id'] == item['id'])
        if body['overlapCorners'] != example['overlapCorners']:
            raise ValueError('Changed reviewed corners')
        if body['imageSha256'] != item['evidence']['photoSha256']:
            raise ValueError('Corners belong to another photograph')
        # material_training already checks EXIF-decoded dimensions against these
        # same body annotations and verifies the source-group separation.
        assert body['overlapCorners']['order'] == 'notch,right,tip,left'
        cases.append({'item': item, 'matrix': quad_transform(body['overlapCorners']['points']),
                      'geometry': example, 'sourceSize': body['sourceSize']})
    return cases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--prepare-only', action='store_true')
    args = parser.parse_args()
    plan = json.loads(args.plan.read_bytes())
    plan['_reference'] = reference(args.plan)
    p = plan['protocol']
    assert plan['schema'] == 'exemplar-continuation-plan-1' and not args.output.exists()
    assert p['updates'] == 96 and p['realLossWeight'] == .5
    assert (p['resolution'], p['contextResolution'], p['ridgeRegularization']) == (320, 160, .1)
    assert shutil.disk_usage('.').free >= plan['resources']['minimumFreeGiB']*1024**3
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
    loader = module(Path(training_plan['source']['path']).parent/'data_loader.py', 'continuation_loader')
    rescale, normalize = loader.RescaleT(320), loader.ToTensorLab(flag=0)
    real, synthetic, separation = material_training(training_plan, rescale, normalize)
    evidence = [{'id': item['id'], **item['evidence'],
                 'inputTensorSha256': digest(item['input'].numpy().tobytes())} for item in real+synthetic]
    assert evidence == training['trainingInputs'] and len(real) == 16 and len(synthetic) == 96
    parent_report = json.loads(pinned(plan['parentProjection']).read_bytes())
    assert parent_report['status'] == 'complete' and parent_report['frozenBodyExact']
    assert parent_report['initialBodySha256'] == body_hash
    assert parent_report['checkpoint'] == plan['parentCheckpoint']
    parent_rows = {r['id']: r for r in parent_report['rows']}
    prior = {r['id']: r for r in json.loads(pinned(plan['exemplar']).read_bytes())['rows']}
    cases = []
    for item in synthetic:
        labels = json.loads(pinned(prior[item['id']]['geometry']).read_bytes())
        matrix = np.asarray(labels['canonicalToPhoto']).reshape(3, 3)@np.diag([100, 100, 1])
        cases.append({'item': item, 'matrix': matrix})
    supervised = real_cases(plan['realExamples'], real, plan['expectedDevelopmentCases'])
    assert len(supervised) == 6
    rng = np.random.default_rng(p['seed'])
    draws = rng.permutation(len(cases)).tolist()
    real_draws = np.concatenate([rng.permutation(6) for _ in range(16)]).tolist()
    assert len(draws) == len(real_draws) == p['updates']
    args.output.mkdir(parents=True)
    sources = [
        'continue-exemplar-projection.py', 'exemplar_experiment.py', 'exemplar_projection.py',
        'paper_exemplars.py', 'probe-paper-exemplars.py', 'probe-native-exemplars.py',
        'probe-material-synthetic.py', 'material_boundary_loss.py', 'u2netp_adaptation.py',
        'u2netp_material_candidate.py', 'u2netp_material_training.py',
    ]
    report = {
        'schema': 'exemplar-continuation-results-1', 'status': 'preparing',
        'plan': reference(args.plan), 'parentProjection': plan['parentProjection'],
        'initialCheckpoint': plan['parentCheckpoint'],
        'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
        'sourceHashes': {str(Path(__file__).with_name(n)): reference(Path(__file__).with_name(n))['sha256']
                         for n in sources},
        'sourceSeparation': separation, 'parentInputsVerified': evidence,
        'syntheticDraws': [cases[i]['item']['id'] for i in draws],
        'realDraws': [supervised[i]['item']['id'] for i in real_draws],
        'realPreparation': [], 'history': [], 'rows': [], 'gallery': {},
        'initialBodySha256': body_hash, 'scope': plan['scope'],
        'runtime': {'torch': torch.__version__, 'device': 'cpu', 'threads': 1},
    }

    def save():
        assert frozen_hash(body) == body_hash
        assert shutil.disk_usage('.').free >= plan['resources']['minimumFreeGiB']*1024**3
        assert time.monotonic()-started < plan['resources']['maximumWallSeconds']
        assert sum(f.stat().st_size for f in args.output.rglob('*') if f.is_file()) < (
            plan['resources']['maximumArtifactMiB']*1024**2)
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')

    preparation = []
    for case in supervised:
        item = case['item']
        photo, _, _, count, region = prepare_case(case, p)
        assert list(photo.shape[1::-1]) == case['sourceSize']
        known = region & (item['materials'] != 255)
        assert known.any() and (item['materials'][known] < .5).any() and (item['materials'][known] >= .5).any()
        support = lobe_samples(case['matrix'], 320, photo.shape[1::-1])
        preparation.append({'id': item['id'], 'panels': [
            ('Photo', Image.fromarray(photo)),
            ('Known overlap labels', display.colour_mask(item['materials'] >= .5, known)),
            ('Geometric lobe samples', display.colour_mask(support[1], support.any(0))),
        ]})
        report['realPreparation'].append({
            'id': item['id'], 'geometry': case['geometry'], 'samplesPerPaper': count,
            'knownOverlapPixels': int(known.sum()), 'overlapPixels': int(region.sum()),
            'knownOverlapLabelsSha256': digest(np.where(region, item['materials'], 255).tobytes()),
        })
    report['gallery']['preparation'] = display.gallery(preparation, args.output, 'preparation', 320)
    report['status'] = 'prepared'
    save()
    if args.prepare_only:
        print(json.dumps({'status': 'prepared', 'realPreparation': report['realPreparation']}, indent=2))
        return
    parent = ExemplarProjection(p['contextChannels'], p['projectionChannels'])
    parent.load_state_dict(torch.load(pinned(plan['parentCheckpoint']), map_location='cpu', weights_only=True),
                           strict=True)
    models = {'parent': parent.eval(), 'synthetic-control': copy.deepcopy(parent), 'real-mixed': copy.deepcopy(parent)}
    for parameter in parent.parameters():
        parameter.requires_grad_(False)
    for model in models.values():
        assert sum(v.numel() for v in model.parameters()) == p['parameters']
    features = FrozenFeatures(body, p)
    rows_by_id = {}
    report['status'] = 'parent-replay'
    for index, case in enumerate(cases+supervised):
        item = case['item']
        _, rgb, indices, count, region = prepare_case(case, p)
        with torch.no_grad():
            field = parent(rgb, features(item), indices, count).sigmoid().numpy()
        metrics, bounds = measurement(item, field, region)
        is_synthetic = index < len(cases)
        row = {'id': item['id'], 'cohort': 'synthetic' if is_synthetic else 'real-training',
               'kind': item['evidence']['kind'], 'metrics': {'parent': metrics},
               'boundaries': {'parent': bounds}, 'masks': {}}
        if is_synthetic:
            previous = parent_rows[item['id']]
            with np.load(pinned(previous['trainedMask'])) as saved:
                assert np.array_equal(field >= .5, saved['mask']), 'Parent mask replay: '+item['id']
            assert metrics == previous['metrics']['trained']
            row['masks']['parent'] = previous['trainedMask']
            row['parentExactReplay'] = True
        else:
            file = args.output/f'parent-{index:03}.npz'
            np.savez_compressed(file, mask=(field >= .5).astype(np.uint8))
            row['masks']['parent'] = reference(file)
        report['rows'].append(row)
        rows_by_id[item['id']] = row
        if (index+1) % 16 == 0:
            save()
            print('Parent replay', index+1, '/ 102', flush=True)
    report['status'] = 'training'
    optimizers = {name: torch.optim.AdamW(model.parameters(), lr=p['learningRate'], weight_decay=p['weightDecay'])
                  for name, model in models.items() if name != 'parent'}
    for step, (index, real_index) in enumerate(zip(draws, real_draws), 1):
        case, real_case = cases[index], supervised[real_index]
        _, rgb, indices, count, region = prepare_case(case, p)
        _, real_rgb, real_indices, real_count, real_region = prepare_case(real_case, p)
        target = torch.from_numpy(np.where(region, case['item']['materials'], 255))
        real_target = torch.from_numpy(np.where(real_region, real_case['item']['materials'], 255))
        frozen, real_frozen = features(case['item']), features(real_case['item'])
        record = {'step': step, 'syntheticId': case['item']['id'], 'realId': real_case['item']['id'], 'arms': {}}
        for name, optimizer in optimizers.items():
            model = models[name]
            optimizer.zero_grad(set_to_none=True)
            score = model(rgb, frozen, indices, count)
            synthetic_loss = overlap_loss(score, target, p['boundaryFactor'], p['boundaryRadius'], p['lossTemperature'])
            loss = synthetic_loss
            values = {'syntheticLoss': float(synthetic_loss.detach())}
            if name == 'real-mixed':
                score = model(real_rgb, real_frozen, real_indices, real_count)
                real_loss = overlap_loss(score, real_target, p['boundaryFactor'], p['boundaryRadius'], p['lossTemperature'])
                loss = (1-p['realLossWeight'])*synthetic_loss+p['realLossWeight']*real_loss
                values['realLoss'] = float(real_loss.detach())
            assert torch.isfinite(loss)
            loss.backward()
            norm = torch.nn.utils.clip_grad_norm_(model.parameters(), p['maximumGradientNorm'])
            assert torch.isfinite(norm)
            optimizer.step()
            record['arms'][name] = {**values, 'loss': float(loss.detach()), 'gradientNorm': float(norm)}
        report['history'].append(record)
        if step % 16 == 0:
            save()
            print(json.dumps({'step': step, 'seconds': time.monotonic()-started, 'arms': record['arms']}), flush=True)
    report['checkpoints'] = {}
    for name, model in models.items():
        model.eval()
        if name != 'parent':
            file = args.output/(name+'.pt')
            torch.save(model.state_dict(), file)
            report['checkpoints'][name] = reference(file)
    report['status'] = 'final-evaluation'
    chosen = {identity for page in parent_report['gallery']['synthetic'] for identity in page['ids']}
    panels = {'synthetic': [], 'real-training': []}
    for index, case in enumerate(cases+supervised):
        item = case['item']
        photo, rgb, indices, count, region = prepare_case(case, p)
        row = rows_by_id[item['id']]
        frozen = features(item)
        for name in optimizers:
            with torch.no_grad():
                field = models[name](rgb, frozen, indices, count).sigmoid().numpy()
            row['metrics'][name], row['boundaries'][name] = measurement(item, field, region)
            file = args.output/f'{name}-{index:03}.npz'
            np.savez_compressed(file, mask=(field >= .5).astype(np.uint8))
            row['masks'][name] = reference(file)
        if item['id'] in chosen or row['cohort'] == 'real-training':
            valid = region & (item['materials'] != 255)
            tiles = [('Photo', Image.fromarray(photo)),
                     ('Known labels', display.colour_mask(item['materials'] >= .5, valid))]
            for name in models:
                with np.load(pinned(row['masks'][name])) as saved:
                    tiles.append((name, display.colour_mask(
                        saved['mask'].astype(bool) ^ row['metrics'][name]['materialPhaseExchanged'], valid)))
            panels[row['cohort']].append({'id': item['id'], 'panels': tiles})
        if (index+1) % 16 == 0:
            save()
            print('Final evaluation', index+1, '/ 102', flush=True)
    report['summary'] = {}
    for kind in sorted({r['kind'] for r in report['rows']}):
        selected = [r for r in report['rows'] if r['kind'] == kind]
        def boundary_summary(name, key):
            values = [r['boundaries'][name][key] for r in selected
                      if r['boundaries'][name][key] is not None]
            return float(np.mean(values)) if values else None
        report['summary'][kind] = {'count': len(selected), 'methods': {name: {
            'materialError': float(np.mean([r['metrics'][name]['materialPixelError'] for r in selected])),
            'boundaryError': boundary_summary(name, 'boundaryError'),
            'interiorError': boundary_summary(name, 'interiorError'),
            'boundaryAnnotatedImages': sum(r['boundaries'][name]['boundaryPixels'] > 0 for r in selected),
        } for name in models}}
    report['gallery'].update({name: display.gallery(entries, args.output, name, 256)
                             for name, entries in panels.items()})
    report['status'] = 'development-evaluation'
    save()
    expected_masks = {'parent': {r['id']: r['masks']['trained-projection']
                               for r in parent_report['rows'] if r.get('masks')}}
    result = development_evaluation(plan, args.output, models, features, rescale, normalize,
                                    report['sourceHashes'], save, expected_masks)
    report['rows'].extend(result['rows'])
    report['gallery']['development'] = result['gallery']
    report.update(manifest=result['manifest'], cropReplay=result['cropReplay'])
    features.close()
    assert len(report['history']) == 96 and frozen_hash(body) == body_hash
    assert all(torch.equal(value, torch.load(pinned(plan['parentCheckpoint']), map_location='cpu',
                                            weights_only=True)[key])
               for key, value in parent.state_dict().items())
    report.update(status='complete', frozenBodyExact=True, parentProjectionExact=True,
                  seconds=time.monotonic()-started)
    save()
    print(json.dumps({'status': 'complete', 'seconds': report['seconds'], 'summary': report['summary']}, indent=2))


if __name__ == '__main__':
    main()
