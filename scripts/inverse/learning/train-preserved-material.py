"""Fit one fixed-budget candidate; evaluation photos never enter this process."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import time

import numpy as np
import torch

from data import digest
from material_pilot import material_replay, material_tensors, evaluate_materials
from material_prints import load_printed_replay, print_schedule, printed_batch
from material_training_policy import frozen_state_hash
from preserved_candidate import initial_candidate, pinned, source_separation
from real_finetune import schedule, step_batch
from real_materials_learning import load_material_labels, joint_material_loss


def predict(model, items):
    model.eval()
    with torch.no_grad():
        return np.concatenate([model(material_tensors(items[i:i+4])[0]).sigmoid().numpy()
                               for i in range(0, len(items), 4)])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    plan_bytes = args.plan.read_bytes(); plan = json.loads(plan_bytes)
    if plan['schema'] != 'preserved-material-candidate-plan-1':
        raise ValueError('Unexpected candidate plan')
    protocol = plan['protocol']
    if protocol['threads'] != 1 or protocol['batchSize'] != 4 or protocol['realPerMixedBatch'] != 2:
        raise ValueError('Require the bounded single-thread mixed protocol')
    if shutil.disk_usage('.').free < plan['resources']['minimumFreeGiB']*1024**3:
        raise ValueError('Insufficient free disk for the declared run')
    paths = {key: pinned(plan[key]) for key in ['sourceManifest', 'annotations', 'labelCatalog', 'evaluation']}
    catalog = json.loads(paths['sourceManifest'].read_bytes())
    labels = json.loads(paths['labelCatalog'].read_bytes())
    evaluation = json.loads(paths['evaluation'].read_bytes())
    separation = source_separation(labels['instances'], evaluation['photos'], catalog)
    # No evaluation image is opened: only its frozen identity and grouping.
    real, audit = load_material_labels(paths['labelCatalog'].parent, paths['sourceManifest'], paths['annotations'])
    if [r['id'] for r in real] != plan['trainIds']:
        raise ValueError('Training instance order changed')
    torch.set_num_threads(1); torch.set_num_interop_threads(1); torch.manual_seed(protocol['seed'])
    model, foreground, parent = initial_candidate(plan)
    synthetic, replay = material_replay(parent, protocol['syntheticReplayGeometries'])
    printed, print_audit = load_printed_replay(synthetic, protocol['printedReplay'])
    draws = schedule(protocol['updates'], protocol['seed'], len(synthetic))
    print_draws = print_schedule(protocol['updates'], protocol['seed'])
    source = Path(__file__).parent
    dependencies = [Path(__file__)]+[source/name for name in [
        'preserved_candidate.py', 'preserved_material.py', 'material_transfer.py', 'material_training_policy.py',
        'material_pilot.py', 'material_prints.py', 'material_metrics.py', 'real_finetune.py',
        'real_materials_learning.py', 'real_foreground.py', 'foreground.py', 'model.py', 'data.py']]
    dependencies += [source.parent/'datasets'/name for name in ['real_materials.py', 'real_annotations.py']]
    hashes = {str(p): digest(p.read_bytes()) for p in dependencies}
    initial = predict(model, real)
    expected_body = predict(foreground, real)
    if not np.array_equal(initial[:, :1], expected_body):
        raise ValueError('Initial composition changed foreground')
    frozen = frozen_state_hash(model)
    model.train()
    groups = model.optimizer_groups(protocol['decoderLearningRate'], protocol['encoderLearningRate'])
    optimizer = torch.optim.AdamW(groups, weight_decay=protocol['weightDecay'])
    args.output.mkdir(parents=True, exist_ok=False)
    report = {'schema': 'preserved-material-candidate-1', 'status': 'training',
              'plan': {'path': str(args.plan), 'sha256': digest(plan_bytes)}, 'sourceHashes': hashes,
              'sourceCommit': subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
              'sourceSeparation': separation, 'labelAudit': audit, 'syntheticReplay': replay,
              'printedReplay': print_audit, 'draws': draws, 'printDraws': print_draws,
              'initialFrozenStateSha256': frozen, 'initialization': model.initialization,
              'parameters': sum(p.numel() for p in model.parameters()),
              'trainableParameters': sum(p.numel() for p in model.parameters() if p.requires_grad),
              'runtime': {'torch': torch.__version__, 'threads': 1, 'device': 'cpu'},
              'sampledIds': [], 'history': [],
              'scope': 'All-data candidate on the sixteen eligible development photos. Metrics here are training diagnostics, not held-out accuracy or a deployment gate.'}
    def save():
        for file, expected in hashes.items():
            pinned({'path': file, 'sha256': expected})
        if digest(args.plan.read_bytes()) != report['plan']['sha256']:
            raise ValueError('Candidate protocol changed while running')
        for key in paths:
            pinned(plan[key])
        temporary = args.output/'report.writing.json'
        temporary.write_text(json.dumps(report, indent=2)+'\n'); temporary.replace(args.output/'report.json')
    started = time.perf_counter(); save()
    try:
        admitted = {r['id'] for r in real+synthetic}
        admitted.update(r['id'] for variants in printed.values() for r in variants)
        for step, draw in enumerate(draws):
            batch = printed_batch(step_batch(draw, synthetic, real), print_draws[step], printed)
            report['sampledIds'].append([i['id'] for i in batch])
            if any(i['id'] not in admitted for i in batch):
                raise ValueError('Unadmitted image entered the mixed batch')
            rgb, body, material = material_tensors(batch, draw['flips'])
            optimizer.zero_grad(set_to_none=True)
            loss = joint_material_loss(model(rgb), body, material)
            if not torch.isfinite(loss):
                raise ValueError('Nonfinite material loss')
            loss.backward()
            torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 5)
            optimizer.step(); report['history'].append(float(loss.detach()))
            if (step+1) % 40 == 0:
                if frozen_state_hash(model) != frozen:
                    raise ValueError('Adaptation changed immutable state')
                save(); print(step+1, float(loss.detach()), flush=True)
        probability = predict(model, real)
        if frozen_state_hash(model) != frozen or not np.array_equal(probability[:, :1], expected_body):
            raise ValueError('Adaptation changed foreground predictions or frozen tensors')
        if np.array_equal(probability[:, 1:], initial[:, 1:]):
            raise ValueError('Material branch did not learn')
        torch.save({k:v.detach().cpu() for k,v in model.state_dict().items()}, args.output/'model.pt')
        np.savez_compressed(args.output/'training-predictions.npz',ids=np.array(plan['trainIds']),probabilities=probability)
        report.update(status='complete', seconds=time.perf_counter()-started, updates=len(draws),
                      frozenStateUnchanged=True, foregroundPredictionsExact=True,
                      trainingMetrics=evaluate_materials(probability,real),
                      checkpointSha256=digest((args.output/'model.pt').read_bytes()),
                      predictionsSha256=digest((args.output/'training-predictions.npz').read_bytes()))
        report['artifactBytes'] = sum(p.stat().st_size for p in args.output.iterdir() if p.is_file())
        if report['artifactBytes'] > plan['resources']['maxArtifactMiB']*1024**2:
            raise ValueError('Candidate artifact budget exceeded')
        save(); print(json.dumps({'complete':True,'seconds':report['seconds'],'trainingMetrics':report['trainingMetrics']['macroMean']}),flush=True)
    except Exception as error:
        report['status']='failed'; report['error']=str(error); save(); raise


if __name__ == '__main__': main()
