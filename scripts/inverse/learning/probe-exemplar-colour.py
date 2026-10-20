"""Isolate colour and local-deviation effects in the fixed lobe experiment."""
import argparse
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
import torch

from data import digest
from preserved_candidate import pinned
from u2netp_material_candidate import module
from u2netp_material_training import material_training
from paper_exemplars import (
    fit_exemplars, lobe_samples, overlap_region, quad_transform,
    rgb_texture_features, score_probability,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_bytes())
    if plan['schema'] != 'paper-exemplar-colour-plan-1' or args.output.exists():
        raise ValueError('Require new declared diagnostic')
    if shutil.disk_usage('.').free < plan['resources']['minimumFreeGiB']*1024**3:
        raise ValueError('Insufficient free disk')
    torch.set_num_threads(1); torch.set_num_interop_threads(1)
    probe = module(Path(__file__).with_name('probe-paper-exemplars.py'), 'exemplar_parent')
    parent = json.loads(pinned(plan['parent']).read_bytes())
    parent_plan = json.loads(pinned(parent['plan']).read_bytes())
    training = json.loads(pinned(parent_plan['training']).read_bytes())
    training_plan = json.loads(pinned(training['plan']).read_bytes())
    loader = module(Path(training_plan['source']['path']).parent/'data_loader.py', 'colour_exemplar_input')
    _, synthetic, _ = material_training(training_plan, loader.RescaleT(320), loader.ToTensorLab(flag=0))
    items = {r['id']: r for r in synthetic}
    boundary = module(Path(__file__).with_name('probe-material-synthetic.py'), 'colour_boundary').boundary_diagnostics
    classifier = parent_plan['classifier']
    args.output.mkdir(parents=True)
    rows, review = [], []
    for index, previous in enumerate(parent['rows']):
        row = {'id': previous['id'], 'kind': previous['kind'], 'cohort': previous['cohort'],
               'parentStatus': previous['status']}
        rows.append(row)
        if previous['status'] != 'complete':
            row.update(status='failed', reason=previous['reason'])
            continue
        item = items.get(row['id'], {'id': row['id'], 'evidence': previous['image']})
        rgb = probe.source_rgb(item); size = rgb.shape[1::-1]
        if row['cohort'] == 'synthetic':
            labels = json.loads(pinned(previous['geometry']).read_bytes())
            matrix = np.asarray(labels['canonicalToPhoto']).reshape(3, 3)@np.diag([100, 100, 1])
        else:
            matrix = quad_transform(previous['geometry']['fixedQuad'])
        support = lobe_samples(matrix, 160, size)
        features = rgb_texture_features(rgb)
        original_score, original_fit = fit_exemplars(features, support, **classifier)
        with np.load(pinned(previous['fields'])) as saved:
            if not np.array_equal(saved['rgb-texture'], original_score):
                raise ValueError('Original RGB-texture score replay differs: '+row['id'])
        if original_fit != previous['fits']['rgb-texture']:
            raise ValueError('Original lobe fit differs')
        # Independently retain all selected lobe pixels. Replacing query
        # deviations by their balanced support mean sets just this feature
        # block to zero after centring; it cannot change the fitted samples.
        n = original_fit['samplesPerPaper']
        groups = []
        for mask in support:
            indices = np.flatnonzero(mask)
            selected = indices[np.linspace(0, len(indices)-1, n, dtype=int)]
            groups.append(features.reshape(-1, 9)[selected])
        fitted = np.concatenate(groups).astype(np.float64)
        query = ~support.any(0)
        neutral = features.copy()
        neutral[query, 6:] = fitted[:, 6:].mean(0)
        neutral_score, neutral_fit = fit_exemplars(neutral, support, **classifier)
        if original_fit != neutral_fit:
            raise ValueError('Query intervention changed the fitted classifier')
        raw_score, raw_fit = fit_exemplars(features[..., :3], support, **classifier)
        region_low = overlap_region(matrix, 160, size)
        row.update(status='complete', replayExact=True, rawFit=raw_fit,
                   queryInterventionPreservesFit=True,
                   overlapDeviationAboveSupportMax=float(
                       (features[region_low, 6:] > fitted[:, 6:].max(0)).any(-1).mean()))
        scores = {'rgb-only': raw_score, 'neutral-deviation': neutral_score}
        path = args.output/f'fields-{index:03}.npz'
        np.savez_compressed(path, **scores)
        row['fields'] = probe.reference(path)
        probabilities = {'rgb-texture': score_probability(original_score),
                         **{k: score_probability(v) for k, v in scores.items()}}
        region = overlap_region(matrix, 320, size)
        if row['cohort'] == 'synthetic':
            row['metrics'], row['boundaries'] = {}, {}
            target = {**item, 'materials': np.where(region, item['materials'], 255)}
            display = region & (item['materials'] != 255)
            for name, probability in probabilities.items():
                # Material-only diagnostic: body does not enter the identity
                # score or its denominator. No new joint/body claim.
                prediction = np.stack([np.ones_like(probability), probability])
                metric = probe.measure(item, prediction, region)
                row['metrics'][name] = {k: metric[k] for k in [
                    'id', 'knownMaterialPixels', 'materialPhaseExchanged', 'materialPixelError']}
                row['boundaries'][name] = boundary(prediction[None], [target], {'rows': [metric]})['rows'][0]
            if row['metrics']['rgb-texture']['materialPixelError'] != previous['metrics']['rgb-texture']['materialPixelError']:
                raise ValueError('Original material metric differs')
        else:
            display = region
        review.append({'record': row, 'item': item, 'display': display, 'probabilities': probabilities})
        if sum(p.stat().st_size for p in args.output.iterdir()) > plan['resources']['maximumArtifactMiB']*1024**2:
            raise ValueError('Artifact budget exceeded')
    summary = {}
    for kind in sorted({r['kind'] for r in rows if r['cohort'] == 'synthetic'}):
        selected = [r for r in rows if r['kind'] == kind]
        completed = [r for r in selected if r['status'] == 'complete']
        summary[kind] = {'total': len(selected), 'complete': len(completed), 'methods': {
            name: {'materialError': float(np.mean([r['metrics'][name]['materialPixelError'] for r in completed])),
                   'boundaryError': float(np.mean([r['boundaries'][name]['boundaryError'] for r in completed])),
                   'interiorError': float(np.mean([r['boundaries'][name]['interiorError'] for r in completed]))}
            for name in ['rgb-texture', 'rgb-only', 'neutral-deviation']},
            'meanOverlapDeviationAboveSupportMax': float(np.mean(
                [r['overlapDeviationAboveSupportMax'] for r in completed]))}
    # Real images are all reviewed. Synthetic views retain the original first
    # study's failure selection, avoiding a second results-based selection.
    chosen = {identity for page in parent['gallery']['synthetic'] for identity in page['ids']}
    galleries = {}
    colours = np.array([[255, 130, 0], [0, 200, 255]], np.uint8)
    for cohort in ['synthetic', 'development']:
        selected = [r for r in review if r['record']['cohort'] == cohort and
                    (cohort == 'development' or r['record']['id'] in chosen)]
        galleries[cohort] = []
        for start in range(0, len(selected), 4):
            batch = selected[start:start+4]
            image = Image.new('RGB', (1280, len(batch)*360), 'white'); pen = ImageDraw.Draw(image)
            for j, entry in enumerate(batch):
                row = entry['record']
                image.paste(Image.fromarray(probe.source_rgb(entry['item'])).resize((320, 320)), (0, j*360))
                for k, name in enumerate(['rgb-texture', 'rgb-only', 'neutral-deviation'], 1):
                    predicted = entry['probabilities'][name] >= .5
                    if cohort == 'synthetic':
                        predicted ^= row['metrics'][name]['materialPhaseExchanged']
                    panel = np.full((320, 320, 3), 130, np.uint8)
                    panel[entry['display']] = colours[predicted[entry['display']].astype(int)]
                    image.paste(Image.fromarray(panel), (320*k, j*360))
                pen.text((3, j*360+323), row['id'], fill='black')
                pen.text((3, j*360+340), 'Photo / original RGB texture / RGB only / query deviation neutralized', fill='black')
            path = args.output/f'{cohort}-{start//4+1}.jpg'; image.save(path, quality=90)
            galleries[cohort].append({**probe.reference(path), 'ids': [r['record']['id'] for r in batch]})
    result = {'schema': 'paper-exemplar-colour-results-1', 'status': 'complete',
              'plan': probe.reference(args.plan), 'parent': plan['parent'],
              'sourceHashes': {p.name: digest(p.read_bytes()) for p in [
                  Path(__file__), Path(__file__).with_name('paper_exemplars.py'),
                  Path(__file__).with_name('probe-paper-exemplars.py')]},
              'rows': rows, 'summary': summary, 'gallery': galleries, 'scope': plan['scope']}
    (args.output/'report.json').write_text(json.dumps(result, indent=2)+'\n')
    if sum(p.stat().st_size for p in args.output.iterdir()) > plan['resources']['maximumArtifactMiB']*1024**2:
        raise ValueError('Artifact budget exceeded')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
