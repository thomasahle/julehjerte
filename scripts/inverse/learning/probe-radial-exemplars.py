"""Evaluate frozen paper classifiers on existing, unassigned radial motifs."""
import argparse
import json
import shutil
import time
from pathlib import Path

import numpy as np
from PIL import Image
import torch
from torch.nn import functional as F

from data import checked_asset, digest
from exemplar_experiment import FrozenFeatures, display, measurement, prepare_case, reference
from exemplar_projection import ExemplarProjection
from foreground import physical_foreground
from material_pilot import conditional_material_labels
from paper_exemplars import fit_exemplar_classifier, lobe_samples, score_exemplars
from preserved_candidate import pinned
from u2netp_adaptation import frozen_hash, input_tensor
from u2netp_material_candidate import load_material_candidate, module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_bytes())
    assert plan['schema'] == 'radial-exemplar-probe-plan-1'
    assert plan.get('head', 'joint') in ['joint', 'residual']
    assert not args.output.exists()
    p = plan['protocol']
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    manifest_path = pinned(plan['dataset'])
    manifest = json.loads(manifest_path.read_bytes())
    assert manifest['status'] == 'complete'
    views = {v['id']: v for v in manifest['views']}
    designs = {d['id']: d for d in manifest['baseDesigns']}
    selected = [views[i] for i in plan['viewIds']]
    assert len(selected) == len(designs) == 64
    assert len({v['designId'] for v in selected}) == 64
    assert all(v['split'] == designs[v['designId']]['split'] == 'unassigned' for v in selected)
    wrapper, training_plan, _, parent_reference = load_material_candidate(
        pinned(plan['trainingParent']).parent)
    assert parent_reference == plan['trainingParent']
    body = wrapper.body.eval()
    for parameter in body.parameters():
        parameter.requires_grad_(False)
    body_hash = frozen_hash(body)
    loader = module(Path(training_plan['source']['path']).parent/'data_loader.py', 'radial_loader')
    rescale, normalize = loader.RescaleT(320), loader.ToTensorLab(flag=0)
    models = {}
    for name, checkpoint in plan['models'].items():
        model = ExemplarProjection(p['contextChannels'], p['projectionChannels'])
        model.load_state_dict(torch.load(pinned(checkpoint), map_location='cpu', weights_only=True))
        model.eval()
        for parameter in model.parameters():
            parameter.requires_grad_(False)
        models[name] = model
    features = FrozenFeatures(body, p)
    args.output.mkdir(parents=True)
    started = time.monotonic()
    sources = [
        'probe-radial-exemplars.py', 'exemplar_experiment.py', 'exemplar_projection.py',
        'foreground.py', 'paper_exemplars.py', 'material_pilot.py',
        'probe-paper-exemplars.py', 'probe-native-exemplars.py',
        'probe-material-synthetic.py', 'u2netp_adaptation.py',
    ]
    report = {
        'schema': 'radial-exemplar-probe-results-1', 'status': 'running',
        'plan': reference(args.plan), 'bodySha256': body_hash, 'models': plan['models'],
        'sourceHashes': {name: reference(Path(__file__).with_name(name))['sha256'] for name in sources},
        'scope': plan['scope'], 'rows': [], 'runtime': {'torch': torch.__version__, 'threads': 1},
    }
    panels = []

    def save():
        assert frozen_hash(body) == body_hash
        assert shutil.disk_usage('.').free >= plan['resources']['minimumFreeGiB']*1024**3
        assert time.monotonic()-started < plan['resources']['maximumWallSeconds']
        assert sum(f.stat().st_size for f in args.output.rglob('*') if f.is_file()) < (
            plan['resources']['maximumArtifactMiB']*1024**2)
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')

    save()
    try:
        for index, view in enumerate(selected):
            identity = view['id']
            row = {'id': identity, 'designId': view['designId'], 'status': 'preparing'}
            report['rows'].append(row)
            folder = manifest_path.parent
            photo_file = checked_asset(folder, view['assets']['photo.jpg'])
            tensor, _, decoded = input_tensor(photo_file, view['assets']['photo.jpg']['sha256'], rescale, normalize)
            labels = json.loads(checked_asset(folder, view['assets']['labels.json']).read_bytes())
            assert labels['designId'] == view['designId'] and labels['seed'] == view['seed']
            coverage_file = checked_asset(folder, view['assets']['photo-paper-a.png'])
            with Image.open(coverage_file) as image:
                coverage = np.asarray(image.convert('L'), dtype=np.float32)/255
            body_target = physical_foreground(labels, p['resolution'])
            materials = conditional_material_labels(coverage, body_target)
            item = {'id': identity, 'input': tensor, 'body': body_target, 'materials': materials,
                    'evidence': {'photo': str(photo_file), 'photoSha256': view['assets']['photo.jpg']['sha256'],
                                 'decodedRGBSha256': decoded}}
            matrix = np.asarray(labels['canonicalToPhoto']).reshape(3, 3)@np.diag([100, 100, 1])
            case = {'item': item, 'matrix': matrix}
            row['evidence'] = {**item['evidence'], 'materialCoverage': reference(coverage_file),
                               'materialLabelsSha256': digest(materials.tobytes()),
                               'geometrySha256': designs[view['designId']]['geometrySha256']}
            try:
                photo, rgb, indices, count, region = prepare_case(case, p)
            except ValueError as error:
                row.update(status='preparation-rejected', error=str(error))
                panels.append({'id': identity, 'panels': [('Preparation rejected', None)]*6})
                save()
                continue
            support = lobe_samples(matrix, p['contextResolution'], photo.shape[1::-1])
            rgb_low = F.interpolate(rgb[None], (p['contextResolution'],)*2,
                                    mode='bilinear', align_corners=False)[0]
            classifier, fit = fit_exemplar_classifier(rgb_low.numpy().transpose(1, 2, 0), support)
            assert fit['samplesPerPaper'] == count
            row['rgbFit'] = fit
            fields = {'rgb-only': torch.from_numpy(score_exemplars(
                rgb.numpy().transpose(1, 2, 0), classifier)).sigmoid().numpy()}
            with torch.no_grad():
                frozen = features(item)
                for name, model in models.items():
                    fields[name] = model(rgb, frozen, indices, count,
                                         residual=plan.get('head') == 'residual').sigmoid().numpy()
            valid = region & (materials != 255)
            tiles = [('Photo', Image.fromarray(photo)),
                     ('Known overlap label', display.colour_mask(materials >= .5, valid))]
            row.update(status='complete', lobeSamplesPerPaper=count, metrics={}, boundaries={})
            masks = {'target': (materials >= .5).astype(np.uint8), 'valid': valid.astype(np.uint8)}
            for name, field in fields.items():
                metrics, boundary = measurement(item, field, region)
                row['metrics'][name] = metrics
                row['boundaries'][name] = boundary
                masks[name] = (field >= .5).astype(np.uint8)
                shown = (field >= .5) ^ bool(metrics['materialPhaseExchanged'])
                tiles.append((f"{name}: {metrics['materialPixelError']*100:.2f}%",
                              display.colour_mask(shown, valid)))
            mask_file = args.output/(identity+'.npz')
            np.savez_compressed(mask_file, **masks)
            row['masks'] = reference(mask_file)
            panels.append({'id': identity, 'panels': tiles})
            if (index+1) % 8 == 0:
                save()
                print(json.dumps({'cases': index+1, 'seconds': time.monotonic()-started}), flush=True)
        complete = [r for r in report['rows'] if r['status'] == 'complete']
        report['summary'] = {'total': len(selected), 'complete': len(complete), 'methods': {}}
        for name in ['rgb-only', *models]:
            errors = [r['metrics'][name]['materialPixelError'] for r in complete]
            report['summary']['methods'][name] = {
                'meanError': float(np.mean(errors)), 'medianError': float(np.median(errors)),
                'maximumError': float(np.max(errors)), 'casesBelow2Percent': sum(e < .02 for e in errors)}
        report['gallery'] = display.gallery(panels, args.output, 'radial', 224)
        report.update(status='complete', seconds=time.monotonic()-started, frozenBodyExact=True)
    except Exception as error:
        report.update(status='failed', error=repr(error))
        raise
    finally:
        features.close()
        save()
    print(json.dumps(report['summary']), flush=True)


if __name__ == '__main__':
    main()
