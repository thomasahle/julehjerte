"""Audit fixed-crop classifier fits and render every development case for review."""
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    raw = (args.run/'report.json').read_bytes()
    run = json.loads(raw)
    inputs_raw = (args.input/'manifest.json').read_bytes()
    inputs = json.loads(inputs_raw)
    assert run['status'] == 'complete'
    assert run['probeManifestSha256'] == digest(inputs_raw)
    for file, expected in run['sourceHashes'].items():
        assert digest(Path(file).read_bytes()) == expected, file
    assert not args.output.exists()
    methods = run['methods']
    assert methods and len(methods) == len(set(methods))
    assert all(m == 'production' or m in inputs['methods'] for m in methods)
    columns = 2+2*len(methods)
    assert len(run['rows']) == len(inputs['rows'])*len(methods)
    args.output.mkdir(parents=True)
    results, panels, checks = [], [], 0
    colours = np.array([[255, 255, 255], [185, 19, 19]], dtype=np.uint8)
    for entry in inputs['rows']:
        rows = [next(r for r in run['rows'] if r['id'] == entry['id'] and
                     r['method'] == method) for method in methods]
        assert all(r['sourceSha256'] == entry['photoSha256'] for r in rows)
        assert digest(Path(entry['file']).read_bytes()) == entry['photoSha256']
        checks += 1
        for row in rows:
            for asset in row['assets'].values():
                checked(args.run, asset)
                checks += 1
        photos = [Image.open(entry['file']).convert('RGB')]
        metrics = {'id': entry['id'], 'methods': {}}
        if 'selectedCrop' not in rows[0]:
            assert all(r['status'] == 'crop-unresolved' for r in rows)
            metrics['status'] = 'crop-unresolved'
            photos += [None]*(columns-1)
            labels = ['Photo']+['No fixed crop']*(columns-1)
        else:
            n = rows[0]['resolution']
            for row in rows:
                assert row['selectedCrop'] == rows[0]['selectedCrop']
                assert row['resolution'] == n
                assert row['observedPixels'] == rows[0]['observedPixels']
                assert row['assets']['crop.png']['sha256'] == rows[0]['assets']['crop.png']['sha256']
                assert row['assets'].get('observed.bin') is None or (
                    row['assets']['observed.bin']['sha256'] == rows[0]['assets']['observed.bin']['sha256'])
            photos.append(Image.open(checked(args.run, rows[0]['assets']['crop.png'])).convert('RGB'))
            labels = ['Photo', 'Fixed crop']
            valid = (np.frombuffer(checked(args.run, rows[0]['assets']['observed.bin']).read_bytes(),
                                   dtype=np.uint8).reshape(n, n) != 0
                     if 'observed.bin' in rows[0]['assets'] else np.ones((n, n), bool))
            baseline = None
            masks, weaves = {}, {}
            metrics['status'] = 'fitted'
            for method, row in zip(methods, rows):
                pixel = np.asarray(Image.open(checked(args.run, row['assets']['mask.png'])).convert('RGB'))
                mask = pixel[:, :, 1] < 128
                masks[method] = mask
                assert digest(mask.astype(np.uint8).tobytes()) == row['targetMaskSha256']
                if method == 'production':
                    assert row['targetMaskSha256'] == entry['expectedProductionMaskSha256']
                elif run['targetMode'] == 'mask':
                    assert row['targetMaskSha256'] == entry['assets'][method]['mask']['sha256']
                if baseline is None:
                    baseline = mask
                disagreement = float((mask[valid] != baseline[valid]).mean())
                flipped = disagreement > .5
                aligned = mask ^ flipped
                photos.append(Image.fromarray(colours[aligned.astype(int)]))
                metric = {
                    'status': row['status'], 'checkedPair': bool(row.get('checkedPair')),
                    'maskSha256': row['targetMaskSha256'],
                    'phaseAlignedToFirstMethodForDisplay': flipped,
                    'phaseInvariantDifferenceFromFirstMethod': min(disagreement, 1-disagreement),
                    'maskClassFraction': float(mask[valid].mean()),
                    'fitError': row.get('independentImage', {}).get('mismatchFraction'),
                    'solveSeconds': row.get('solveSeconds'),
                    'slits': row.get('report', {}).get('slits'),
                    'geometryPassed': row.get('report', {}).get('validation', {}).get('passed'),
                    'paperStatus': row.get('report', {}).get('manufacturing', {}).get('status'),
                    'missingFeatures': len(row.get('independentFeatures', {}).get('missing', [])),
                }
                metrics['methods'][method] = metric
                if 'woven.png' in row['assets']:
                    woven = np.asarray(Image.open(checked(args.run, row['assets']['woven.png'])).convert('L')) < 128
                    weaves[method] = woven
                    # Replay the exact independent binary-error numerator.
                    error = float((woven[valid] != mask[valid]).mean())
                    assert error == metric['fitError']
                    photos.append(Image.fromarray(colours[(woven ^ flipped).astype(int)]))
                else:
                    photos.append(None)
                label = {'production': 'Production', 'rgb-only': 'Lobe RGB',
                         'neutral-deviation': 'Lobe neutral std',
                         'synthetic-control-joint': 'Joint context',
                         'synthetic-control-residual': 'Residual context'}.get(method, method)
                labels.extend([label+' mask', label+' weave'])
            # No refit: isolate target changes from which candidate the search
            # found. Physical checks belong to the source candidate; these
            # pixel errors alone do not establish alternate-target fidelity.
            metrics['crossMaskErrors'] = {
                source: {target: float((woven[valid] != mask[valid]).mean())
                         for target, mask in masks.items()}
                for source, woven in weaves.items()}
            metrics['maskDifferences'] = {
                source: {target: float((a[valid] != b[valid]).mean())
                         for target, b in masks.items()}
                for source, a in masks.items()}
        panels.append((entry['id'], photos, labels, metrics))
        results.append(metrics)
    galleries = []
    for start in range(0, len(panels), 3):
        batch = panels[start:start+3]
        sheet = Image.new('RGB', (columns*240, 300*len(batch)), '#eeeeee')
        draw = ImageDraw.Draw(sheet)
        for j, (identity, photos, labels, metrics) in enumerate(batch):
            draw.text((4, j*300+2), identity, fill='black')
            for k, (photo, label) in enumerate(zip(photos, labels)):
                if photo is not None:
                    photo = photo.copy()
                    photo.thumbnail((236, 236))
                    sheet.paste(photo, (k*240+(240-photo.width)//2, j*300+20))
                draw.text((k*240+3, j*300+258), label, fill='black')
            for k, method in enumerate(methods):
                metric = metrics['methods'].get(method)
                if metric:
                    error = metric['fitError']
                    text = ('%.2f%%; ' % (100*error) if error is not None else '')+metric['status']
                    draw.text(((3+2*k)*240+3, j*300+275), text, fill='black')
        file = args.output/('review-%02d.jpg' % (start//3+1))
        sheet.save(file, quality=92)
        galleries.append({'path': str(file), 'sha256': digest(file.read_bytes()),
                          'ids': [p[0] for p in batch]})
    report = {
        'schema': 'paper-exemplar-pipeline-review-2', 'status': 'complete',
        'methods': methods, 'displayPhaseReference': methods[0],
        'pipeline': {'path': str(args.run/'report.json'), 'sha256': digest(raw)},
        'input': {'path': str(args.input/'manifest.json'), 'sha256': digest(inputs_raw)},
        'source': {'path': __file__, 'sha256': digest(Path(__file__).read_bytes())},
        'hashChecks': checks, 'gallery': galleries, 'rows': results,
        'scope': 'Every declared case; common crop, resolution and coverage verified. '
                 'Candidate phases align with the first method only for display. All fit errors '
                 'replayed from independent exported PNGs, without artwork ground truth. '
                 'Cross-mask errors use the original colour phases and do not imply feature '
                 'fidelity or alternate-target acceptance.',
    }
    (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'photos': len(results), 'hashChecks': checks,
                      'galleries': len(galleries), 'summary': run['summary']}))


if __name__ == '__main__':
    main()
