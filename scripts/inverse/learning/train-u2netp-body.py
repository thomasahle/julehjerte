"""Fixed-budget whole-paper adaptation; evaluation photographs are never opened."""
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

from data import digest
from preserved_candidate import pinned
from real_foreground import masked_foreground_loss, known_region_metrics
from u2netp_adaptation import (freeze_encoder, frozen_hash, fused_logits, normalize_scores,
                              real_training, synthetic_training)


def module(file, name):
    spec = importlib.util.spec_from_file_location(name, file)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result


def predict(model, items):
    with torch.no_grad():
        return np.stack([normalize_scores(model(i['input'][None])[0])[0, 0].numpy() for i in items])


def review(items, initial, final, output):
    for start in range(0, len(items), 4):
        selected = items[start:start+4]; n = 320
        image = Image.new('RGB', (4*n, len(selected)*(n+28)), 'white'); pen = ImageDraw.Draw(image)
        for index, item in enumerate(selected):
            labels = item['labels']; overlay = np.full((n, n, 3), 130, np.uint8)
            overlay[labels == 0] = 0; overlay[labels == 1] = [255, 255, 255]
            with Image.open(item['evidence']['photo']) as photo:
                rgb = ImageOps.exif_transpose(photo).convert('RGB').resize((n, n), Image.Resampling.BILINEAR)
            panels = [rgb, Image.fromarray(overlay), Image.fromarray(np.uint8(initial[start+index]*255)),
                      Image.fromarray(np.uint8(final[start+index]*255))]
            for col, panel in enumerate(panels): image.paste(panel, (col*n, index*(n+28)))
            pen.text((4, index*(n+28)+n+3), item['id']+' / photo, reviewed body, initial, final', fill='black')
        image.save(output/('training-'+str(start//4+1)+'.jpg'), quality=88)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(); plan_bytes = args.plan.read_bytes(); plan = json.loads(plan_bytes)
    if plan['schema'] != 'u2netp-body-adaptation-plan-1': raise ValueError('Unexpected training plan')
    p = plan['protocol']
    if p['threads'] != 1 or p['batchSize'] != 2 or p['realPerBatch'] != 1 or p['resolution'] != 320:
        raise ValueError('Require bounded single-thread mixed protocol')
    if shutil.disk_usage('.').free < plan['resources']['minimumFreeGiB']*1024**3:
        raise ValueError('Insufficient free disk')
    torch.set_num_threads(1); torch.set_num_interop_threads(1); torch.manual_seed(p['seed'])
    source_file = pinned(plan['source']); source = json.loads(source_file.read_bytes()); upstream = source_file.parent
    for row in source['files']: pinned({'path': str(upstream/row['path']), 'sha256': row['sha256']})
    import skimage
    if skimage.__version__ != p['skimage']: raise ValueError('Changed upstream input implementation')
    loader = module(upstream/'data_loader.py', 'u2netp_body_data')
    architecture = module(upstream/'model/u2net.py', 'u2netp_body_model')
    rescale, normalize = loader.RescaleT(320), loader.ToTensorLab(flag=0)
    model = architecture.U2NETP(3, 1)
    model.load_state_dict(torch.load(pinned(plan['checkpoint']), map_location='cpu', weights_only=True), strict=True)
    trainable = freeze_encoder(model); initial_frozen = frozen_hash(model)
    real, separation = real_training(plan, rescale, normalize)
    synthetic = synthetic_training(plan, rescale, normalize)
    initial = predict(model, real)
    source = Path(__file__).parent
    dependencies = [Path(__file__)]+[source/f for f in ['u2netp_adaptation.py', 'preserved_candidate.py',
        'real_foreground.py', 'foreground.py', 'data.py']]
    dependencies += [source.parent/'datasets'/f for f in ['real_annotations.py', 'real_materials.py']]
    hashes = {str(f): digest(f.read_bytes()) for f in dependencies}
    rng = np.random.default_rng(p['seed'])
    draws = [{'synthetic': int(rng.integers(len(synthetic))), 'real': int(rng.integers(len(real))),
              'flips': (rng.random(2) < .5).tolist()} for _ in range(p['updates'])]
    report = {'schema': 'u2netp-body-adaptation-1', 'status': 'training',
              'plan': {'path': str(args.plan), 'sha256': digest(plan_bytes)}, 'sourceHashes': hashes,
              'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
              'sourceSeparation': separation, 'initialFrozenStateSha256': initial_frozen,
              'parameters': sum(x.numel() for x in model.parameters()), 'trainableParameters': trainable,
              'runtime': {'torch': torch.__version__, 'skimage': skimage.__version__, 'threads': 1, 'device': 'cpu'},
              'trainingInputs': [{'id': i['id'], **i['evidence'], 'inputTensorSha256': digest(i['input'].numpy().tobytes())}
                                 for i in real+synthetic], 'draws': draws, 'history': [], 'sampledIds': [],
              'scope': plan['scope']}
    args.output.mkdir(parents=True, exist_ok=False)
    def save():
        for file, expected in hashes.items(): pinned({'path': file, 'sha256': expected})
        if digest(args.plan.read_bytes()) != report['plan']['sha256']: raise ValueError('Training plan changed')
        for key in ['sourceManifest', 'annotations', 'evaluation', 'syntheticParent', 'source', 'checkpoint']:
            pinned(plan[key])
        temporary = args.output/'report.writing.json'
        temporary.write_text(json.dumps(report, indent=2)+'\n'); temporary.replace(args.output/'report.json')
    optimizer = torch.optim.AdamW([x for x in model.parameters() if x.requires_grad], lr=p['learningRate'], weight_decay=p['weightDecay'])
    started = time.perf_counter(); save()
    try:
        for step, draw in enumerate(draws):
            batch = [synthetic[draw['synthetic']], real[draw['real']]]
            rgb = torch.stack([i['input'] for i in batch])
            labels = np.stack([i['labels'] for i in batch])[:, None]
            target = torch.from_numpy((labels == 1).astype(np.float32))
            weight = torch.from_numpy((labels != 255).astype(np.float32))
            for enabled, axis in zip(draw['flips'], [-1, -2]):
                if enabled: rgb, target, weight = rgb.flip(axis), target.flip(axis), weight.flip(axis)
            optimizer.zero_grad(set_to_none=True)
            loss = masked_foreground_loss(fused_logits(model, rgb), target, weight)
            if not torch.isfinite(loss): raise ValueError('Nonfinite training loss')
            loss.backward(); torch.nn.utils.clip_grad_norm_([x for x in model.parameters() if x.requires_grad], 5)
            optimizer.step(); report['history'].append(float(loss.detach()))
            report['sampledIds'].append([i['id'] for i in batch])
            if (step+1) % 20 == 0:
                if frozen_hash(model) != initial_frozen: raise ValueError('Frozen encoder or statistics changed')
                save(); print(json.dumps({'step': step+1, 'loss': report['history'][-1], 'seconds': time.perf_counter()-started}), flush=True)
        if frozen_hash(model) != initial_frozen: raise ValueError('Frozen encoder or statistics changed')
        final = predict(model, real)
        if np.array_equal(initial, final): raise ValueError('Decoder did not learn')
        metrics_items = [{'id': i['id'], 'target': (i['labels'] == 1).astype(np.float32),
                          'weight': (i['labels'] != 255).astype(np.float32)} for i in real]
        torch.save(model.state_dict(), args.output/'model.pt')
        np.savez_compressed(args.output/'training-predictions.npz', ids=np.array([i['id'] for i in real]), initial=initial, final=final)
        review(real, initial, final, args.output)
        report.update(status='complete', seconds=time.perf_counter()-started, updates=len(draws),
                      frozenStateUnchanged=True, trainingMetrics={'initial': known_region_metrics(initial, metrics_items),
                                                                 'final': known_region_metrics(final, metrics_items)},
                      checkpointSha256=digest((args.output/'model.pt').read_bytes()))
        report['artifacts'] = {f.name: digest(f.read_bytes()) for f in args.output.iterdir() if f.is_file() and f.name != 'report.json'}
        report['artifactBytes'] = sum(f.stat().st_size for f in args.output.iterdir() if f.is_file())
        if report['artifactBytes'] > plan['resources']['maxArtifactMiB']*1024**2: raise ValueError('Artifact budget exceeded')
        save(); print(json.dumps({'status': 'complete', 'seconds': report['seconds'], 'trainingMean': report['trainingMetrics']['final']['macroMean']}), flush=True)
    except Exception as error:
        report.update(status='failed', error=str(error)); save(); raise


if __name__ == '__main__': main()
