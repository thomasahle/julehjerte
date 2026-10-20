"""Compare frozen baseline fits with native RGB fits, including editable exports."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def pinned(asset):
    path = Path(asset['path'])
    raw = path.read_bytes()
    assert digest(raw) == asset['sha256'], str(path)
    return json.loads(raw)


def reference(path):
    return {'path': str(path), 'sha256': digest(path.read_bytes())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--probe', type=Path, required=True)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--editor', type=Path, required=True)
    parser.add_argument('--baseline-editor', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_bytes())
    baseline = pinned(plan['previousPipeline'])
    baseline_root = Path(plan['previousPipeline']['path']).parent
    old_inputs = pinned(plan['previousInput'])
    run = json.loads((args.run/'report.json').read_bytes())
    inputs = json.loads((args.probe/'manifest.json').read_bytes())
    probe = json.loads((args.probe/'report.json').read_bytes())
    assert run['status'] == baseline['status'] == probe['status'] == 'complete'
    assert run['probeManifestSha256'] == digest((args.probe/'manifest.json').read_bytes())
    assert baseline['probeManifestSha256'] == plan['previousInput']['sha256']
    assert [r['id'] for r in inputs['rows']] == plan['expectedDevelopmentCases']
    assert [r['id'] for r in old_inputs['rows']] == plan['expectedDevelopmentCases']
    assert run['methods'] == ['native-rgb']
    assert baseline['methods'] == ['production', 'rgb-only', 'neutral-deviation']
    assert run['configuration'] == baseline['configuration']
    checks = 0
    changed_helpers = {
        'scripts/inverse/learning/replay-material-pair.mjs',
        'scripts/inverse/learning/material-target.mjs',
    }
    changed = set()
    assert run['sourceHashes'].keys() == baseline['sourceHashes'].keys()
    for file, expected in run['sourceHashes'].items():
        local = Path(file)
        assert digest(local.read_bytes()) == expected, file
        old = baseline['sourceHashes'][file]
        if old != expected:
            relative = str(local.resolve().relative_to(Path.cwd()))
            changed.add(relative)
            historical = subprocess.check_output(
                ['git', 'show', plan['baselineCommit']+':'+relative])
            assert digest(historical) == old, relative
        checks += 2
    assert changed == changed_helpers
    editors = {}
    for file in [args.editor/'results.json', args.baseline_editor/'results.json']:
        report = json.loads(file.read_bytes())
        for source, expected in report['sourceHashes'].items():
            assert digest(Path(source).read_bytes()) == expected, source
            checks += 1
        for row in report['results']:
            assert row['id'] not in editors
            editors[row['id']] = row
    assert len(editors) == plan['expectedDevelopmentCrops']*4
    methods = baseline['methods']+run['methods']
    by_key = {(r['id'], r['method']): r for r in baseline['rows']+run['rows']}
    assert len(by_key) == len(inputs['rows'])*len(methods)
    colours = np.array([[255, 255, 255], [185, 19, 19]], np.uint8)
    results, panels = [], []

    def checked(root, asset):
        nonlocal checks
        path = root/asset['path']
        assert path.resolve().is_relative_to(root.resolve())
        assert digest(path.read_bytes()) == asset['sha256'], str(path)
        checks += 1
        return path

    for entry in inputs['rows']:
        identity = entry['id']
        assert digest(Path(entry['file']).read_bytes()) == entry['photoSha256']
        checks += 1
        rows = [by_key[identity, method] for method in methods]
        assert all(r['sourceSha256'] == entry['photoSha256'] for r in rows)
        result = {'id': identity, 'methods': {}}
        photos = [ImageOps.exif_transpose(Image.open(entry['file'])).convert('RGB')]
        labels = ['Source photograph']
        for method, row in zip(methods, rows):
            root = args.run if method == 'native-rgb' else baseline_root
            for asset in row['assets'].values():
                checked(root, asset)
        if 'selectedCrop' not in rows[0]:
            assert all(r['status'] == 'crop-unresolved' for r in rows)
            result['status'] = 'crop-unresolved'
            photos += [None]*7
            labels += ['No fixed crop']*7
        else:
            result['status'] = 'fitted'
            n = rows[0]['resolution']
            first = rows[0]
            valid = np.ones((n, n), bool)
            if 'observed.bin' in first['assets']:
                valid = np.frombuffer(checked(baseline_root, first['assets']['observed.bin'])
                                      .read_bytes(), np.uint8).reshape(n, n) != 0
            photos.append(Image.open(checked(baseline_root, first['assets']['crop.png'])).convert('RGB'))
            labels.append('Fixed crop')
            images = {}
            production_mask = None
            for method, row in zip(methods, rows):
                root = args.run if method == 'native-rgb' else baseline_root
                for key in ['selectedCrop', 'resolution', 'observedPixels']:
                    assert row[key] == first[key], (identity, key)
                assert row['observedPixels'] == int(valid.sum())
                for name in ['crop.png', 'observed.bin']:
                    assert row['assets'].get(name, {}).get('sha256') == first['assets'].get(name, {}).get('sha256')
                mask = np.asarray(Image.open(checked(root, row['assets']['mask.png'])).convert('RGB'))[:, :, 1] < 128
                assert mask.shape == (n, n)
                assert digest(mask.astype(np.uint8).tobytes()) == row['targetMaskSha256']
                if production_mask is None:
                    production_mask = mask
                    prior = next(r for r in old_inputs['rows'] if r['id'] == identity)
                    assert row['targetMaskSha256'] == prior['expectedProductionMaskSha256']
                difference = float((mask[valid] != production_mask[valid]).mean())
                flip = difference > .5
                woven = np.asarray(Image.open(checked(root, row['assets']['woven.png'])).convert('L')) < 128
                error = float((woven[valid] != mask[valid]).mean())
                assert error == row['independentImage']['mismatchFraction']
                editor = editors[identity+'-'+method]
                assert editor['geometrySha256'] == row['assets']['cut_geometry.json']['sha256']
                assert editor['maskSha256'] == row['targetMaskSha256']
                assert editor['engineChecksPassed'] == row['checkedPair']
                assert editor['independentEngineError'] == error
                result['methods'][method] = {
                    'status': row['status'], 'checkedPair': row['checkedPair'],
                    'conversionPassed': editor['conversionPassed'],
                    'completeCandidatePassed': editor['completeCandidatePassed'],
                    'fitError': error, 'editableError': editor.get('editableError'),
                    'slits': row['report']['slits'],
                    'missingFeatures': len(row.get('independentFeatures', {}).get('missing', [])),
                    'geometryPassed': row['report']['validation']['passed'],
                    'paperStatus': row['report']['manufacturing']['status'],
                    'maskClassFraction': float(mask[valid].mean()),
                    'phaseInvariantDifferenceFromProduction': min(difference, 1-difference),
                    'displayPhaseFlipped': flip,
                }
                images[method] = [Image.fromarray(colours[(image ^ flip).astype(int)])
                                  for image in [mask, woven]]
            for method, title in [('rgb-only', 'Low-resolution RGB'), ('native-rgb', 'Direct crop RGB')]:
                photos += images[method]
                labels += [title+' mask', title+' weave']
            for method, title in [('production', 'Production weave'), ('neutral-deviation', 'Neutral std weave')]:
                photos.append(images[method][1])
                labels.append(title)
        results.append(result)
        panels.append((identity, photos, labels))
    assert not args.output.exists()
    args.output.mkdir(parents=True)
    galleries = []
    for start in range(0, len(panels), 3):
        batch = panels[start:start+3]
        sheet = Image.new('RGB', (8*240, 280*len(batch)), '#eeeeee')
        draw = ImageDraw.Draw(sheet)
        for j, (identity, photos, labels) in enumerate(batch):
            draw.text((4, j*280+2), identity, fill='black')
            for k, (photo, label) in enumerate(zip(photos, labels)):
                if photo is not None:
                    photo = photo.copy()
                    photo.thumbnail((236, 236))
                    sheet.paste(photo, (k*240+(240-photo.width)//2, j*280+18))
                draw.text((k*240+3, j*280+258), label, fill='black')
        file = args.output/('review-%02d.jpg' % (start//3+1))
        sheet.save(file, quality=92)
        galleries.append({**reference(file), 'ids': [p[0] for p in batch]})
    summary = {method: {
        'cases': len(results),
        'crops': sum(method in r['methods'] for r in results),
        **{key: sum(bool(r['methods'].get(method, {}).get(key)) for r in results)
           for key in ['checkedPair', 'conversionPassed', 'completeCandidatePassed']},
    } for method in methods}
    report = {
        'schema': 'paper-exemplar-native-review-1', 'status': 'complete',
        'plan': reference(args.plan), 'pipeline': reference(args.run/'report.json'),
        'probe': reference(args.probe/'report.json'),
        'baseline': plan['previousPipeline'],
        'editor': reference(args.editor/'results.json'),
        'baselineEditor': reference(args.baseline_editor/'results.json'),
        'source': reference(Path(__file__)), 'changedOfflineHelpers': sorted(changed),
        'hashChecks': checks, 'summary': summary, 'rows': results, 'gallery': galleries,
        'scope': 'All declared cases; unchanged production fitter, crop RGB, coverage and resolution. '
                 'All 104 independent export errors recomputed from PNGs. Previous fits are frozen '
                 'references, not simultaneous speed controls. These are self-mask checks, not '
                 'recovered-artwork counts. Display phases only are aligned with production.',
    }
    (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'hashChecks': checks, 'summary': summary}))


if __name__ == '__main__':
    main()
