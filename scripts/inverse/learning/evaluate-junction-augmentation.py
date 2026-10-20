"""Evaluate every terminal augmentation checkpoint on the unchanged cohorts."""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import time

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion
import torch

from data import Corpus, point_counts, scores
from junction_augmentation import digest, pinned, reference
from localization import aggregate, measure
from model import ProposalNet
from train import tensors

# Share the exact existing decoder and visualizations without editing its
# historical replay implementation or duplicating threshold/refinement logic.
helper_path = Path(__file__).with_name('probe-junction-phase-average.py')
spec = importlib.util.spec_from_file_location('phase_probe', helper_path)
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)


def predict(model, rgb, mask):
    item = {'rgb': rgb, 'mask': mask.astype(np.float32),
            'target': np.zeros((2, 384, 384), np.float32), 'valid': np.ones((384, 384), bool)}
    with torch.no_grad():
        color, binary, _, _ = tensors([item], torch.device('cpu'))
        result = {}
        for name, value in [('original', binary), ('exchanged', 1-binary)]:
            result[name] = torch.sigmoid(model(color, value))[0].numpy().astype(np.float16)
    result['symmetric'] = helpers.phase_average(result['original'], result['exchanged'])
    assert np.array_equal(result['symmetric'], helpers.phase_average(result['exchanged'], result['original']))
    return result


def decode(fields, mask, valid):
    result = {}
    for name, field in fields.items():
        nodes, refined = helpers.proposals(field, mask, valid, .4, 9)
        result[name] = {'boundary': (field[0] >= .6) & valid, 'nodes': nodes, 'refined': refined,
                        'fieldSha256': digest(field.tobytes())}
    return result


def agreement(first, second):
    return {key: scores(point_counts(first[key], second[key])) for key in ['nodes', 'refined']}


def packed(decoded, prefix, archive):
    for name, values in decoded.items():
        key = prefix+'_'+name
        archive[key+'_boundary'] = np.packbits(values['boundary'])
        archive[key+'_nodes'] = values['nodes']
        archive[key+'_refined'] = values['refined']


