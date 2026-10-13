"""Audit grouped adaptation and export frozen probabilities for full replay."""
import argparse
import html
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
import torch

from data import digest
from foreground import load_foreground_run
from real_finetune import encoder_hash, grouped_folds, step_batch
from real_foreground import ROOT, known_region_metrics, load_real_labels


def aligned_npz(file, items):
    archive = np.load(file)
    ids = archive['ids'].tolist()
    if len(set(ids)) != len(ids) or set(ids) != {i['id'] for i in items}:
        raise ValueError('Prediction identities differ')
    return np.stack([archive['probabilities'][ids.index(i['id'])] for i in items])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--study', type=Path, required=True)
    parser.add_argument('--labels', type=Path, required=True)
    parser.add_argument('--initial-run', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    torch.set_num_threads(2)
    report_raw = (args.study/'report.json').read_bytes(); report = json.loads(report_raw)
    if report.get('status') != 'complete' or report.get('schema') != 'woven-heart-real-adaptation-1':
        raise ValueError('Require completed grouped adaptation')
    items, audit = load_real_labels(args.labels)
    if audit != report['labelsAudit'] or grouped_folds(items, audit, report['plan']) != report['folds']:
        raise ValueError('Labels or grouped assignments changed')
    for name, sha in report['sourceHashes'].items():
        if digest((Path(__file__).parent/name).read_bytes()) != sha:
            raise ValueError('Experiment implementation changed')
    for name, sha in report['artifacts'].items():
        if digest((args.study/name).read_bytes()) != sha:
            raise ValueError('Model or prediction artifact changed')
    model, original = load_foreground_run(args.initial_run)
    if original['checkpointSha256'] != report['initialCheckpointSha256'] or digest((args.initial_run/'report.json').read_bytes()) != report['initialReportSha256']:
        raise ValueError('Initialization changed')
    initial_encoder = encoder_hash(model)
    draws_raw = (args.study/'draws.json').read_bytes(); draws = json.loads(draws_raw)
    if digest(draws_raw) != report['drawsSha256'] or len(draws) != report['plan']['protocol']['updates']:
        raise ValueError('Training draw schedule changed')
    synthetic = [{'id': i} for r in report['syntheticReplay'] for i in [r['originalId'], r['sceneId']]]
    if len(synthetic) != 2*report['plan']['protocol']['syntheticReplayGeometries'] or any(r['split'] != 'train' for r in report['syntheticReplay']):
        raise ValueError('Replay count or train-only allocation changed')
    expected_inputs = [{'id': i['id'], 'rgbSha256': digest(i['rgb'].tobytes()), 'targetSha256': digest(i['target'].tobytes()),
                        'weightSha256': digest(i['weight'].tobytes()), 'splitGroupId': i['splitGroupId'], 'nearDuplicateGroup': i['nearDuplicateGroup'], 'motif': i['motif']} for i in items]
    if expected_inputs != report['inputs']:
        raise ValueError('Training/evaluation observations changed')
    by_id = {i['id']: i for i in items}; mixed = {}
    runs = [{'id': 'synthetic-control', 'train': [], 'heldOut': list(by_id)}]+report['folds']
    if set(report['runs']) != {r['id'] for r in runs}:
        raise ValueError('Missing or extra adaptation run')
    for fold in runs:
        name = fold['id']; run = report['runs'][name]
        if run['status'] != 'complete' or run['trainIds'] != fold['train'] or run['heldOutIds'] != fold['heldOut'] or run['updates'] != len(draws):
            raise ValueError('Incomplete or changed run allocation/budget')
        expected_draws = [[i['id'] for i in step_batch(d, synthetic, [by_id[i] for i in fold['train']])] for d in draws]
        if run['sampledIds'] != expected_draws or run['sampledIdsSha256'] != digest(json.dumps(expected_draws).encode()):
            raise ValueError('Sampled inputs differ from the fixed paired schedule')
        if any(set(batch) & set(fold['heldOut']) for batch in expected_draws):
            raise ValueError('Held-out example entered optimization')
        checkpoint = args.study/name/'model.pt'
        if digest(checkpoint.read_bytes()) != run['checkpointSha256']:
            raise ValueError('Saved checkpoint differs')
        model.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True))
        if encoder_hash(model) != initial_encoder or run['initialEncoderSha256'] != initial_encoder or run['finalEncoderSha256'] != initial_encoder:
            raise ValueError('Saved encoder parameters/statistics changed')
        subset = [by_id[i] for i in fold['heldOut']]
        predicted = aligned_npz(args.study/name/'predictions.npz', subset)
        if known_region_metrics(predicted, subset) != run['metrics']:
            raise ValueError('Reported held-out scores disagree with archived probabilities')
        if fold['train']:
            mixed.update({i['id']: p for i, p in zip(subset, predicted)})
    probabilities = {'frozen': aligned_npz(args.study/'frozen-predictions.npz', items),
                     'synthetic-control': aligned_npz(args.study/'synthetic-control/predictions.npz', items),
                     'real-out-of-fold': aligned_npz(args.study/'mixed-out-of-fold.npz', items)}
    if not np.array_equal(probabilities['real-out-of-fold'], np.stack([mixed[i['id']] for i in items])):
        raise ValueError('Out-of-fold aggregate differs from held-out-only predictions')
    if known_region_metrics(probabilities['frozen'], items) != report['frozenMetrics'] or known_region_metrics(probabilities['real-out-of-fold'], items) != report['mixedOutOfFoldMetrics']:
        raise ValueError('Frozen or aggregate scores disagree')
    args.output.mkdir(parents=True, exist_ok=False)
    result = {'schema': 'woven-heart-real-adaptation-audit-1', 'passed': True, 'reportSha256': digest(report_raw),
              'labelsAudit': audit, 'encoderSha256': initial_encoder, 'runs': len(runs), 'updatesPerRun': len(draws),
              'archivedArtifactsChecked': len(report['artifacts']), 'sourcePhotographsUsedOnlyInTheirTrainingFolds': True,
              'metrics': {k: known_region_metrics(v, items) for k, v in probabilities.items()}, 'boundaryBandDiagnostic': {},
              'scope': 'Grouped pilot development comparison. No deployment, exact-outline, unseen-test or complete-template claim.'}
    # Post-hoc diagnostic, not a checkpoint selector: known paper close to an
    # unknown/background pixel. This includes occlusion boundaries as well as
    # the outer outline and does not assert subpixel boundary ground truth.
    for method, predicted in probabilities.items():
        rows = []
        for item, probability in zip(items, predicted):
            paper = (item['target'] == 1) & (item['weight'] == 1)
            band = paper & (distance_transform_edt(paper) <= 5)
            rows.append({'id': item['id'], 'knownPaperPixels': int(band.sum()),
                         'missedFraction': float((probability[band] < .5).mean())})
        result['boundaryBandDiagnostic'][method] = {'widthPixels': 5, 'scope': 'Known paper within five 256-canvas pixels of unknown/background; includes occlusion boundaries.',
                                                    'macroMeanMissedFraction': float(np.mean([r['missedFraction'] for r in rows])), 'rows': rows}
    label_manifest = json.loads((args.labels/'manifest.json').read_text())
    label_rows = {r['id']: r for r in label_manifest['instances']}
    source_manifest = json.loads((ROOT/'docs/inverse/datasets/real-manifest.json').read_text())
    sources = {r['id']: r for r in source_manifest['assets']}
    probes = {}
    for method in probabilities:
        folder = args.output/('probe-'+method); folder.mkdir()
        probes[method] = {'schema': 'woven-heart-foreground-probe-1', 'status': 'complete', 'resolution': 256,
                          'scope': 'Ten annotated pilot photographs, full image with no selected ROI or supplied corners. Cached frozen or held-out-fold predictions. No inference-latency claim.',
                          'adaptationReportSha256': digest(report_raw), 'method': method, 'rows': []}
    sections = []
    for index, item in enumerate(items):
        identity = item['id']; meta = label_rows[identity]; source = sources[meta['assetId']]
        original_path = ROOT/source['localPath']
        if digest(original_path.read_bytes()) != source['sha256']:
            raise ValueError('Original source image changed')
        # Decode once to PNG so every downstream method sees identical RGB and
        # no implicit EXIF transform can disagree with annotation coordinates.
        file = args.output/(identity+'-original.png')
        with Image.open(original_path) as image: image.convert('RGB').save(file)
        photo_hash = digest(file.read_bytes())
        Image.fromarray(item['rgb']).save(args.output/(identity+'-input.png'))
        transform = meta['transform']; scale = transform['scale']; ox, oy = transform['offset']; n = transform['resolution']
        window = [-ox/scale, -oy/scale, (n-ox)/scale, (n-oy)/scale]
        sections.append('<section><h2>'+html.escape(item['motif']['candidateFamily'])+'</h2><div class="panels"><figure><figcaption>Photograph</figcaption><img src="'+identity+'-input.png" alt="Input photograph"></figure>')
        for method, predicted in probabilities.items():
            probability = predicted[index]
            name = identity+'-'+method
            Image.fromarray(np.uint8(np.clip(255*probability, 0, 255))).save(args.output/(name+'-probability.png'))
            target, known = item['target'] == 1, item['weight'] == 1
            error = item['rgb'].copy(); mask = probability >= .5
            error[known & mask & ~target] = [255, 60, 30]; error[known & ~mask & target] = [30, 100, 255]
            error[~known] = np.uint8(.5*error[~known]+.5*np.array([255, 180, 0]))
            Image.fromarray(error).save(args.output/(name+'-error.png'))
            sections.append('<figure><figcaption>'+html.escape(method)+'</figcaption><img src="'+name+'-probability.png" alt="Probability"><img src="'+name+'-error.png" alt="Known-region errors"></figure>')
            folder = args.output/('probe-'+method); raw = probability.astype('<f4').tobytes(); prob_file = identity+'.f32'; (folder/prob_file).write_bytes(raw)
            probes[method]['rows'].append({'id': identity, 'caseId': identity, 'group': 'real', 'file': str(file.resolve()),
                                          'photoSha256': photo_hash, 'originalPhotoSha256': source['sha256'],
                                          'dimensions': [source['width'], source['height']], 'window': window, 'roi': None,
                                          'inferenceSeconds': None, 'assets': {'probability.f32': {'path': prob_file, 'sha256': digest(raw)}}})
        sections.append('</div></section>')
    for method, probe in probes.items():
        (args.output/('probe-'+method)/'manifest.json').write_text(json.dumps(probe, indent=2)+'\n')
    (args.output/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Grouped real-photo adaptation</title><style>body{font:16px system-ui;margin:24px;background:#eee}section{background:white;padding:12px;margin:16px 0}.panels{display:grid;grid-template-columns:repeat(4,minmax(150px,256px));gap:12px}figure{margin:0}img{width:100%;display:block}figcaption{font-size:13px}</style><h1>Grouped real-photo adaptation</h1><p>Red: falsely included background. Blue: missed paper. Gold: unknown and excluded from scores. The mixed result for each image is from its held-out group. All examples are development observations.</p>'+''.join(sections))
    result['exportedArtifacts'] = {str(p.relative_to(args.output)): digest(p.read_bytes()) for p in sorted(args.output.rglob('*')) if p.is_file()}
    (args.output/'audit.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({k: v['macroMean'] for k, v in result['metrics'].items()}, indent=2))


if __name__ == '__main__': main()
