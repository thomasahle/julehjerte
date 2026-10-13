"""Train an RGB-only paper foreground model on verified procedural photos."""
import argparse
import json
import platform
import subprocess
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
import torch

from data import digest
from foreground import ForegroundCorpus, ForegroundNet, foreground_loss, foreground_metrics, infer, tensors
from foreground_augments import training_variants


def comparison(items, predictions, output):
    n = items[0]['rgb'].shape[0]
    sheet = Image.new('RGB', (3*n, (n+24)*len(items)), 'white')
    pen = ImageDraw.Draw(sheet)
    for row, (item, probability) in enumerate(zip(items, predictions)):
        predicted, target = probability >= .5, item['target'] > .5
        error = item['rgb'].copy()
        error[predicted & ~target] = [255, 60, 30]
        error[target & ~predicted] = [30, 100, 255]
        panels = [item['rgb'], np.repeat((probability*255).astype(np.uint8)[..., None], 3, axis=2), error]
        for col, panel in enumerate(panels): sheet.paste(Image.fromarray(panel), (col*n, row*(n+24)))
        pen.text((3, row*(n+24)+n+3), item['viewId']+' | RGB / probability / false + red, false - blue', fill='black')
    sheet.save(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', action='append', required=True)
    parser.add_argument('--foreground', action='append', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--initialization', choices=['random', 'imagenet'], required=True)
    parser.add_argument('--checkpoint-directory', default='tmp/heart-training-models/torchvision')
    parser.add_argument('--training-probe', action='append', default=[], help='Controlled background variants; only original training views are allowed')
    parser.add_argument('--epochs', type=int, default=20)
    parser.add_argument('--batch-size', type=int, default=8)
    parser.add_argument('--seed', type=int, default=1729)
    parser.add_argument('--device', choices=['cpu', 'mps', 'cuda'], default='mps')
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 2: raise ValueError('Positive epochs and batch size >=2 required')
    output = Path(args.output); output.mkdir(parents=True, exist_ok=False)
    torch.set_num_threads(2); torch.set_num_interop_threads(1)
    torch.manual_seed(args.seed); rng = np.random.default_rng(args.seed)
    device = torch.device(args.device)
    report = {'schema': 'woven-heart-foreground-learning-1', 'status': 'loading', 'arguments': vars(args),
              'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
              'sourceHashes': {name: digest((Path(__file__).parent/name).read_bytes()) for name in ['foreground.py', 'foreground-train.py', 'foreground_augments.py', 'model.py', 'data.py']},
              'runtime': {'python': platform.python_version(), 'torch': torch.__version__, 'device': str(device), 'threads': 2},
              'policy': {'input': 'RGB only, 256 square, bilinear resize; no target, ROI corners or paper classifier input',
                         'label': 'Full physical paper occupancy at pixel centres, reprojected to network resolution',
                         'split': 'All views grouped globally by exact geometry. Every fifth sorted train geometry is development.',
                         'selection': 'Minimum development BCE+Dice. Recipe holdouts evaluated only after selection.',
                         'threshold': .5, 'augmentation': 'Joint independent horizontal/vertical reflections',
                         'realPhotosUsedForTraining': False, 'topologyDisjoint': False},
              'limitations': ['Single procedural heart on a simulated background; no real photograph supervision.',
                              'Recipe holdouts share routing topologies with training; not a topology-disjoint test.',
                              'Native inference timing does not establish browser/ONNX performance.',
                              'Exact MPS training determinism is not claimed.'], 'history': []}
    def save():
        file = output/'report.writing.json'; file.write_text(json.dumps(report, indent=2)+'\n'); file.replace(output/'report.json')
    save()
    try:
        started = time.perf_counter(); corpus = ForegroundCorpus(args.dataset, args.foreground)
        items = []
        for row in corpus.rows:
            items.append(corpus.load(row))
            if len(items) % 64 == 0: print('loaded', len(items), '/', len(corpus.rows), flush=True)
        report['sources'] = corpus.sources
        variants, report['trainingVariantSources'] = training_variants(corpus, items, args.training_probe)
        variant_rng = np.random.default_rng(args.seed+1009)
        report['variantSampling'] = {'seed': args.seed+1009, 'augmentedSourceViews': len(variants),
                                     'additionalViews': sum(len(v) for v in variants.values()),
                                     'policy': 'Choose uniformly between the original photograph and its available variants once per source view per epoch. Training order, reflection draws and update count are unchanged.'}
        report['dataPreparationSeconds'] = time.perf_counter()-started
        splits = {s: [i for i in items if i['split'] == s] for s in sorted({i['split'] for i in items})}
        report['splits'] = {s: {'views': len(v), 'geometryHashes': sorted({i['geometrySha256'] for i in v}), 'viewIds': [i['id'] for i in v]} for s, v in splits.items()}
        model = ForegroundNet(args.initialization, args.checkpoint_directory).to(device)
        report['initialization'] = model.initialization
        report['parameters'] = sum(p.numel() for p in model.parameters())
        optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=1e-4)
        report['optimizer'] = {'name': 'AdamW', 'learningRate': 3e-4, 'weightDecay': 1e-4, 'gradientNormClip': 5}
        best = float('inf'); report['status'] = 'training'; save()
        for epoch in range(args.epochs):
            started = time.perf_counter(); model.train(); total = 0.
            order = rng.permutation(len(splits['train']))
            # Avoid a singleton batch at the encoder's batch-normalization layers.
            batches = list(np.array_split(order, max(1, len(order)//args.batch_size)))
            for indices in batches:
                batch = []
                for i in indices:
                    base = splits['train'][i]; choices = [base, *variants.get(base['id'], [])]
                    batch.append(choices[variant_rng.integers(len(choices))] if len(choices) > 1 else base)
                rgb, target = tensors(batch, device)
                if rng.random() < .5: rgb, target = rgb.flip(-1), target.flip(-1)
                if rng.random() < .5: rgb, target = rgb.flip(-2), target.flip(-2)
                optimizer.zero_grad(set_to_none=True)
                loss = foreground_loss(model(rgb), target)
                if not torch.isfinite(loss): raise ValueError('Nonfinite foreground loss')
                loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 5); optimizer.step()
                total += float(loss.detach().cpu())*len(batch)
            development_loss, _ = infer(model, splits['development'], device, args.batch_size)
            entry = {'epoch': epoch+1, 'trainLoss': total/len(order), 'developmentLoss': development_loss,
                     'trainingViews': len(order), 'optimizerUpdates': len(batches), 'seconds': time.perf_counter()-started}
            report['history'].append(entry)
            if development_loss < best:
                best = development_loss; report['selectedEpoch'] = epoch+1
                temporary = output/'model.writing.pt'
                torch.save({k: v.detach().cpu() for k, v in model.state_dict().items()}, temporary)
                temporary.replace(output/'model.pt')
                report['checkpointSha256'] = digest((output/'model.pt').read_bytes())
            save(); print(json.dumps(entry), flush=True)
        model.load_state_dict(torch.load(output/'model.pt', map_location=device, weights_only=True))
        report['status'] = 'evaluating'; report['learned'] = {}; save()
        for split, subset in splits.items():
            loss, predictions = infer(model, subset, device, args.batch_size)
            metrics = foreground_metrics(predictions, subset); metrics['loss'] = loss
            report['learned'][split] = metrics
            # Archive probabilities at float32; later crop evaluation never reruns training.
            np.savez_compressed(output/(split+'-predictions.npz'), ids=np.array([i['id'] for i in subset]), probabilities=np.stack(predictions))
            comparison(subset[:6], predictions[:6], output/(split+'-comparison.png'))
            save(); print(split, json.dumps({k: v for k, v in metrics.items() if k != 'rows'}), flush=True)
        rgb, _ = tensors(splits['development'][:1], device); durations = []
        model.eval()
        with torch.no_grad():
            for i in range(15):
                started = time.perf_counter(); model(rgb).cpu()
                if i >= 5: durations.append(time.perf_counter()-started)
        report['nativeInferenceSeconds'] = {'median': float(np.median(durations)), 'samples': durations,
                                            'scope': 'Warm batch-one native forward plus CPU output transfer, excluding input preprocessing'}
        report['artifacts'] = {p.name: digest(p.read_bytes()) for p in sorted(output.iterdir()) if p.suffix in ['.png', '.npz', '.pt']}
        report['status'] = 'complete'; save()
    except Exception as error:
        report['status'] = 'failed'; report['error'] = str(error); save(); raise


if __name__ == '__main__': main()
