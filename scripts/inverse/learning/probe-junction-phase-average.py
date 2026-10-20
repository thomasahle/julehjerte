"""Evaluate a phase-invariant readout of the frozen boundary/corner CNN."""
import argparse
import hashlib
import json
import shutil
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_erosion
import torch

from classical import refine_corners
from data import Corpus, detect_nodes, point_counts, scores
from localization import aggregate, measure
from metrics import thin_boundary
from model import ProposalNet
from train import infer


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def reference(file):
    return {'path': str(file), 'sha256': digest(file.read_bytes())}


def pinned(ref, root=Path('.')):
    file = root/ref['path']
    assert digest(file.read_bytes()) == ref['sha256'], str(file)
    return file


def phase_average(first, second):
    """Average quantized heatmaps before thresholding, preserving storage policy."""
    assert first.shape == second.shape and first.shape[0] == 2
    assert first.dtype == second.dtype == np.float16
    assert all(np.isfinite(x).all() and ((x >= 0) & (x <= 1)).all() for x in [first, second])
    return ((first.astype(np.float32)+second.astype(np.float32))*.5).astype(np.float16)


def proposals(field, mask, valid, threshold, radius):
    nodes = detect_nodes(field[1]*valid, threshold)
    adjusted = refine_corners(mask, nodes, radius)
    if len(adjusted):
        indices = np.floor(adjusted).astype(int)
        inside = valid[indices[:, 1], indices[:, 0]]
        adjusted[~inside] = nodes[~inside]
    return nodes, adjusted


