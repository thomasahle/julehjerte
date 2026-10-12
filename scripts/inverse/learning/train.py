"""Reproducible synthetic-only boundary/junction ablation; never changes the app."""
import argparse
import json
import platform
import subprocess
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt
import torch

from data import Corpus, digest, detect_nodes, point_counts, scores
from model import ProposalNet, heatmap_loss


def boundary_counts(predicted, target, valid, tolerance=3):
    predicted, target = predicted & valid, target & valid
    near_target = distance_transform_edt(~target) <= tolerance if target.any() else np.zeros_like(target)
    near_prediction = distance_transform_edt(~predicted) <= tolerance if predicted.any() else np.zeros_like(predicted)
    return [int((predicted & near_target).sum()), int(predicted.sum()), int((target & near_prediction).sum()), int(target.sum())]


def boundary_scores(counts):
    matched_p, predicted, matched_t, target = counts
    precision = matched_p/predicted if predicted else float(target == 0)
    recall = matched_t/target if target else float(predicted == 0)
    return {'precision': precision, 'recall': recall, 'f1': 2*precision*recall/(precision+recall) if precision+recall else 0,
            'matchedPredictionPixels': int(matched_p), 'predictionPixels': int(predicted), 'matchedTargetPixels': int(matched_t), 'targetPixels': int(target)}


def evaluate(items, predictions=None, thresholds=(.5, .25)):
    boundary_total, node_total, rows = np.zeros(4, np.int64), np.zeros(3, np.int64), []
    for i, item in enumerate(items):
        if predictions is None:
            boundary, nodes = item['baselineBoundary'], item['baselineNodes']
        else:
            boundary = predictions[i][0] >= thresholds[0]
            nodes = detect_nodes(predictions[i][1]*item['valid'], thresholds[1])
        b = boundary_counts(boundary, item['boundary'], item['valid'])
        j = point_counts(nodes, item['nodes'])
        boundary_total += b; node_total += j
        rows.append({'id': item['id'], 'boundary': boundary_scores(b), 'junctions': scores(j)})
    return {'boundary': boundary_scores(boundary_total), 'junctions': scores(node_total),
            'macroBoundaryF1': float(np.mean([r['boundary']['f1'] for r in rows])),
            'macroJunctionF1': float(np.mean([r['junctions']['f1'] for r in rows])), 'rows': rows}


def tensors(items, device):
    # NumPy can preserve an HWC-like stride pattern when stacking transposed
    # views. MPS convolution backward requires a contiguous NCHW input here.
    rgb = torch.from_numpy(np.ascontiguousarray(np.stack([i['rgb'].transpose(2, 0, 1) for i in items]))).to(device, dtype=torch.float32)/255
    mask = torch.from_numpy(np.stack([i['mask'][None] for i in items])).to(device)
    target = torch.from_numpy(np.stack([i['target'] for i in items])).to(device)
    valid = torch.from_numpy(np.stack([i['valid'][None] for i in items])).to(device, dtype=torch.float32)
    return rgb, mask, target, valid


def synchronize(device):
    if device.type == 'mps':
        torch.mps.synchronize()
    elif device.type == 'cuda':
        torch.cuda.synchronize()


def infer(model, items, device, batch_size, return_predictions=True):
    model.eval(); total = 0; predictions = []
    with torch.no_grad():
        for start in range(0, len(items), batch_size):
            batch = items[start:start+batch_size]
            rgb, mask, target, valid = tensors(batch, device)
            logits = model(rgb, mask)
            total += float(heatmap_loss(logits, target, valid).cpu())*len(batch)
            if return_predictions:
                predictions.extend(torch.sigmoid(logits).cpu().numpy().astype(np.float16))
    return total/max(1, len(items)), predictions


