"""Paired frozen-weight inference at two sizes; no training or crop selection."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT/'scripts/inverse/learning'), str(ROOT/'scripts/inverse/datasets')]

import numpy as np
from PIL import Image
import torch

from material_metrics import material_metrics
from material_scale import scaled_transform, at_label_centres
from real_annotations import photo_tensor
from real_materials_learning import MaterialNet


def digest(data): return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    plan_bytes = args.plan.read_bytes(); plan = json.loads(plan_bytes)
    assert plan['schema'] == 'material-inference-scale-plan-1'
    assert plan['sizes'] == [256, 512] and plan['threads'] == 1
    assert shutil.disk_usage(ROOT).free >= 10*1024**3, 'Keep at least 10 GiB free'
    torch.set_num_threads(1); torch.set_num_interop_threads(1)
    torch.manual_seed(0)
    pins = {}
    def checked(file, expected=None):
        file = Path(file).resolve(); raw = file.read_bytes(); sha = digest(raw)
        if expected is not None: assert sha == expected, str(file)
        pins[str(file.relative_to(ROOT))] = sha
        return raw
    study = ROOT/plan['study']; probe = ROOT/plan['probe']
    training = json.loads(checked(study/'report.json', plan['trainingReportSha256']))
    manifest = json.loads(checked(probe/'manifest.json', plan['probeManifestSha256']))
    assert training['status'] == manifest['status'] == 'complete'
    # Model code is exactly that used to train these checkpoints.
    for name in ['foreground.py', 'model.py', 'real_materials_learning.py']:
        file = ROOT/'scripts/inverse/learning'/name
        checked(file, training['sourceHashes'][str(file)])
    inputs = {row['id']: row for row in training['inputs']}
    items = {}; transforms = {}
    for entry in training['labelAudits']:
        directory = Path(entry['directory'])
        labels = json.loads(checked(directory/'manifest.json', entry['manifestSha256']))
        checked(ROOT/entry['annotations'], entry['annotationsSha256'])
        for row in labels['instances']:
            item = {'id': row['id']}
            for key in ['rgb', 'body', 'materials']:
                asset = row['assets'][key]; file = directory/asset['path']
                checked(file, asset['sha256'])
                with Image.open(file) as image: item[key] = np.asarray(image).copy()
                assert digest(item[key].tobytes()) == inputs[row['id']][key+'Sha256']
            items[row['id']] = item; transforms[row['id']] = row['transform']
    assert [r['id'] for r in manifest['rows']] == plan['ids']
    assert set(items) == set(plan['ids']) and len(items) == 19
    assignments = {}
    for name, run in training['runs'].items():
        if not run['trainIds']: continue
        assert not set(run['trainIds']) & set(run['heldOutIds'])
        for identity in run['heldOutIds']:
            assert identity not in assignments
            assignments[identity] = name
    assert set(assignments) == set(items)
    args.output.mkdir(parents=True, exist_ok=False)
    report = {'schema': 'material-inference-scale-1', 'status': 'running', 'plan': plan,
              'planSha256': digest(plan_bytes), 'inputHashes': pins, 'rows': [],
              'runtime': {'torch': torch.__version__, 'device': 'cpu', 'threads': 1},
              'artifacts': {}, 'sourceHashes': {}}
    for file in [Path(__file__), ROOT/'scripts/inverse/learning/material_scale.py',
                 ROOT/'scripts/inverse/learning/material_metrics.py',
                 ROOT/'scripts/inverse/datasets/real_annotations.py']:
        report['sourceHashes'][str(file.relative_to(ROOT))] = digest(file.read_bytes())
    def save():
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    save()
    scores = {256: [], 512: []}; models = {}
    try:
        for index, row in enumerate(manifest['rows']):
            identity = row['id']; item = items[identity]; fold = assignments[identity]
            if fold not in models:
                checkpoint = study/fold/'model.pt'
                checked(checkpoint, training['runs'][fold]['checkpointSha256'])
                model = MaterialNet()
                model.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True), strict=True)
                model.eval(); models[fold] = model
            model = models[fold]
            source = Path(row['file']); checked(source, row['photoSha256'])
            with Image.open(source) as image: photo = image.convert('RGB')
            assert list(photo.size) == row['dimensions']
            assert digest(np.asarray(photo).tobytes()) == row['decodedRGBSha256']
            reference = []
            for channel in ['body', 'material']:
                asset = row['assets']['candidate'][channel]
                reference.append(np.frombuffer(checked(probe/asset['path'], asset['sha256']), dtype='<f4').reshape(256,256))
            reference = np.stack(reference)
            entry = {'id': identity, 'fold': fold, 'inferenceSeconds': {}, 'fields': {},
                     'source': str(source.relative_to(ROOT)), 'sourceWindow': row['window']}
            # Rotate order; recorded single-call CPU timings are descriptive, not a latency benchmark.
            for resolution in ([256,512] if index % 2 == 0 else [512,256]):
                transform = scaled_transform(transforms[identity], resolution)
                rgb = np.asarray(photo_tensor(photo, transform)).copy()
                if resolution == 256: np.testing.assert_array_equal(rgb, item['rgb'])
                tensor = torch.from_numpy(rgb.transpose(2,0,1).copy())[None].float()/255
                started = time.perf_counter()
                with torch.inference_mode(): probability = model(tensor).sigmoid()[0].numpy()
                entry['inferenceSeconds'][str(resolution)] = time.perf_counter()-started
                if resolution == 256:
                    entry['replayMaxDifference'] = float(np.max(np.abs(probability-reference)))
                    entry['replayHardLabelDifferences'] = int(np.count_nonzero((probability>=.5)!=(reference>=.5)))
                    assert entry['replayMaxDifference'] <= 1e-5
                    scores[256].append((identity, reference))
                else:
                    scores[512].append((identity, at_label_centres(probability,256)))
                    # Only new fields are saved. Source photos, checkpoints and 256px fields are reused.
                    for channel, name in enumerate(['body','material']):
                        file = args.output/(identity+'-'+name+'.f32')
                        raw = probability[channel].astype('<f4').tobytes(); file.write_bytes(raw)
                        asset = {'path': file.name, 'sha256': digest(raw), 'bytes': len(raw)}
                        entry['fields'][name] = asset; report['artifacts'][file.name] = asset
            report['rows'].append(entry); save()
            print(identity, 'replay', entry['replayMaxDifference'], 'seconds', entry['inferenceSeconds'], flush=True)
        report['metrics'] = {}
        for size, values in scores.items():
            mapping = dict(values)
            report['metrics'][str(size)] = material_metrics([mapping[i] for i in plan['ids']], [items[i] for i in plan['ids']])
        assert sum(a['bytes'] for a in report['artifacts'].values()) <= plan['maxOutputBytes']
        for file, sha in {**pins, **report['sourceHashes']}.items():
            assert digest((ROOT/file).read_bytes()) == sha, file
        report['status'] = 'complete'; save()
        print(json.dumps({k:v['macroMean'] for k,v in report['metrics'].items()},indent=2),flush=True)
    except Exception as error:
        report['status'] = 'failed'; report['error'] = str(error); save(); raise


if __name__ == '__main__': main()
