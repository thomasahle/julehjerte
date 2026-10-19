"""Continue a fixed paper head through complete, balanced training-pool epochs.

The frozen body and input/label compiler are unchanged. Only the final head is
saved. This is further optimization, not an isolated sampling-policy ablation.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import shutil
import subprocess
import time

import numpy as np
import torch

from u2netp_material_candidate import load_material_candidate, module
from u2netp_material_training import material_training
from u2netp_adaptation import frozen_hash
from real_materials_learning import joint_material_loss
from material_pilot import evaluate_materials
from preserved_candidate import pinned
from data import digest


def complete_draws(real_count, synthetic_count, epochs, seed):
    if real_count < 1 or synthetic_count < 1 or synthetic_count % real_count or epochs < 1:
        raise ValueError('Require complete real and synthetic epochs')
    rng = np.random.default_rng(seed); draws = []
    for epoch in range(epochs):
        real = np.concatenate([rng.permutation(real_count) for _ in range(synthetic_count//real_count)])
        synthetic = rng.permutation(synthetic_count)
        draws.extend({'real': int(r), 'synthetic': int(s), 'epoch': epoch,
                      'flips': (rng.random(2) < .5).tolist()} for r, s in zip(real, synthetic))
    assert Counter(d['synthetic'] for d in draws) == {i: epochs for i in range(synthetic_count)}
    assert Counter(d['real'] for d in draws) == {i: epochs*synthetic_count//real_count for i in range(real_count)}
    return draws


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(); plan_bytes = args.plan.read_bytes(); plan = json.loads(plan_bytes); p = plan['protocol']
    assert plan['schema'] == 'u2netp-material-training-plan-1' and p['threads'] == 1 and p['resolution'] == 320
    assert p['batchSize'] == 2 and p['realPerBatch'] == 1
    if shutil.disk_usage('.').free < plan['resources']['minimumFreeGiB']*1024**3:
        raise ValueError('Insufficient free disk')
    parent_file = pinned(plan['parentCandidate'])
    torch.set_num_threads(1); torch.set_num_interop_threads(1); torch.manual_seed(p['seed'])
    model, old_plan, parent, reference = load_material_candidate(parent_file.parent)
    for key in ['trainIds', 'source', 'checkpoint', 'bodyReport', 'sourceManifest', 'annotations', 'evaluation', 'syntheticParent', 'printedReplay']:
        if plan[key] != old_plan[key]: raise ValueError('Continuation changed input or source split: '+key)
    assert p['materialInput'] == old_plan['protocol']['materialInput'] == 'body-relative-rgb'
    loader = module(Path(plan['source']['path']).parent/'data_loader.py', 'continued_material_input')
    helper = module(Path(__file__).with_name('train-u2netp-material.py'), 'continued_material_helpers')
    real, synthetic, separation = material_training(plan, loader.RescaleT(320), loader.ToTensorLab(flag=0))
    evidence = [{'id': i['id'], **i['evidence'], 'inputTensorSha256': digest(i['input'].numpy().tobytes())} for i in real+synthetic]
    assert evidence == parent['trainingInputs']
    initial = helper.predict(model, real)
    assert evaluate_materials(initial, real) == parent['trainingMetrics']['final']
    model.train(); frozen = frozen_hash(model)
    draws = complete_draws(len(real), len(synthetic), p['completeEpochs'], p['seed'])
    assert len(draws) == p['updates']
    hashes = dict(parent['sourceHashes'])
    for file in [Path(__file__), Path(__file__).with_name('u2netp_material_candidate.py')]: hashes[str(file)] = digest(file.read_bytes())
    report = {'schema': 'u2netp-material-training-1', 'status': 'training',
              'plan': {'path': str(args.plan), 'sha256': digest(plan_bytes)}, 'parentTraining': reference,
              'sourceHashes': hashes, 'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
              'sourceSeparation': separation, 'initialFrozenStateSha256': frozen,
              'materialInput': p['materialInput'], 'initialHeadCheckpointSha256': parent['checkpointSha256'],
              'initialHeadSha256': digest(b''.join(k.encode()+v.detach().numpy().tobytes() for k, v in sorted(model.state_dict().items()) if not k.startswith('body.'))),
              'parameters': parent['parameters'], 'trainableParameters': parent['trainableParameters'],
              'trainingInputs': evidence, 'draws': draws, 'history': [], 'scope': plan['scope'],
              'runtime': {'torch': torch.__version__, 'device': 'cpu', 'threads': 1},
              'optimizer': 'Fresh AdamW with declared learning rate/weight decay; parent optimizer state was not stored.',
              'parentUpdates': len(parent['history']), 'totalUpdatesAfterContinuation': len(parent['history'])+len(draws)}
    args.output.mkdir(parents=True, exist_ok=False)
    def save():
        for file, sha in hashes.items(): pinned({'path': file, 'sha256': sha})
        pinned(report['plan']); pinned(reference)
        for key in ['sourceManifest', 'annotations', 'evaluation', 'syntheticParent', 'source', 'checkpoint', 'bodyReport']: pinned(plan[key])
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    trainable = [x for x in model.parameters() if x.requires_grad]
    optimizer = torch.optim.AdamW(trainable, lr=p['learningRate'], weight_decay=p['weightDecay'])
    started = time.perf_counter(); save()
    for step, draw in enumerate(draws):
        batch = [real[draw['real']], synthetic[draw['synthetic']]]
        rgb = torch.stack([i['input'] for i in batch])
        bodies = torch.from_numpy(np.stack([i['body'] for i in batch]))
        materials = torch.from_numpy(np.stack([i['materials'] for i in batch])).float()
        for enabled, axis in zip(draw['flips'], [-1, -2]):
            if enabled: rgb, bodies, materials = rgb.flip(axis), bodies.flip(axis), materials.flip(axis)
        optimizer.zero_grad(set_to_none=True); loss = joint_material_loss(model(rgb), bodies, materials)
        if not torch.isfinite(loss): raise ValueError('Nonfinite continuation loss')
        loss.backward(); torch.nn.utils.clip_grad_norm_(trainable, 5); optimizer.step()
        report['history'].append(float(loss.detach()))
        if (step+1) % 32 == 0:
            assert frozen_hash(model) == frozen; save()
            print(json.dumps({'step': step+1, 'loss': report['history'][-1], 'seconds': time.perf_counter()-started}), flush=True)
    final = helper.predict(model, real)
    if not np.array_equal(initial[:, 0], final[:, 0]) or frozen_hash(model) != frozen:
        raise ValueError('Continuation changed parent body')
    torch.save({k: v for k, v in model.state_dict().items() if not k.startswith('body.')}, args.output/'identity.pt')
    np.savez_compressed(args.output/'training-predictions.npz', ids=np.array([i['id'] for i in real]), body=final[:, 0], initial=initial[:, 1], final=final[:, 1])
    helper.review(real, final, args.output)
    report.update(status='complete', seconds=time.perf_counter()-started, frozenBodyExact=True,
                  trainingMetrics={'initial': evaluate_materials(initial, real), 'final': evaluate_materials(final, real)},
                  checkpointSha256=digest((args.output/'identity.pt').read_bytes()))
    report['artifacts'] = {f.name: digest(f.read_bytes()) for f in args.output.iterdir() if f.name != 'report.json' and f.is_file()}
    report['artifactBytes'] = sum(f.stat().st_size for f in args.output.iterdir() if f.is_file())
    if report['artifactBytes'] > plan['resources']['maxArtifactMiB']*1024**2: raise ValueError('Artifact budget exceeded')
    save(); print(json.dumps({'status': 'complete', 'seconds': report['seconds'], 'metrics': report['trainingMetrics']['final']['macroMean']}), flush=True)


if __name__ == '__main__': main()