def comparison_sheet(items, predictions, thresholds, file):
    n = 256; sheet = Image.new('RGB', (4*n, len(items)*(n+24)), 'white'); draw = ImageDraw.Draw(sheet)
    for row, (item, pred) in enumerate(zip(items, predictions)):
        truth = item['rgb'].copy(); baseline = truth.copy(); learned = truth.copy()
        truth[item['boundary'] & item['valid']] = [0, 230, 90]
        baseline[item['baselineBoundary'] & item['valid']] = [255, 40, 40]
        learned[(pred[0] >= thresholds[0]) & item['valid']] = [255, 40, 40]
        panels = [Image.fromarray(item['rgb']), Image.fromarray(truth), Image.fromarray(baseline), Image.fromarray(learned)]
        node_sets = [[], item['nodes'], item['baselineNodes'], detect_nodes(pred[1]*item['valid'], thresholds[1])]
        for col, (panel, nodes) in enumerate(zip(panels, node_sets)):
            pen = ImageDraw.Draw(panel)
            for x, y in nodes: pen.ellipse([x-3, y-3, x+3, y+3], outline=(0, 160, 255), width=2)
            sheet.paste(panel.resize((n, n)), (col*n, row*(n+24)))
        draw.text((3, row*(n+24)+n+3), item['id']+' | input / reference / production trace / learned', fill='black')
    sheet.save(file)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepared', default='tmp/heart-learning/prepared-v1')
    parser.add_argument('--output', required=True)
    parser.add_argument('--initialization', choices=['random', 'imagenet'], required=True)
    parser.add_argument('--epochs', type=int, default=20)
    parser.add_argument('--batch-size', type=int, default=8)
    parser.add_argument('--seed', type=int, default=1729)
    parser.add_argument('--device', choices=['cpu', 'mps', 'cuda'], default='mps')
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1:
        raise ValueError('Epochs and batch size must be positive')
    output = Path(args.output); output.mkdir(parents=True, exist_ok=False)
    torch.set_num_threads(2); torch.set_num_interop_threads(1)
    torch.manual_seed(args.seed); rng = np.random.default_rng(args.seed)
    device = torch.device(args.device)
    code = Path(__file__).parent
    report = {'schema': 'heart-boundary-learning-1', 'status': 'loading', 'arguments': vars(args),
              'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
              'sourceHashes': {p.name: digest(p.read_bytes()) for p in code.glob('*.py')},
              'runtime': {'python': platform.python_version(), 'torch': torch.__version__, 'device': str(device), 'threads': 2},
              'limitations': ['Synthetic-only component experiment, not an end-to-end solver benchmark.',
                              'Recipe holdouts share simplified routing topologies with training; real-photo generalization is untested.',
                              'Known overlap validity masks define supervision/scoring regions, but are not network inputs.',
                              'Only visible corners/branches are junction targets. Smooth degree-two knots, boundary endpoints and unobservable shared-cut anchors are not targets.',
                              'Native PyTorch timings do not establish ONNX/browser speed.', 'Fixed seeds are recorded; exact MPS training determinism is not claimed.'],
              'history': []}
    def save():
        temp = output/'report.writing.json'; temp.write_text(json.dumps(report, indent=2)+'\n'); temp.replace(output/'report.json')
    save()
    try:
        started = time.perf_counter(); corpus = Corpus(args.prepared)
        items = []
        for row in corpus.rows:
            items.append(corpus.load(row))
            if len(items) % 32 == 0: print('loaded', len(items), '/', len(corpus.rows), flush=True)
        report['dataPreparationSeconds'] = time.perf_counter()-started
        report['preparedManifestSha256'] = digest((corpus.root/'manifest.json').read_bytes())
        report['datasetManifestSha256'] = corpus.prepared['datasetManifestSha256']
        report['splits'] = {s: {'views': sum(i['split'] == s for i in items), 'designs': sorted({i['designId'] for i in items if i['split'] == s})} for s in sorted({i['split'] for i in items})}
        splits = {s: [i for i in items if i['split'] == s] for s in report['splits']}
        report['baseline'] = {s: evaluate(v) for s, v in splits.items()}
        # Both initializations construct the same random decoder before training;
        # loading encoder weights does not advance the random generator.
        model = ProposalNet(args.initialization, 'tmp/heart-training-models/torchvision').to(device)
        report['initialization'] = model.initialization
        report['parameters'] = sum(p.numel() for p in model.parameters())
        optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=1e-4)
        report['optimizer'] = {'name': 'AdamW', 'learningRate': 3e-4, 'weightDecay': 1e-4}
        best = float('inf'); report['status'] = 'training'; save()
        for epoch in range(args.epochs):
            epoch_start = time.perf_counter(); model.train(); total = 0
            order = rng.permutation(len(splits['train']))
            for start in range(0, len(order), args.batch_size):
                batch = [splits['train'][i] for i in order[start:start+args.batch_size]]
                rgb, mask, target, valid = tensors(batch, device)
                # Joint reflections are label-preserving and keep every view in
                # its source-design split. No test/validation image is augmented into train.
                if rng.random() < .5: rgb, mask, target, valid = [x.flip(-1) for x in [rgb, mask, target, valid]]
                if rng.random() < .5: rgb, mask, target, valid = [x.flip(-2) for x in [rgb, mask, target, valid]]
                optimizer.zero_grad(set_to_none=True)
                loss = heatmap_loss(model(rgb, mask), target, valid)
                if not torch.isfinite(loss): raise ValueError('Nonfinite training loss')
                loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 5); optimizer.step()
                total += float(loss.detach().cpu())*len(batch)
            development_loss, _ = infer(model, splits['development'], device, args.batch_size, False)
            entry = {'epoch': epoch+1, 'trainLoss': total/len(order), 'developmentLoss': development_loss, 'seconds': time.perf_counter()-epoch_start}
            report['history'].append(entry)
            if development_loss < best:
                best = development_loss; report['selectedEpoch'] = epoch+1
                torch.save({k: v.detach().cpu() for k, v in model.state_dict().items()}, output/'model.pt')
            save(); print(json.dumps(entry), flush=True)
        model.load_state_dict(torch.load(output/'model.pt', map_location=device, weights_only=True))
        _, dev_predictions = infer(model, splits['development'], device, args.batch_size)
        # Thresholds are selected only on the held-out in-recipe development
        # designs. Recipe validation/test rows remain untouched until this point.
        candidates = [.1, .2, .3, .4, .5, .6, .7]
        threshold_scores = []
        for threshold in candidates:
            metrics = evaluate(splits['development'], dev_predictions, (threshold, threshold))
            threshold_scores.append({'threshold': threshold, 'boundaryF1': metrics['boundary']['f1'], 'junctionF1': metrics['junctions']['f1']})
        thresholds = (max(threshold_scores, key=lambda r: r['boundaryF1'])['threshold'], max(threshold_scores, key=lambda r: r['junctionF1'])['threshold'])
        report['thresholdSearch'] = threshold_scores; report['selectedThresholds'] = thresholds
        report['learned'] = {}; report['status'] = 'evaluating'; save()
        for split, subset in splits.items():
            _, predictions = infer(model, subset, device, args.batch_size)
            report['learned'][split] = evaluate(subset, predictions, thresholds)
            comparison_sheet(subset[:6], predictions[:6], thresholds, output/(split+'-comparison.png'))
            save()
        # Warm, native batch-one inference includes output transfer, excludes
        # preprocessing/decoding. This is explicitly not a whole-solver time.
        rgb, mask, _, _ = tensors(splits['development'][:1], device)
        durations = []
        with torch.no_grad():
            for i in range(15):
                synchronize(device); started = time.perf_counter()
                model(rgb, mask).cpu(); synchronize(device)
                if i >= 5: durations.append(time.perf_counter()-started)
        report['nativeInferenceSeconds'] = {'median': float(np.median(durations)), 'samples': durations, 'scope': 'Warm native batch-one forward plus CPU output transfer, excluding input preprocessing'}
        report['checkpointSha256'] = digest((output/'model.pt').read_bytes())
        report['status'] = 'complete'; save()
        print(json.dumps({s: {'baseline': {k: report['baseline'][s][k]['f1'] for k in ['boundary', 'junctions']}, 'learned': {k: report['learned'][s][k]['f1'] for k in ['boundary', 'junctions']}} for s in splits}), flush=True)
    except Exception as error:
        report['status'] = 'failed'; report['error'] = str(error); save(); raise


if __name__ == '__main__':
    main()
