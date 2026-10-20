"""Compare fixed heads under declared, label-preserving sRGB interventions.

These are synthetic colour perturbations of already used training photographs,
not held-out accuracy or a calibrated camera model. No source file is changed.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
import torch

from u2netp_material_candidate import load_material_candidate, module
from u2netp_material import stretched_material_labels
from u2netp_adaptation import real_training, normalize_scores
from material_pilot import evaluate_materials
from preserved_candidate import pinned
from real_materials import checked_materials
from data import digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw', type=Path, required=True); parser.add_argument('--relative', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True); args = parser.parse_args()
    torch.set_num_threads(1); torch.set_num_interop_threads(1)
    candidates = [load_material_candidate(folder) for folder in [args.raw, args.relative]]
    models = [c[0] for c in candidates]; plan = candidates[0][1]
    if [c[1]['protocol'].get('materialInput', 'raw') for c in candidates] != ['raw', 'body-relative-rgb']:
        raise ValueError('Require raw control and relative-colour treatment in that order')
    for key in ['trainIds', 'sourceManifest', 'annotations', 'checkpoint', 'source', 'evaluation']:
        if plan[key] != candidates[1][1][key]: raise ValueError('Candidate training inputs differ')
    for key in ['initialHeadSha256', 'initialFrozenStateSha256', 'draws', 'trainingInputs']:
        if candidates[0][2][key] != candidates[1][2][key]: raise ValueError('Paired training differs: '+key)
    loader = module(Path(plan['source']['path']).parent/'data_loader.py', 'material_stress_input')
    rescale, normalize = loader.RescaleT(320), loader.ToTensorLab(flag=0)
    items, separation = real_training(plan, rescale, normalize)
    catalog = json.loads(pinned(plan['sourceManifest']).read_bytes()); annotations = json.loads(pinned(plan['annotations']).read_bytes())
    labels = {body['id']: (item, body) for item, body, _ in checked_materials(catalog, annotations)}
    photos = []
    for item in items:
        body, material = stretched_material_labels(*labels[item['id']]); item.update(body=body, materials=material.astype(np.float32))
        with Image.open(item['evidence']['photo']) as source: photos.append(np.asarray(ImageOps.exif_transpose(source).convert('RGB')))
    variants = [{'name': 'original', 'gain': 1, 'offset': [0, 0, 0]},
                {'name': 'compressed-contrast', 'gain': .5, 'offset': [.25, .25, .25]},
                {'name': 'warm-cast', 'gain': .7, 'offset': [.25, .15, .05]},
                {'name': 'cool-cast', 'gain': .7, 'offset': [.05, .15, .25]}]
    report = {'schema': 'material-colour-stress-1', 'status': 'running',
              'candidates': [c[3] for c in candidates], 'sourceSeparation': separation, 'variants': variants,
              'implementationSha256': digest(Path(__file__).read_bytes()), 'results': [],
              'loaderSha256': digest(Path(__file__).with_name('u2netp_material_candidate.py').read_bytes()),
              'scope': __doc__.strip(), 'allPairedBodyOutputsExact': True}
    args.output.mkdir(parents=True, exist_ok=False)
    def save(): (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    with torch.no_grad():
        for variant in variants:
            predictions = [[], []]; inputs = []
            for item, photo in zip(items, photos):
                if variant['name'] == 'original': tensor = item['input']
                else:
                    transformed = np.rint(photo.astype(np.float64)*variant['gain']+255*np.array(variant['offset'])).clip(0, 255).astype(np.uint8)
                    sample = rescale({'image': transformed, 'label': np.zeros((*transformed.shape[:2], 1), np.uint8), 'imidx': np.array([0])})
                    tensor = normalize(sample)['image'].float().contiguous()
                inputs.append({'id': item['id'], 'tensorSha256': digest(tensor.numpy().tobytes())})
                pair = []
                for model in models:
                    logits = model(tensor[None])
                    pair.append(torch.cat([normalize_scores(logits[:, :1].sigmoid()), logits[:, 1:].sigmoid()], dim=1)[0].numpy())
                if not np.array_equal(pair[0][0], pair[1][0]): raise ValueError('Material treatment changed body predictions')
                for rows, prediction in zip(predictions, pair): rows.append(prediction)
            scores = [evaluate_materials(np.stack(values), items) for values in predictions]
            if variant['name'] == 'original':
                for score, candidate in zip(scores, candidates):
                    if score != candidate[2]['trainingMetrics']['final']: raise ValueError('Loaded model does not reproduce original training metrics')
            report['results'].append({'variant': variant['name'], 'inputs': inputs, 'raw': scores[0], 'relative': scores[1]})
            save(); print(json.dumps({'variant': variant['name'], 'raw': scores[0]['macroMean'], 'relative': scores[1]['macroMean']}), flush=True)
    report['status'] = 'complete'; save()


if __name__ == '__main__': main()
