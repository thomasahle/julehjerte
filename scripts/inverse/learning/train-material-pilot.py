"""Run a predeclared grouped real/synthetic material-learning comparison."""
import argparse
import copy
import json
from pathlib import Path
import platform
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT/'scripts/inverse/learning'))
sys.path.insert(0, str(ROOT/'scripts/inverse/datasets'))

import numpy as np
import torch
from data import digest
from foreground import load_foreground_run
from material_transfer import material_from_foreground
from material_pilot import material_replay, material_tensors, evaluate_materials
from material_prints import load_printed_replay, print_schedule, printed_batch
from real_finetune import grouped_folds, encoder_hash, schedule, step_batch
from material_training_policy import configure_material_training, frozen_state_hash
from real_materials import build
from real_materials_learning import load_material_labels, joint_material_loss


def predictions(model, items):
    model.eval(); result = []
    with torch.no_grad():
        for start in range(0, len(items), 4):
            rgb, _, _ = material_tensors(items[start:start+4])
            result.extend(model(rgb).sigmoid().numpy())
    return np.stack(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    plan_bytes = args.plan.read_bytes(); plan = json.loads(plan_bytes)
    if plan.get('schema') != 'woven-heart-material-pilot-plan-1':
        raise ValueError('Unexpected material pilot plan')
    protocol = plan['protocol']
    if protocol['batchSize'] != 4 or protocol['realPerMixedBatch'] != 2 or protocol['device'] != 'cpu' or protocol['threads'] not in [1,2]:
        raise ValueError('Unsupported paired material protocol')
    torch.set_num_threads(protocol['threads']); torch.set_num_interop_threads(1)
    torch.manual_seed(protocol['seed'])
    manifest = ROOT/plan['sourceManifest']; initial_run = ROOT/plan['initialRun']
    pins = {str(manifest): plan['sourceManifestSha256'],
            str(initial_run/'report.json'): plan['initialReportSha256'],
            str(initial_run/'model.pt'): plan['initialCheckpointSha256'],
            **{str(ROOT/r['annotations']): r['sha256'] for r in plan['labelSources']}}
    for source in protocol.get('printedReplay', []):
        pins[str(Path(source['directory'])/'manifest.json')] = source['manifestSha256']
    def verify_pins():
        for name, expected in pins.items():
            if digest(Path(name).read_bytes()) != expected:
                raise ValueError('A pinned material input changed: '+name)
    verify_pins()
    args.output.mkdir(parents=True, exist_ok=False)
    source = ROOT/'scripts/inverse/learning'
    dependencies = [Path(__file__), Path(__file__).with_name('material_pilot.py'), Path(__file__).with_name('material_prints.py'),
                    source/'material_metrics.py', source/'material_transfer.py', source/'material_training_policy.py',
                    source/'real_materials_learning.py', source/'real_foreground.py',
                    source/'real_finetune.py', source/'foreground.py', source/'model.py', source/'data.py',
                    ROOT/'scripts/inverse/datasets/real_materials.py', ROOT/'scripts/inverse/datasets/real_annotations.py']
    source_hashes = {str(p): digest(p.read_bytes()) for p in dependencies}
    report = {'schema': 'woven-heart-material-pilot-1', 'status': 'preparing',
              'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'sourceHashes': source_hashes, 'planSha256': digest(plan_bytes), 'plan': plan,
              'inputPins': pins, 'labelAudits': [], 'runs': {},
              'runtime': {'python': platform.python_version(), 'torch': torch.__version__, 'device': 'cpu', 'threads': protocol['threads']},
              'limitations': ['Previously inspected partial annotations; this is grouped development evaluation, not an unseen test.',
                              'Declared motif/source groups are conservative but not topology-disjoint, and synthetic replay includes checker weaving.',
                              'Unknown boundaries do not receive labels or scores. Body/material scores do not establish correct crops or cutting templates.',
                              'One seed and a fixed update budget; no all-data model, ONNX export or browser deployment.']}
    def save():
        for name, expected in source_hashes.items():
            if digest(Path(name).read_bytes()) != expected:
                raise ValueError('A running training implementation changed: '+name)
        verify_pins()
        temp = args.output/'report.writing.json'
        temp.write_text(json.dumps(report, indent=2)+'\n'); temp.replace(args.output/'report.json')
    save()
    try:
        items = []
        for entry in plan['labelSources']:
            annotation = ROOT/entry['annotations']; destination = args.output/'labels'/entry['name']
            destination.parent.mkdir(exist_ok=True)
            build(manifest, annotation, destination, 256, ROOT)
            selected, audit = load_material_labels(destination, manifest, annotation, ROOT)
            items.extend(selected)
            report['labelAudits'].append({'annotations': entry['annotations'], 'directory': str(destination), **audit})
        combined_audit = {'manifestSha256': digest(json.dumps([a['manifestSha256'] for a in report['labelAudits']]).encode()),
                          'annotationsSha256': digest(json.dumps([r['sha256'] for r in plan['labelSources']]).encode())}
        # Group membership was declared in the pinned plan. Resolve hashes for
        # newly compiled catalogs without changing those declared memberships.
        fold_plan = {'schema': 'woven-heart-real-pilot-folds-1', 'groups': plan['groups'],
                     'labelsManifestSha256': combined_audit['manifestSha256'],
                     'annotationsSha256': combined_audit['annotationsSha256']}
        folds = grouped_folds(items, combined_audit, fold_plan)
        report['resolvedFoldPlan'] = fold_plan; report['folds'] = folds
        report['inputs'] = [{k: i[k] for k in ['id', 'splitGroupId', 'nearDuplicateGroup', 'motif']} |
                            {k+'Sha256': digest(i[k].tobytes()) for k in ['rgb', 'body', 'materials']} for i in items]
        original, training = load_foreground_run(initial_run)
        # load_foreground_run verifies the implementation and learned weights;
        # retain the report's actual encoder provenance when expanding its head.
        original.initialization = copy.deepcopy(training['initialization'])
        initial = material_from_foreground(original)
        initial_encoder = encoder_hash(initial)
        report['initialization'] = {'parentReportSha256': plan['initialReportSha256'],
                                    'parentCheckpointSha256': plan['initialCheckpointSha256'],
                                    'encoder': initial.initialization, 'materialHead': 'Zero logits; retained foreground output',
                                    'encoderSha256': initial_encoder}
        synthetic, replay = material_replay(training, protocol['syntheticReplayGeometries'])
        report['syntheticReplay'] = replay
        report['syntheticInputHashes'] = {i['id']: {k: digest(i[k].tobytes()) for k in ['rgb', 'body', 'materials']} for i in synthetic}
        draws = schedule(protocol['updates'], protocol['seed'], len(synthetic))
        printed, print_draws = {}, None
        if protocol.get('printedReplay'):
            printed, record = load_printed_replay(synthetic, protocol['printedReplay'])
            print_draws = print_schedule(protocol['updates'], protocol['seed'])
            report['printedReplay'] = {'inputs': record, 'draws': print_draws,
                                      'policy': 'Half of sampled original replay images receive a uniformly chosen print; scene counterparts and real photos remain unchanged. Same body/material targets and base draw schedule.'}
        (args.output/'draws.json').write_text(json.dumps(draws, indent=2)+'\n')
        report['drawsSha256'] = digest((args.output/'draws.json').read_bytes())
        neutral = predictions(initial, items)
        report['neutralMetrics'] = evaluate_materials(neutral, items)
        np.savez_compressed(args.output/'neutral-predictions.npz', ids=np.array([i['id'] for i in items]), probabilities=neutral)
        by_id = {i['id']: i for i in items}; out_of_fold = {}
        runs = [{'id': 'synthetic-control', 'train': [], 'heldOut': list(by_id)}]+folds
        report['status'] = 'training'; save()
        for run in runs:
            model = copy.deepcopy(initial)
            groups, policy = configure_material_training(model, tail_blocks=protocol.get('encoderTailBlocks',0),
                decoder_lr=protocol['learningRate'], encoder_lr=protocol.get('encoderLearningRate'))
            frozen_before = frozen_state_hash(model)
            optimizer = torch.optim.AdamW(groups, lr=protocol['learningRate'], weight_decay=protocol['weightDecay'])
            real = [by_id[i] for i in run['train']]
            destination = args.output/run['id']; destination.mkdir()
            entry = {'status': 'training', 'trainIds': run['train'], 'heldOutIds': run['heldOut'],
                     'trainableParameters': policy['trainableParameters'], 'trainingPolicy':policy,
                     'initialFrozenStateSha256':frozen_before, 'initialEncoderSha256': initial_encoder, 'history': []}
            report['runs'][run['id']] = entry; sampled = []; started = time.perf_counter()
            save()
            for step, draw in enumerate(draws):
                batch = step_batch(draw, synthetic, real)
                if print_draws is not None:
                    batch = printed_batch(batch, print_draws[step], printed)
                sampled.append([i['id'] for i in batch])
                if any(i['id'] in run['heldOut'] for i in batch):
                    raise ValueError('A held-out photograph entered material training')
                rgb, body, material = material_tensors(batch, draw['flips'])
                optimizer.zero_grad(set_to_none=True)
                loss = joint_material_loss(model(rgb), body, material)
                if not torch.isfinite(loss):
                    raise ValueError('Nonfinite material-training loss')
                loss.backward(); torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 5); optimizer.step()
                entry['history'].append(float(loss.detach()))
                if (step+1) % 40 == 0:
                    save(); print(run['id'], step+1, float(loss.detach()), flush=True)
            if frozen_state_hash(model) != frozen_before:
                raise ValueError('Training changed frozen parameters or buffers')
            if not policy['tailBlocks'] and encoder_hash(model) != initial_encoder:
                raise ValueError('Training changed the fully frozen encoder')
            held_out = [by_id[i] for i in run['heldOut']]
            probability = predictions(model, held_out)
            entry.update(status='complete', updates=len(draws), seconds=time.perf_counter()-started,
                         finalEncoderSha256=encoder_hash(model), finalFrozenStateSha256=frozen_state_hash(model), sampledIds=sampled,
                         metrics=evaluate_materials(probability, held_out),
                         selection='Fixed final update. Held-out groups never select parameters, thresholds or checkpoints.')
            torch.save({k: v.detach().cpu() for k, v in model.state_dict().items()}, destination/'model.pt')
            np.savez_compressed(destination/'predictions.npz', ids=np.array(run['heldOut']), probabilities=probability)
            entry['checkpointSha256'] = digest((destination/'model.pt').read_bytes())
            entry['predictionsSha256'] = digest((destination/'predictions.npz').read_bytes())
            if real:
                for identity, p in zip(run['heldOut'], probability):
                    if identity in out_of_fold:
                        raise ValueError('A material instance was scored twice out of fold')
                    out_of_fold[identity] = p
            save(); print(run['id'], 'complete', json.dumps(entry['metrics']['macroMean']), flush=True)
        if set(out_of_fold) != set(by_id):
            raise ValueError('Out-of-fold predictions do not cover every real instance')
        ordered = np.stack([out_of_fold[i['id']] for i in items])
        report['mixedOutOfFoldMetrics'] = evaluate_materials(ordered, items)
        np.savez_compressed(args.output/'mixed-out-of-fold.npz', ids=np.array([i['id'] for i in items]), probabilities=ordered)
        report['artifacts'] = {str(p.relative_to(args.output)): digest(p.read_bytes()) for p in sorted(args.output.rglob('*')) if p.suffix in ['.pt', '.npz']}
        if encoder_hash(original) != initial_encoder:
            raise ValueError('The retained parent model changed')
        report['status'] = 'complete'; save()
        print('out-of-fold', json.dumps(report['mixedOutOfFoldMetrics']['macroMean']), flush=True)
    except Exception as error:
        report['status'] = 'failed'; report['error'] = str(error)
        save(); raise


if __name__ == '__main__': main()
