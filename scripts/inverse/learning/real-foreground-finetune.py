"""Run the predeclared grouped real-photo adaptation diagnostic serially."""
import argparse
import copy
import json
from pathlib import Path
import platform
import subprocess
import time

import numpy as np
import torch

from data import digest
from foreground import load_foreground_run, tensors
from real_finetune import adaptation_loss, encoder_hash, freeze_encoder, grouped_folds, replay_corpus, schedule, step_batch
from real_foreground import known_region_metrics, load_real_labels


def predictions(model, items):
    model.eval(); result = []
    with torch.no_grad():
        for start in range(0, len(items), 4):
            rgb, _ = tensors(items[start:start+4], 'cpu')
            result.extend(model(rgb).sigmoid()[:, 0].numpy())
    return np.stack(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--labels', type=Path, required=True)
    parser.add_argument('--plan', type=Path, default=Path(__file__).with_name('real-pilot-folds.json'))
    parser.add_argument('--initial-run', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    torch.set_num_threads(2); torch.set_num_interop_threads(1)
    plan_bytes = args.plan.read_bytes(); plan = json.loads(plan_bytes); protocol = plan['protocol']
    if protocol['batchSize'] != 4 or protocol['realPerMixedBatch'] != 2 or protocol['updates'] < 1:
        raise ValueError('Unsupported paired-update protocol')
    torch.manual_seed(protocol['seed'])
    items, audit = load_real_labels(args.labels)
    folds = grouped_folds(items, audit, plan)
    initial, training = load_foreground_run(args.initial_run)
    args.output.mkdir(parents=True, exist_ok=False)
    source = Path(__file__).parent
    report = {'schema': 'woven-heart-real-adaptation-1', 'status': 'preparing',
              'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
              'sourceHashes': {name: digest((source/name).read_bytes()) for name in ['real-foreground-finetune.py', 'real_finetune.py', 'real_foreground.py', 'foreground.py', 'model.py', 'data.py']},
              'planSha256': digest(plan_bytes), 'plan': plan, 'labelsAudit': audit, 'folds': folds,
              'initialCheckpointSha256': training['checkpointSha256'], 'initialReportSha256': digest((args.initial_run/'report.json').read_bytes()),
              'runtime': {'python': platform.python_version(), 'torch': torch.__version__, 'device': 'cpu', 'threads': 2},
              'inputs': [{'id': i['id'], 'rgbSha256': digest(i['rgb'].tobytes()), 'targetSha256': digest(i['target'].tobytes()),
                          'weightSha256': digest(i['weight'].tobytes()), 'splitGroupId': i['splitGroupId'], 'nearDuplicateGroup': i['nearDuplicateGroup'], 'motif': i['motif']} for i in items],
              'limitations': ['Ten previously inspected development photos; not an unseen test.',
                              'Pilot-level grouping does not complete cross-corpus motif review and does not imply topology-disjoint evaluation.',
                              'Unknown boundaries/occlusions and padding receive no score. Aggregate IoU is not complete crop or template fidelity.',
                              'Fixed final update and one seed per condition. No deployed or all-data-trained model is produced.'], 'runs': {}}
    def save():
        temporary = args.output/'report.writing.json'
        temporary.write_text(json.dumps(report, indent=2)+'\n'); temporary.replace(args.output/'report.json')
    save()
    try:
        synthetic, report['syntheticReplay'] = replay_corpus(training, protocol['syntheticReplayGeometries'])
        draws = schedule(protocol['updates'], protocol['seed'], len(synthetic))
        (args.output/'draws.json').write_text(json.dumps(draws, indent=2)+'\n')
        report['drawsSha256'] = digest((args.output/'draws.json').read_bytes())
        report['syntheticReplayInputHashes'] = {i['id']: {'rgb': digest(i['rgb'].tobytes()), 'target': digest(i['target'].tobytes())} for i in synthetic}
        baseline = predictions(initial, items)
        report['frozenMetrics'] = known_region_metrics(baseline, items)
        np.savez_compressed(args.output/'frozen-predictions.npz', ids=np.array([i['id'] for i in items]), probabilities=baseline)
        initial_encoder = encoder_hash(initial)
        all_items = {i['id']: i for i in items}; held_out_predictions = {}
        runs = [{'id': 'synthetic-control', 'train': [], 'heldOut': list(all_items)}]+folds
        report['status'] = 'training'; save()
        for run in runs:
            started = time.perf_counter()
            model = copy.deepcopy(initial)
            trainable = freeze_encoder(model)
            optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=protocol['learningRate'], weight_decay=protocol['weightDecay'])
            real = [all_items[i] for i in run['train']]
            history, sampled = [], []
            run_dir = args.output/run['id']; run_dir.mkdir()
            entry = {'status': 'training', 'trainIds': run['train'], 'heldOutIds': run['heldOut'], 'trainableParameters': trainable,
                     'initialEncoderSha256': initial_encoder, 'history': history}
            report['runs'][run['id']] = entry; save()
            for step, draw in enumerate(draws):
                batch = step_batch(draw, synthetic, real)
                sampled.append([i['id'] for i in batch])
                if any(i['id'] in run['heldOut'] for i in batch):
                    raise ValueError('A held-out real image entered adaptation')
                optimizer.zero_grad(set_to_none=True)
                loss = adaptation_loss(model, batch, draw['flips'])
                if not torch.isfinite(loss):
                    raise ValueError('Nonfinite adaptation loss')
                loss.backward(); torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 5); optimizer.step()
                history.append(float(loss.detach()))
                if (step+1) % 20 == 0:
                    save(); print(run['id'], step+1, float(loss.detach()), flush=True)
            if encoder_hash(model) != initial_encoder:
                raise ValueError('Adaptation changed frozen encoder parameters or statistics')
            # Evaluate only the held-out members after the fixed final update.
            held_out = [all_items[i] for i in run['heldOut']]
            probability = predictions(model, held_out)
            entry['metrics'] = known_region_metrics(probability, held_out)
            entry['status'] = 'complete'; entry['updates'] = len(draws)
            entry['finalEncoderSha256'] = encoder_hash(model)
            entry['seconds'] = time.perf_counter()-started
            entry['sampledIds'] = sampled
            entry['sampledIdsSha256'] = digest(json.dumps(sampled).encode())
            entry['selection'] = 'Fixed final update; held-out observations never used for optimization, early stopping or checkpoint selection.'
            torch.save({k: v.detach().cpu() for k, v in model.state_dict().items()}, run_dir/'model.pt')
            np.savez_compressed(run_dir/'predictions.npz', ids=np.array(run['heldOut']), probabilities=probability)
            entry['checkpointSha256'] = digest((run_dir/'model.pt').read_bytes())
            entry['predictionsSha256'] = digest((run_dir/'predictions.npz').read_bytes())
            if real:
                for identity, predicted in zip(run['heldOut'], probability):
                    if identity in held_out_predictions:
                        raise ValueError('Pilot instance evaluated in two folds')
                    held_out_predictions[identity] = predicted
            save(); print(run['id'], 'complete', json.dumps(entry['metrics']['macroMean']), flush=True)
        ordered = np.stack([held_out_predictions[i['id']] for i in items])
        report['mixedOutOfFoldMetrics'] = known_region_metrics(ordered, items)
        np.savez_compressed(args.output/'mixed-out-of-fold.npz', ids=np.array([i['id'] for i in items]), probabilities=ordered)
        report['artifacts'] = {str(p.relative_to(args.output)): digest(p.read_bytes()) for p in sorted(args.output.rglob('*')) if p.suffix in ['.pt', '.npz']}
        report['status'] = 'complete'; save()
        print('out-of-fold', json.dumps(report['mixedOutOfFoldMetrics']['macroMean']), flush=True)
    except Exception as error:
        report['status'] = 'failed'; report['error'] = str(error); save(); raise


if __name__ == '__main__': main()
