"""Train only a small paper-identity head on immutable U2NETP body features."""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import time

import numpy as np
from PIL import Image, ImageDraw, ImageOps
import torch

from u2netp_material import U2NetPaperIdentity
from u2netp_material_training import material_training
from u2netp_adaptation import frozen_hash, normalize_scores
from preserved_candidate import pinned
from real_materials_learning import joint_material_loss
from material_pilot import evaluate_materials
from data import digest


def module(file, name):
    spec = importlib.util.spec_from_file_location(name, file)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result


def predict(model, items):
    with torch.no_grad():
        rows = []
        for item in items:
            logits = model(item['input'][None])
            rows.append(torch.cat([normalize_scores(logits[:, :1].sigmoid()), logits[:, 1:].sigmoid()], dim=1)[0].numpy())
        return np.stack(rows)


def review(items, predictions, output):
    n = 320
    for start in range(0, len(items), 4):
        selected = items[start:start+4]
        panel = Image.new('RGB', (n*4, len(selected)*(n+24)), 'white'); pen = ImageDraw.Draw(panel)
        for j, item in enumerate(selected):
            with Image.open(item['evidence']['photo']) as photo:
                rgb = ImageOps.exif_transpose(photo).convert('RGB').resize((n, n), Image.Resampling.BILINEAR)
            labels = np.full((n, n, 3), 130, np.uint8)
            labels[item['materials'] == 0] = [255, 130, 0]; labels[item['materials'] == 1] = [0, 200, 255]
            body, identity = predictions[start+j]
            images = [rgb, Image.fromarray(labels), Image.fromarray(np.uint8(body*255)), Image.fromarray(np.uint8(identity*255))]
            for col, image in enumerate(images): panel.paste(image, (col*n, j*(n+24)))
            pen.text((4, j*(n+24)+n+3), item['id']+' / source, partial identity labels, frozen body, learned identity', fill='black')
        panel.save(output/('training-'+str(start//4+1)+'.jpg'), quality=88)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True); parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(); plan_bytes = args.plan.read_bytes(); plan = json.loads(plan_bytes); p = plan['protocol']
    if plan['schema'] != 'u2netp-material-training-plan-1' or p['threads'] != 1 or p['batchSize'] != 2 or p['resolution'] != 320:
        raise ValueError('Unexpected bounded training protocol')
    if shutil.disk_usage('.').free < plan['resources']['minimumFreeGiB']*1024**3:
        raise ValueError('Insufficient free disk')
    torch.set_num_threads(1); torch.set_num_interop_threads(1); torch.manual_seed(p['seed'])
    source_file = pinned(plan['source']); source = json.loads(source_file.read_bytes()); upstream = source_file.parent
    for row in source['files']: pinned({'path': str(upstream/row['path']), 'sha256': row['sha256']})
    parent = json.loads(pinned(plan['bodyReport']).read_bytes())
    if parent['status'] != 'complete' or parent['checkpointSha256'] != plan['checkpoint']['sha256']:
        raise ValueError('Changed adapted body parent')
    import skimage
    if skimage.__version__ != p['skimage']: raise ValueError('Changed publisher preprocessing')
    loader = module(upstream/'data_loader.py', 'u2netp_identity_data')
    architecture = module(upstream/'model/u2net.py', 'u2netp_identity_model')
    body = architecture.U2NETP(3, 1).eval()
    body.load_state_dict(torch.load(pinned(plan['checkpoint']), map_location='cpu', weights_only=True), strict=True)
    model = U2NetPaperIdentity(body).train(); frozen = frozen_hash(model)
    real, synthetic, separation = material_training(plan, loader.RescaleT(320), loader.ToTensorLab(flag=0))
    initial = predict(model, real)
    with torch.no_grad():
        for item, prediction in zip(real, initial):
            expected = normalize_scores(body(item['input'][None])[0])[0, 0].numpy()
            if not np.array_equal(expected, prediction[0]): raise ValueError('Wrapper changed parent body prediction')
    del body
    sources = [Path(__file__)]+[Path(__file__).parent/name for name in ['u2netp_material.py', 'u2netp_material_training.py',
        'u2netp_adaptation.py', 'real_materials_learning.py', 'material_pilot.py', 'material_metrics.py',
        'preserved_candidate.py', 'real_foreground.py', 'foreground.py', 'data.py']]
    sources += [Path(__file__).parent.parent/'datasets'/name for name in ['real_annotations.py', 'real_materials.py']]
    hashes = {str(file): digest(file.read_bytes()) for file in sources}
    rng = np.random.default_rng(p['seed'])
    draws = [{'real': int(rng.integers(len(real))), 'synthetic': int(rng.integers(len(synthetic))),
              'flips': (rng.random(2) < .5).tolist()} for _ in range(p['updates'])]
    report = {'schema': 'u2netp-material-training-1', 'status': 'training',
              'plan': {'path': str(args.plan), 'sha256': digest(plan_bytes)}, 'sourceHashes': hashes,
              'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
              'sourceSeparation': separation, 'initialFrozenStateSha256': frozen,
              'parameters': sum(x.numel() for x in model.parameters()),
              'trainableParameters': sum(x.numel() for x in model.parameters() if x.requires_grad),
              'trainingInputs': [{'id': i['id'], **i['evidence'], 'inputTensorSha256': digest(i['input'].numpy().tobytes())}
                                 for i in real+synthetic], 'draws': draws, 'history': [],
              'scope': plan['scope'], 'runtime': {'torch': torch.__version__, 'device': 'cpu', 'threads': 1}}
    args.output.mkdir(parents=True, exist_ok=False)
    def save():
        for file, sha in hashes.items(): pinned({'path': file, 'sha256': sha})
        if digest(args.plan.read_bytes()) != report['plan']['sha256']: raise ValueError('Training plan changed')
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
        optimizer.zero_grad(set_to_none=True)
        loss = joint_material_loss(model(rgb), bodies, materials)
        if not torch.isfinite(loss): raise ValueError('Nonfinite material loss')
        loss.backward(); torch.nn.utils.clip_grad_norm_(trainable, 5); optimizer.step()
        report['history'].append(float(loss.detach()))
        if (step+1) % 20 == 0:
            if frozen_hash(model) != frozen: raise ValueError('Body parameters or statistics changed')
            save(); print(json.dumps({'step': step+1, 'loss': report['history'][-1], 'seconds': time.perf_counter()-started}), flush=True)
    final = predict(model, real)
    if not np.array_equal(initial[:, 0], final[:, 0]) or frozen_hash(model) != frozen:
        raise ValueError('Training changed parent body predictions')
    if np.array_equal(initial[:, 1], final[:, 1]): raise ValueError('Material head did not learn')
    # Keep only the small new head; the body checkpoint already exists and is pinned.
    torch.save({k: v for k, v in model.state_dict().items() if not k.startswith('body.')}, args.output/'identity.pt')
    np.savez_compressed(args.output/'training-predictions.npz', ids=np.array([i['id'] for i in real]), body=final[:, 0], initial=initial[:, 1], final=final[:, 1])
    review(real, final, args.output)
    report.update(status='complete', seconds=time.perf_counter()-started, frozenBodyExact=True,
                  trainingMetrics={'initial': evaluate_materials(initial, real), 'final': evaluate_materials(final, real)},
                  checkpointSha256=digest((args.output/'identity.pt').read_bytes()))
    report['artifacts'] = {f.name: digest(f.read_bytes()) for f in args.output.iterdir() if f.name != 'report.json' and f.is_file()}
    report['artifactBytes'] = sum(f.stat().st_size for f in args.output.iterdir() if f.is_file())
    if report['artifactBytes'] > plan['resources']['maxArtifactMiB']*1024**2: raise ValueError('Artifact budget exceeded')
    save(); print(json.dumps({'status': 'complete', 'seconds': report['seconds'], 'training': report['trainingMetrics']['final']['macroMean']}), flush=True)


if __name__ == '__main__': main()
