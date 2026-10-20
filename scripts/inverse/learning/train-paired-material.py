"""Matched continuation with optional invariance across photographic pairs.

Each batch contains one real photograph, one original synthetic photograph and
its printed or scene counterpart. Both arms use identical batches and ordinary
boundary-weighted supervision. Only the declared consistency weight differs.
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import time

import numpy as np
import torch

from data import digest
from material_boundary_loss import boundary_material_loss
from material_pair_loss import material_pair_consistency
from material_pairing import material_pairs, paired_draws, synthetic_draw_counts
from material_pilot import evaluate_materials
from material_provenance import verify_material_sources
from preserved_candidate import pinned
from u2netp_adaptation import frozen_hash
from u2netp_material_candidate import load_material_candidate, module
from u2netp_material_training import material_training


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(); raw = args.plan.read_bytes(); plan = json.loads(raw)
    p = plan['protocol']; coefficient = p['consistencyWeight']
    if plan['schema'] != 'u2netp-material-training-plan-1' or (p['threads'], p['resolution'], p['batchSize']) != (1, 320, 3):
        raise ValueError('Unexpected paired training protocol')
    if coefficient not in [0, 1]:
        raise ValueError('Require one of the two predeclared arms')
    if shutil.disk_usage('.').free < plan['resources']['minimumFreeGiB']*1024**3:
        raise ValueError('Insufficient free disk')
    torch.set_num_threads(1); torch.set_num_interop_threads(1); torch.manual_seed(p['seed'])
    parent_file = pinned(plan['parentCandidate'])
    model, old_plan, parent, reference = load_material_candidate(parent_file.parent)
    for key in ['trainIds', 'source', 'checkpoint', 'bodyReport', 'sourceManifest', 'annotations', 'evaluation', 'syntheticParent', 'printedReplay']:
        if plan[key] != old_plan[key]:
            raise ValueError('Continuation changed input or source split: '+key)
    if p['materialInput'] != old_plan['protocol']['materialInput']:
        raise ValueError('Changed material features')
    loader = module(Path(plan['source']['path']).parent/'data_loader.py', 'paired_material_input')
    helper = module(Path(__file__).with_name('train-u2netp-material.py'), 'paired_material_helpers')
    real, synthetic, separation = material_training(plan, loader.RescaleT(320), loader.ToTensorLab(flag=0))
    evidence = [{'id': i['id'], **i['evidence'], 'inputTensorSha256': digest(i['input'].numpy().tobytes())} for i in real+synthetic]
    if evidence != parent['trainingInputs']:
        raise ValueError('Input or target bytes changed')
    pairs = material_pairs(synthetic)
    draws = paired_draws(len(real), pairs, p['completePairEpochs'], p['seed'])
    if len(draws) != p['updates']:
        raise ValueError('Unexpected pair budget')
    initial = helper.predict(model, real)
    initial_metrics = evaluate_materials(initial, real)
    if initial_metrics != parent['trainingMetrics']['final']:
        raise ValueError('Parent metrics did not replay exactly')
    model.train(); frozen = frozen_hash(model)
    initial_head = digest(b''.join(k.encode()+v.detach().numpy().tobytes() for k, v in sorted(model.state_dict().items()) if not k.startswith('body.')))
    hashes = dict(parent['sourceHashes'])
    for name in ['train-paired-material.py', 'material_pair_loss.py', 'material_pairing.py',
                 'u2netp_material_candidate.py', 'material_boundary_loss.py',
                 'material_provenance.py', 'train-u2netp-material.py']:
        file = Path(__file__).with_name(name); hashes[str(file)] = digest(file.read_bytes())
    report = {'schema': 'u2netp-material-training-1', 'status': 'training',
        'plan': {'path': str(args.plan), 'sha256': digest(raw)}, 'parentTraining': reference,
        'sourceHashes': hashes, 'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
        'sourceSeparation': separation, 'initialFrozenStateSha256': frozen, 'initialHeadSha256': initial_head,
        'initialHeadCheckpointSha256': parent['checkpointSha256'], 'materialInput': p['materialInput'],
        'materialLoss': p['materialLoss'], 'consistencyWeight': coefficient,
        'parameters': parent['parameters'], 'trainableParameters': parent['trainableParameters'],
        'trainingInputs': evidence, 'pairs': pairs, 'draws': draws, 'history': [], 'lossComponents': [],
        'syntheticVisitCounts': dict(synthetic_draw_counts(draws)), 'scope': plan['scope'],
        'runtime': {'torch': torch.__version__, 'device': 'cpu', 'threads': 1},
        'optimizer': 'Fresh AdamW, identical learning rate and weight decay in both arms.',
        'parentUpdates': len(parent['history']), 'totalUpdatesAfterContinuation': len(parent['history'])+len(draws)}
    if coefficient:
        file = Path(plan['comparison']['controlOutput'])/'report.json'
        control_raw = file.read_bytes(); control = json.loads(control_raw)
        control_plan = json.loads(pinned(control['plan']).read_bytes())
        expected = {**control_plan['protocol'], 'consistencyWeight': coefficient}
        if control['status'] != 'complete' or p != expected:
            raise ValueError('Control protocol differs')
        for key in ['initialHeadSha256', 'initialHeadCheckpointSha256', 'initialFrozenStateSha256',
                    'sourceHashes', 'parentTraining', 'trainingInputs', 'pairs', 'draws', 'runtime', 'optimizer']:
            if report[key] != control[key]:
                raise ValueError('Paired control differs: '+key)
        report['pairedControl'] = {'path': str(file), 'sha256': digest(control_raw)}
    args.output.mkdir(parents=True, exist_ok=False)

    def save():
        verify_material_sources(report); pinned(report['plan']); pinned(reference)
        if 'pairedControl' in report:
            pinned(report['pairedControl'])
        for key in ['sourceManifest', 'annotations', 'evaluation', 'syntheticParent', 'source', 'checkpoint', 'bodyReport']:
            pinned(plan[key])
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')

    trainable = [x for x in model.parameters() if x.requires_grad]
    optimizer = torch.optim.AdamW(trainable, lr=p['learningRate'], weight_decay=p['weightDecay'])
    objective = p['materialLoss']; started = time.perf_counter(); save()
    for step, draw in enumerate(draws):
        batch = [real[draw['real']]]+[synthetic[i] for i in draw['synthetic']]
        rgb = torch.stack([i['input'] for i in batch])
        bodies = torch.from_numpy(np.stack([i['body'] for i in batch]))
        materials = torch.from_numpy(np.stack([i['materials'] for i in batch])).float()
        for enabled, axis in zip(draw['flips'], [-1, -2]):
            if enabled:
                rgb, bodies, materials = rgb.flip(axis), bodies.flip(axis), materials.flip(axis)
        optimizer.zero_grad(set_to_none=True); logits = model(rgb)
        supervised = boundary_material_loss(logits, bodies, materials, objective['factor'], objective['radiusPixels'])
        consistency = material_pair_consistency(logits[1:, 1], materials[1:], objective['factor'], objective['radiusPixels'])
        loss = supervised+coefficient*consistency
        if not torch.isfinite(loss):
            raise ValueError('Nonfinite training loss')
        loss.backward(); torch.nn.utils.clip_grad_norm_(trainable, 5); optimizer.step()
        report['history'].append(float(loss.detach()))
        report['lossComponents'].append({'supervised': float(supervised.detach()), 'consistency': float(consistency.detach())})
        if (step+1) % 32 == 0:
            if frozen_hash(model) != frozen:
                raise ValueError('Frozen body changed')
            save(); print(json.dumps({'step': step+1, **report['lossComponents'][-1], 'seconds': time.perf_counter()-started}), flush=True)
    final = helper.predict(model, real)
    if not np.array_equal(initial[:, 0], final[:, 0]) or frozen_hash(model) != frozen:
        raise ValueError('Body changed')
    torch.save({k: v for k, v in model.state_dict().items() if not k.startswith('body.')}, args.output/'identity.pt')
    np.savez_compressed(args.output/'training-predictions.npz', ids=np.array([i['id'] for i in real]),
                        body=final[:, 0], initial=initial[:, 1], final=final[:, 1])
    helper.review(real, final, args.output)
    report.update(status='complete', seconds=time.perf_counter()-started, frozenBodyExact=True,
        trainingMetrics={'initial': initial_metrics, 'final': evaluate_materials(final, real)},
        checkpointSha256=digest((args.output/'identity.pt').read_bytes()))
    report['artifacts'] = {f.name: digest(f.read_bytes()) for f in args.output.iterdir() if f.name != 'report.json' and f.is_file()}
    save()
    report['artifactBytes'] = sum(f.stat().st_size for f in args.output.iterdir() if f.is_file())
    if report['artifactBytes'] > plan['resources']['maxArtifactMiB']*1024**2:
        raise ValueError('Artifact budget exceeded')
    save(); print(json.dumps({'status': 'complete', 'seconds': report['seconds'],
        'metrics': report['trainingMetrics']['final']['macroMean']}), flush=True)


if __name__ == '__main__':
    main()
