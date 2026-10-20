"""Independently audit saved NN scores, fitting fields and binary validations."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def checked(root, asset):
    path = root/asset['path']
    assert path.resolve().is_relative_to(root.resolve())
    assert digest(path.read_bytes()) == asset['sha256'], str(path)
    return path


def reference(path):
    return {'path': str(path), 'sha256': digest(path.read_bytes())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    inputs = json.loads((args.input/'manifest.json').read_bytes())
    export = json.loads((args.input/'report.json').read_bytes())
    run = json.loads((args.run/'report.json').read_bytes())
    assert export['status'] == run['status'] == 'complete'
    assert run['methods'] == ['hard', 'confidence'] and run['targetMode'] == 'native'
    assert export['frozenBodyExact'] and export['frozenProjectionExact']
    assert run['probeManifestSha256'] == digest((args.input/'manifest.json').read_bytes())
    for source in [export, run]:
        for file, expected in source['sourceHashes'].items():
            # The exporter records sibling names; the pipeline records paths.
            path = Path(file) if '/' in file else Path(__file__).with_name(file)
            assert digest(path.read_bytes()) == expected, str(path)
    assert not args.output.exists()
    args.output.mkdir()
    rows, panels, galleries = [], [], []
    colours = np.array([[255, 255, 255], [185, 19, 19]])
    for entry in inputs['rows']:
        pair = {m: next(r for r in run['rows'] if r['id'] == entry['id'] and r['method'] == m)
                for m in run['methods']}
        emitted = next(r for r in export['rows'] if r['id'] == entry['id'])
        assert digest(Path(entry['file']).read_bytes()) == entry['photoSha256']
        photos = [Image.open(entry['file']).convert('RGB')]
        row = {'id': entry['id']}
        if 'selectedCrop' not in pair['hard']:
            assert all(r['status'] == 'crop-unresolved' for r in pair.values())
            assert emitted['status'] == 'crop-unresolved'
            row['status'] = 'crop-unresolved'
            photos += [None]*5
        else:
            hard, soft = pair['hard'], pair['confidence']
            n = hard['resolution']
            assert soft['resolution'] == n and soft['selectedCrop'] == hard['selectedCrop']
            assert hard['assets']['crop.png']['sha256'] == soft['assets']['crop.png']['sha256']
            assert hard['assets'].get('observed.bin', {}).get('sha256') == soft['assets'].get('observed.bin', {}).get('sha256')
            valid = (np.frombuffer(checked(args.run, hard['assets']['observed.bin']).read_bytes(),
                                  np.uint8).reshape(n, n).astype(bool)
                     if 'observed.bin' in hard['assets'] else np.ones((n, n), bool))
            masks = [checked(args.input, entry['assets'][m]['mask']).read_bytes() for m in pair]
            assert masks[0] == masks[1]
            mask = np.frombuffer(masks[0], np.uint8).reshape(n, n)
            for candidate in pair.values():
                assert candidate['targetMaskSha256'] == digest(masks[0])
                assert candidate['observedPixels'] == int(valid.sum())
            raw = checked(args.input, entry['assets']['confidence']['scores']).read_bytes()
            assert emitted['scoreHashes']['hard'] == emitted['scoreHashes']['confidence'] == digest(raw)
            scores = np.frombuffer(raw, '<f4').reshape(n, n)
            temperature = entry['assets']['confidence']['scores']['temperature']
            assert temperature == soft['nativeConfidence']['temperature'] == 4
            assert soft['nativeConfidence']['scoresSha256'] == digest(raw)
            # Independent NumPy double-precision sigmoid. JS/NumPy elementary
            # functions can differ by an ulp; the recorded bytes stay pinned.
            expected = 1/(1+np.exp(-temperature*scores.astype(np.float64)))
            expected[~valid] = .5
            probability_bytes = checked(args.run, soft['assets']['fitting-probability.bin']).read_bytes()
            probability = np.frombuffer(probability_bytes, '<f4').reshape(n, n)
            assert digest(probability_bytes) == soft['targetProbabilitySha256']
            assert np.isfinite(probability).all()
            maximum_difference = float(np.abs(probability-expected).max())
            assert maximum_difference <= np.finfo(np.float32).eps
            hard_field = mask.astype('<f4')
            assert digest(hard_field.tobytes()) == hard['targetProbabilitySha256']
            ties = ((probability >= .5) != mask.astype(bool)) & valid
            assert int(ties.sum()) == soft['nativeConfidence']['thresholdRoundoffPixels']
            assert (np.abs(scores[ties]) <= 1e-6).all()
            photos += [Image.open(checked(args.run, hard['assets']['crop.png'])).convert('RGB'),
                       Image.fromarray(colours[mask].astype(np.uint8)),
                       Image.fromarray(np.rint(colours[0]+probability[:, :, None]*(colours[1]-colours[0])).astype(np.uint8))]
            row.update(status='complete', observedPixels=int(valid.sum()),
                       thresholdRoundoffPixels=int(ties.sum()),
                       maximumProbabilityReplayDifference=maximum_difference,
                       scoreQuantiles=np.quantile(scores[valid], [0, .1, .5, .9, 1]).tolist(),
                       meanBoundaryForce=float(np.abs(1-2*probability[valid]).mean()),
                       uncertainFraction=float(((probability[valid] > .25) & (probability[valid] < .75)).mean()),
                       binarySquaredLossFloor=float(np.minimum(probability[valid]**2, (1-probability[valid])**2).mean()),
                       candidates={})
            for method, candidate in pair.items():
                if 'woven.png' not in candidate['assets']:
                    photos.append(None)
                    row['candidates'][method] = {'status': candidate['status'], 'error': candidate.get('error')}
                    continue
                woven = np.asarray(Image.open(checked(args.run, candidate['assets']['woven.png'])).convert('L')) < 128
                error = float((woven[valid] != mask[valid]).mean())
                assert error == candidate['independentImage']['mismatchFraction']
                row['candidates'][method] = {
                    'binaryDisagreement': error,
                    'softSquaredLoss': float(((woven[valid]-probability[valid])**2).mean()),
                    'confidenceWeightedDisagreement': float((np.abs(1-2*probability[valid])*(woven[valid] != mask[valid])).mean()),
                    'checkedPair': candidate['checkedPair'],
                }
                metric = row['candidates'][method]
                # Binary rendering turns squared soft-target loss into a
                # constant plus disagreement weighted by |1 - 2p|.
                assert abs(metric['softSquaredLoss']-row['binarySquaredLossFloor']-
                           metric['confidenceWeightedDisagreement']) <= 2*np.finfo(np.float32).eps
                photos.append(Image.fromarray(colours[woven.astype(int)].astype(np.uint8)))
        rows.append(row)
        panels.append((entry['id'], photos, row))
    for start in range(0, len(panels), 3):
        batch = panels[start:start+3]
        sheet = Image.new('RGB', (1440, 300*len(batch)), '#eeeeee')
        draw = ImageDraw.Draw(sheet)
        for j, (identity, photos, row) in enumerate(batch):
            draw.text((4, j*300+2), identity, fill='black')
            labels = ['Photo', 'Fixed crop', 'Fixed binary mask', 'sigmoid(4 * score)', 'Hard target weave', 'Confidence target weave']
            for k, (photo, label) in enumerate(zip(photos, labels)):
                if photo is not None:
                    photo = photo.copy()
                    photo.thumbnail((236, 236))
                    sheet.paste(photo, (k*240+(240-photo.width)//2, j*300+20))
                draw.text((k*240+3, j*300+258), label, fill='black')
            if row['status'] == 'complete':
                draw.text((723, j*300+275), 'Mean force %.3f' % row['meanBoundaryForce'], fill='black')
                for k, method in enumerate(run['methods']):
                    metric = row['candidates'][method]
                    draw.text((963+240*k, j*300+275),
                              '%.2f%% binary error' % (100*metric['binaryDisagreement'])
                              if 'binaryDisagreement' in metric else metric['status'], fill='black')
        file = args.output/('confidence-%02d.jpg' % (start//3+1))
        sheet.save(file, quality=92)
        galleries.append({**reference(file), 'ids': [p[0] for p in batch]})
    report = {
        'schema': 'native-confidence-audit-1', 'status': 'complete',
        'input': reference(args.input/'manifest.json'), 'export': reference(args.input/'report.json'),
        'run': reference(args.run/'report.json'), 'source': reference(Path(__file__)),
        'scope': 'Independent field reconstruction and immutable binary-mask validation on all declared cases. '
                 'The logistic field is not established photographic calibration. No training, crop changes or fitting.',
        'gallery': galleries, 'rows': rows,
    }
    (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'photos': len(rows), 'auditedFields': sum(r['status'] == 'complete' for r in rows),
                      'galleries': len(galleries)}))


if __name__ == '__main__':
    main()