def unpack(archive, key):
    return np.unpackbits(archive[key], count=384*384).reshape(384, 384).astype(bool)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True, type=Path)
    parser.add_argument('--training', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    started = time.perf_counter()
    plan = json.loads(args.plan.read_text())
    assert plan['schema'] == 'junction-augmentation-evaluation-plan-1'
    training = json.loads(args.training.read_text())
    train_plan = json.loads(pinned(plan['trainingPlan']).read_text())
    assert training['plan'] == plan['trainingPlan'] and training['status'] == 'complete'
    assert [a['id'] for a in training['arms']] == plan['arms']
    assert all(a['status'] == 'complete' and len(a['updates']) == 128 for a in training['arms'])
    assert len({a['scheduleSha256'] for a in training['arms']}) == 1
    baseline = json.loads(pinned(plan['baseline']).read_text())
    real = json.loads(pinned(plan['real']).read_text())
    assert baseline['status'] == real['status'] == 'complete'
    assert plan['protocol']['thresholds'] == [.6, .4]
    assert plan['protocol']['refinementRadius'] == 9 and plan['protocol']['cornerTolerance'] == 3
    assert plan['protocol']['resolution'] == 384
    args.output.mkdir(parents=True, exist_ok=False)
    code = Path(__file__).parent
    report = {'schema': 'junction-augmentation-evaluation-1', 'status': 'running',
              'plan': reference(args.plan), 'training': reference(args.training),
              'sources': [reference(code/name) for name in [
                  Path(__file__).name, 'junction_augmentation.py', helper_path.name,
                  'model.py', 'data.py', 'train.py', 'classical.py', 'metrics.py', 'localization.py']],
              'rows': [], 'realRows': [], 'protocol': plan['protocol'],
              'limitations': plan['limitations']}

    def save():
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')

    def resources():
        assert time.perf_counter()-started < plan['resources']['maximumWallSeconds'], 'Wall-time cap'
        assert shutil.disk_usage(args.output).free >= plan['resources']['minimumFreeGiB']*2**30
        size = sum(p.stat().st_size for p in args.output.rglob('*') if p.is_file())
        assert size < plan['resources']['maximumArtifactMiB']*2**20, 'Artifact cap'
        return size

    def store(identity, archive):
        file = args.output/(identity+'.npz')
        np.savez_compressed(file, **archive)
        with np.load(file) as stored:
            assert all(np.array_equal(value, stored[key]) for key, value in archive.items())
        return reference(file)

    save()
    try:
        torch.set_num_threads(1)
        torch.set_num_interop_threads(1)
        models = {}
        for arm in training['arms']:
            model = ProposalNet('random').eval()
            model.load_state_dict(torch.load(pinned(arm['checkpoint']), map_location='cpu', weights_only=True))
            models[arm['id']] = model
        corpus = Corpus(pinned(plan['prepared']).parent)
        by_id = {r['id']: r for r in corpus.rows}
        old = {r['id']: r for r in baseline['rows']}
        assert set(old) == {r['id'] for r in plan['expectedEvaluation']}
        control_model = ProposalNet('random').eval()
        control_model.load_state_dict(torch.load(pinned(train_plan['checkpoint']), map_location='cpu', weights_only=True))
        for expected in plan['expectedEvaluation']:
            resources()
            item = corpus.load(by_id[expected['id']])
            assert all(item[k] == expected[k] for k in ['id', 'designId', 'split'])
            hashes = {k: digest(item[k].tobytes()) for k in ['rgb', 'mask', 'valid', 'boundary', 'nodes']}
            assert hashes == old[item['id']]['inputHashes']
            if not report['rows']:
                fields = predict(control_model, item['rgb'], item['mask'])
                assert all(digest(f.tobytes()) == old[item['id']]['methods'][k]['fieldSha256'] for k, f in fields.items())
                report['baselineForwardControlExact'] = item['id']
                del control_model
            record = {**expected, 'inputHashes': hashes, 'arms': {}}
            archive = {'valid': np.packbits(item['valid']),
                       'reference_boundary': np.packbits(item['boundary'] & item['valid']), 'reference_nodes': item['nodes']}
            for name, model in models.items():
                began = time.perf_counter()
                fields = predict(model, item['rgb'], item['mask'])
                seconds = time.perf_counter()-began
                decoded = decode(fields, item['mask'], item['valid'])
                measured = {}
                for readout, values in decoded.items():
                    metric = measure(item, values['boundary'], values['nodes'])
                    metric['refinedJunctions'] = scores(point_counts(values['refined'], item['nodes']))
                    metric['fieldSha256'] = values['fieldSha256']
                    measured[readout] = metric
                record['arms'][name] = {'readouts': measured, 'phaseAgreement': agreement(decoded['original'], decoded['exchanged']),
                                         'twoForwardSeconds': seconds}
                packed(decoded, name, archive)
            record['predictions'] = store(item['id'], archive)
            report['rows'].append(record)
            if len(report['rows']) % 24 == 0:
                save()
                print('synthetic', len(report['rows']), '/', 308, flush=True)
        report['summary'] = {}
        for name in models:
            report['summary'][name] = {}
            for readout in plan['readouts']:
                rows = [r['arms'][name]['readouts'][readout] for r in report['rows']]
                report['summary'][name][readout] = {
                    'raw': aggregate(rows), 'refined': aggregate([{**r, 'junctions': r['refinedJunctions']} for r in rows])}
        chosen = [r for split in sorted({r['split'] for r in report['rows']})
                  for r in [v for v in report['rows'] if v['split'] == split][:3]]
        extremes = {}
        for name in models:
            delta = lambda r: r['arms'][name]['readouts']['original']['junctions']['f1']-old[r['id']]['methods']['original']['junctions']['f1']
            ordered = sorted(report['rows'], key=lambda r: (delta(r), r['id']))
            extremes[name] = [{'id': r['id'], 'deltaRawCornerF1': delta(r)} for r in [ordered[0], ordered[-1]]]
            chosen += [ordered[0], ordered[-1]]
        chosen = list({r['id']: r for r in chosen}.values())
        panels, captions = [], []
        for row in chosen:
            item = corpus.load(by_id[row['id']])
            with np.load(pinned(old[row['id']]['predictions'])) as original, np.load(pinned(row['predictions'])) as stored:
                group = [helpers.overlay(item['rgb'], unpack(stored, 'reference_boundary'), stored['reference_nodes']),
                         helpers.overlay(item['rgb'], unpack(original, 'original_boundary'), original['original_nodes'], original['original_refined'])]
                group += [helpers.overlay(item['rgb'], unpack(stored, name+'_original_boundary'), stored[name+'_original_nodes'], stored[name+'_original_refined'])
                          for name in models]
            panels.append(group)
            captions.append(row['id']+' | reference / baseline / four terminal models; all original mask label phase')
        report['syntheticReview'] = {'extremes': extremes, 'ids': [r['id'] for r in chosen],
                                    'gallery': helpers.gallery(panels, captions, ['Reference', 'Baseline']+list(models), args.output, 'synthetic')}
        save()
        real_plan = json.loads(pinned(real['plan']).read_text())
        pipeline = json.loads(pinned(real_plan['pipeline']).read_text())
        pipeline_root = Path(real_plan['pipeline']['path']).parent
        panels, captions = [], []
        for row in real['rows']:
            resources()
            record = {'id': row['id'], 'status': row['status']}
            if row['status'] == 'crop-unresolved':
                with Image.open(pinned(row['source'])) as image:
                    photo = helpers.thumbnail(image.convert('RGB'))
                panels.append([photo]+[Image.new('RGB', (240, 240), '#eeeeee') for _ in range(5)])
                captions.append(row['id']+' | crop unresolved; no inference')
                report['realRows'].append(record)
                continue
            source = next(r for r in pipeline['rows'] if r['id'] == row['id'] and r['method'] == 'hard')
            with Image.open(pinned(row['crop'])) as image:
                rgb = np.asarray(image.convert('RGB').resize((384, 384), Image.Resampling.BILINEAR)).copy()
            with Image.open(helpers.pinned(source['assets']['mask.png'], pipeline_root)) as image:
                native = np.asarray(image.convert('RGB'))[:, :, 1] < 128
            assert digest(native.astype(np.uint8).tobytes()) == row['nativeMaskSha256']
            mask = np.asarray(Image.fromarray(native).resize((384, 384), Image.Resampling.NEAREST)).copy()
            observed = (np.frombuffer(helpers.pinned(source['assets']['observed.bin'], pipeline_root).read_bytes(), np.uint8).reshape(native.shape) != 0
                        if 'observed.bin' in source['assets'] else np.ones_like(native))
            valid = binary_erosion(np.asarray(Image.fromarray(observed).resize((384, 384), Image.Resampling.NEAREST)), iterations=2)
            for key, value in [('rgbInputSha256', rgb), ('maskInputSha256', mask), ('validInputSha256', valid)]:
                assert digest(value.tobytes()) == row[key]
            with np.load(pinned(row['fields'])) as original:
                baseline_field = original['original']
                assert digest(baseline_field.tobytes()) == row['methods']['original']['fieldSha256']
            group = [helpers.thumbnail(Image.fromarray(rgb)),
                     helpers.overlay(rgb, (baseline_field[0] >= .6) & valid, row['methods']['original']['nodes'], row['methods']['original']['refined'])]
            record['arms'] = {}
            archive = {'valid': np.packbits(valid)}
            for name, model in models.items():
                fields = predict(model, rgb, mask)
                decoded = decode(fields, mask, valid)
                record['arms'][name] = {
                    'phaseAgreement': agreement(decoded['original'], decoded['exchanged']),
                    'readouts': {key: {'fieldSha256': v['fieldSha256'], 'nodes': v['nodes'].tolist(),
                                       'refined': v['refined'].tolist(), 'boundaryPixels': int(v['boundary'].sum())}
                                 for key, v in decoded.items()}}
                packed(decoded, name, archive)
                group.append(helpers.overlay(rgb, decoded['original']['boundary'], decoded['original']['nodes'], decoded['original']['refined']))
            record['predictions'] = store(row['id'], archive)
            panels.append(group)
            captions.append(row['id']+' | identical crop and mask; real corner accuracy is unlabelled')
            report['realRows'].append(record)
        report['realGallery'] = helpers.gallery(panels, captions, ['Crop', 'Baseline']+list(models), args.output, 'real')
        assert len(report['rows']) == 308 and len(report['realRows']) == 32
        assert sum(r['status'] == 'crop-unresolved' for r in report['realRows']) == 6
        report['realPhaseAgreement'] = {
            name: {kind: scores([sum(r['arms'][name]['phaseAgreement'][kind][k] for r in report['realRows'] if 'arms' in r)
                               for k in ['matched', 'predicted', 'target']]) for kind in ['nodes', 'refined']}
            for name in models}
        for ref in report['sources']+[report['plan'], report['training'], plan['baseline'], plan['real'], plan['prepared']]+[a['checkpoint'] for a in training['arms']]:
            pinned(ref)
        report.update(status='complete', seconds=time.perf_counter()-started, artifactBytesBeforeFinalReport=resources())
        save()
        resources()
        print('complete', report['seconds'], flush=True)
    except Exception as error:
        report.update(status='failed', error=str(error))
        save()
        raise


if __name__ == '__main__':
    main()