def thumbnail(image):
    image = image.copy()
    image.thumbnail((240, 240), Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', (240, 240), 'white')
    canvas.paste(image, ((240-image.width)//2, (240-image.height)//2))
    return canvas


def overlay(rgb, boundary, nodes, adjusted=None):
    pixels = rgb.copy()
    pixels[thin_boundary(boundary)] = [0, 220, 130]
    image = Image.fromarray(pixels)
    pen = ImageDraw.Draw(image)
    for x, y in nodes:
        pen.ellipse((x-4, y-4, x+4, y+4), outline=(255, 160, 0), width=2)
    if adjusted is not None:
        for x, y in adjusted:
            pen.line((x-3, y, x+3, y), fill=(255, 0, 220), width=2)
            pen.line((x, y-3, x, y+3), fill=(255, 0, 220), width=2)
    return thumbnail(image)


def gallery(panels, captions, labels, folder, prefix):
    result = []
    for start in range(0, len(panels), 3):
        page = Image.new('RGB', (240*len(labels), 290*min(3, len(panels)-start)), 'white')
        pen = ImageDraw.Draw(page)
        for j, group in enumerate(panels[start:start+3]):
            for k, (panel, label) in enumerate(zip(group, labels)):
                page.paste(panel, (k*240, j*290+20))
                pen.text((k*240+3, j*290+3), label, fill='black')
            pen.text((3, j*290+264), captions[start+j], fill='black')
            pen.text((3, j*290+278), 'Green: boundary; orange: raw corner; magenta: fixed 9px refinement.', fill='black')
        file = folder/('%s-%02d.jpg' % (prefix, start//3+1))
        page.save(file, quality=92)
        result.append({**reference(file), 'indices': list(range(start, min(len(panels), start+3)))})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    started = time.perf_counter()
    plan = json.loads(args.plan.read_text())
    assert plan['schema'] == 'junction-phase-average-plan-1'
    assert plan['methods'] == ['original', 'exchanged', 'symmetric']
    protocol = plan['protocol']
    assert protocol['resolution'] == 384 and protocol['thresholds'] == [.6, .4]
    assert protocol['refinementRadius'] == 9 and protocol['cornerTolerance'] == 3
    training = json.loads(pinned(plan['training']).read_text())
    previous = json.loads(pinned(plan['previousSyntheticReplay']).read_text())
    real = json.loads(pinned(plan['previousRealProbe']).read_text())
    checkpoint = pinned(plan['checkpoint'])
    pinned(plan['prepared'])
    assert training['status'] == previous['status'] == real['status'] == 'complete'
    assert training['checkpointSha256'] == previous['checkpointSha256'] == plan['checkpoint']['sha256']
    assert training['selectedThresholds'] == protocol['thresholds']
    assert previous['developmentSelected'] == 'cnn-refined-9'
    code = Path(__file__).parent
    for name in ['model.py', 'train.py', 'data.py']:
        assert digest((code/name).read_bytes()) == training['sourceHashes'][name]
    methods = plan['methods']
    args.output.mkdir(parents=True, exist_ok=False)
    report = {
        'schema': 'junction-phase-average-probe-1', 'status': 'running', 'plan': reference(args.plan),
        'sources': [reference(code/name) for name in [
            Path(__file__).name, 'model.py', 'data.py', 'train.py', 'localization.py',
            'classical.py', 'metrics.py']],
        'methods': methods, 'rows': [], 'realRows': [],
        'protocol': protocol, 'limitations': plan['limitations'],
    }

    def save():
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')

    def resources():
        assert time.perf_counter()-started < plan['resources']['maximumWallSeconds'], 'Wall-time cap'
        assert shutil.disk_usage(args.output).free >= plan['resources']['minimumFreeGiB']*2**30
        size = sum(p.stat().st_size for p in args.output.rglob('*') if p.is_file())
        assert size < plan['resources']['maximumArtifactMiB']*2**20, 'Artifact cap'
        return size

    save()
    try:
        torch.set_num_threads(1)
        torch.set_num_interop_threads(1)
        torch.manual_seed(1729)
        model = ProposalNet('random').eval()
        model.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True))
        initial = {name: value.clone() for name, value in model.state_dict().items()}
        corpus = Corpus(Path(plan['prepared']['path']).parent)
        rows_by_id = {row['id']: row for row in corpus.rows}
        old = {row['id']: row for row in previous['rows']['cnn']}
        assert set(old) == {r['id'] for r in plan['expectedEvaluation']}
        for expected in plan['expectedEvaluation']:
            resources()
            item = corpus.load(rows_by_id[expected['id']])
            assert all(item[k] == expected[k] for k in ['id', 'designId', 'split'])
            assert np.array_equal(item['nodes'], np.asarray(old[item['id']]['reference'], np.float32).reshape(-1, 2))
            assert np.isin(item['mask'], [0, 1]).all()
            exchanged = {**item, 'mask': 1-item['mask']}
            began = time.perf_counter()
            _, predictions = infer(model, [item, exchanged], torch.device('cpu'), 1)
            seconds = time.perf_counter()-began
            fields = dict(zip(methods[:2], predictions))
            fields['symmetric'] = phase_average(*predictions)
            assert np.array_equal(fields['symmetric'], phase_average(*reversed(predictions)))
            record = {
                **expected, 'methods': {}, 'twoForwardAndLossSeconds': seconds,
                'inputHashes': {key: digest(item[key].tobytes()) for key in ['rgb', 'mask', 'valid', 'boundary', 'nodes']},
                'symmetricArgumentSwapExact': True,
            }
            archive = {
                'valid': np.packbits(item['valid']),
                'reference_boundary': np.packbits(item['boundary'] & item['valid']),
                'reference_nodes': item['nodes'],
            }
            for method in methods:
                boundary = (fields[method][0] >= protocol['thresholds'][0]) & item['valid']
                nodes, adjusted = proposals(fields[method], item['mask'], item['valid'], .4, 9)
                metric = measure(item, boundary, nodes)
                metric['refinedJunctions'] = scores(point_counts(adjusted, item['nodes']))
                metric['fieldSha256'] = digest(fields[method].tobytes())
                record['methods'][method] = metric
                archive[method+'_boundary'] = np.packbits(boundary)
                archive[method+'_nodes'], archive[method+'_refined'] = nodes, adjusted
            original_counts = record['methods']['original']['junctions']
            record['historicalOriginalCountsEqual'] = (
                [original_counts[k] for k in ['matched', 'predicted', 'target']] == old[item['id']]['counts'])
            file = args.output/(item['id']+'.npz')
            np.savez_compressed(file, **archive)
            with np.load(file) as stored:
                assert all(np.array_equal(stored[k], v) for k, v in archive.items())
            record['predictions'] = reference(file)
            report['rows'].append(record)
            if len(report['rows']) % 16 == 0:
                save()
                print('Synthetic', len(report['rows']), '/', len(plan['expectedEvaluation']), flush=True)
        report['summary'] = {}
        for method in methods:
            measured = [r['methods'][method] for r in report['rows']]
            report['summary'][method] = {
                'raw': aggregate(measured),
                'refined': aggregate([{**r, 'junctions': r['refinedJunctions']} for r in measured]),
            }
        # First six per split and predeclared score extrema are for inspection
        # only; they never select a method, parameter or checkpoint.
        chosen = [r for split in sorted({r['split'] for r in report['rows']})
                  for r in [x for x in report['rows'] if x['split'] == split][:6]]
        difference = lambda r: r['methods']['symmetric']['refinedJunctions']['f1']-r['methods']['original']['refinedJunctions']['f1']
        extremes = {}
        for label, order in [('largestLosses', 1), ('largestGains', -1)]:
            seen, selected = set(), []
            for row in sorted(report['rows'], key=lambda r: (order*difference(r), r['id'])):
                if order*difference(row) >= 0 or row['designId'] in seen:
                    continue
                selected.append({'id': row['id'], 'deltaRefinedF1': difference(row)})
                seen.add(row['designId'])
                if len(selected) == 3:
                    break
            extremes[label] = selected
            chosen.extend(next(r for r in report['rows'] if r['id'] == s['id']) for s in selected)
        chosen = list({r['id']: r for r in chosen}.values())
        panels, captions = [], []
        for row in chosen:
            item = corpus.load(rows_by_id[row['id']])
            with np.load(pinned(row['predictions'])) as archive:
                shape = item['valid'].shape
                unpack = lambda k: np.unpackbits(archive[k], count=np.prod(shape)).reshape(shape).astype(bool)
                group = [thumbnail(Image.fromarray(item['rgb'])), overlay(item['rgb'], unpack('reference_boundary'), archive['reference_nodes'])]
                group += [overlay(item['rgb'], unpack(m+'_boundary'), archive[m+'_nodes'], archive[m+'_refined']) for m in methods]
            panels.append(group)
            captions.append(row['id']+' | refined corner F1: '+', '.join('%s %.3f' % (m, row['methods'][m]['refinedJunctions']['f1']) for m in methods))
        report['syntheticReview'] = {
            'ids': [r['id'] for r in chosen], 'extremes': extremes,
            'gallery': gallery(panels, captions, ['Input', 'Reference', 'Original', 'Exchanged', 'Symmetric'], args.output, 'synthetic'),
        }
        save()
        # The real follow-up uses saved predictions, not another neural pass.
        panels, captions = [], []
        n = protocol['resolution']
        real_plan = json.loads(pinned(real['plan']).read_text())
        pipeline = json.loads(pinned(real_plan['pipeline']).read_text())
        pipeline_root = Path(real_plan['pipeline']['path']).parent
        for row in real['rows']:
            resources()
            source = next(r for r in pipeline['rows'] if r['id'] == row['id'] and r['method'] == 'hard')
            with Image.open(pinned(row['source'])) as image:
                photo = thumbnail(image.convert('RGB'))
            record = {'id': row['id'], 'status': row['status']}
            if row['status'] == 'crop-unresolved':
                report['realRows'].append(record)
                panels.append([photo]+[Image.new('RGB', (240, 240), '#eeeeee') for _ in range(4)])
                captions.append(row['id']+' | crop-unresolved')
                continue
            with Image.open(pinned(row['crop'])) as image:
                rgb = np.asarray(image.convert('RGB').resize((n, n), Image.Resampling.BILINEAR)).copy()
            with Image.open(pinned(source['assets']['mask.png'], pipeline_root)) as image:
                native = np.asarray(image.convert('RGB'))[:, :, 1] < 128
            assert digest(native.astype(np.uint8).tobytes()) == row['nativeMaskSha256']
            mask = np.asarray(Image.fromarray(native).resize((n, n), Image.Resampling.NEAREST)).copy()
            observed = (np.frombuffer(pinned(source['assets']['observed.bin'], pipeline_root).read_bytes(), np.uint8).reshape(native.shape) != 0
                        if 'observed.bin' in source['assets'] else np.ones_like(native))
            valid = binary_erosion(np.asarray(Image.fromarray(observed).resize((n, n), Image.Resampling.NEAREST)), iterations=2)
            for key, array in [('rgbInputSha256', rgb), ('maskInputSha256', mask), ('validInputSha256', valid)]:
                assert digest(array.tobytes()) == row[key]
            with np.load(pinned(row['fields'])) as stored:
                first, second = stored['original'], stored['exchanged']
            assert digest(first.tobytes()) == row['methods']['original']['fieldSha256']
            assert digest(second.tobytes()) == row['methods']['exchanged']['fieldSha256']
            field = phase_average(first, second)
            assert np.array_equal(field, phase_average(second, first))
            nodes, adjusted = proposals(field, mask, valid, .4, 9)
            record.update({
                'sourceFields': row['fields'], 'symmetricArgumentSwapExact': True,
                'averageFieldSha256': digest(field.tobytes()), 'nodes': nodes.tolist(), 'refined': adjusted.tolist(),
                'originalProposals': len(row['methods']['original']['nodes']),
                'exchangedProposals': len(row['methods']['exchanged']['nodes']),
                'boundaryPixels': int(((field[0] >= .6) & valid).sum()),
            })
            panels.append([
                photo, thumbnail(Image.fromarray(rgb)),
                overlay(rgb, (first[0] >= .6) & valid, row['methods']['original']['nodes']),
                overlay(rgb, (second[0] >= .6) & valid, row['methods']['exchanged']['nodes']),
                overlay(rgb, (field[0] >= .6) & valid, nodes, adjusted),
            ])
            captions.append(row['id']+' | corners %d / %d / %d; no real corner ground truth' %
                            (record['originalProposals'], record['exchangedProposals'], len(nodes)))
            report['realRows'].append(record)
        report['realGallery'] = gallery(panels, captions, ['Photo', 'Crop', 'Original', 'Exchanged', 'Symmetric'], args.output, 'real')
        assert len(report['rows']) == 308 and len(report['realRows']) == 32
        assert all(torch.equal(initial[name], value) for name, value in model.state_dict().items())
        for ref in report['sources']+[plan['checkpoint'], plan['prepared'], plan['previousRealProbe']]:
            pinned(ref)
        report['seconds'] = time.perf_counter()-started
        report['artifactBytesBeforeFinalReport'] = resources()
        report['status'] = 'complete'
        save()
        resources()
        print(json.dumps(report['summary']), flush=True)
    except Exception as error:
        report['status'] = 'failed'
        report['error'] = str(error)
        save()
        raise


if __name__ == '__main__':
    main()
