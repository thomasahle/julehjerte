"""Retain the full neural-mask cohort and independently rescore its exports."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw


def reference(path):
    return {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def asset(root, ref):
    path = (root/ref['path']).resolve()
    assert path.is_relative_to(root.resolve())
    raw = path.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == ref['sha256']
    return raw


def rgb(raw):
    return Image.open(io.BytesIO(raw)).convert('RGB')


def main():
    parser = argparse.ArgumentParser()
    for key in ['baseline', 'run', 'baseline-editor', 'editor', 'output']:
        parser.add_argument('--'+key, type=Path, required=True)
    args = parser.parse_args()
    roots = [args.baseline, args.run]
    runs = [json.loads((root/'report.json').read_text()) for root in roots]
    assert all(r['status'] == 'complete' for r in runs)
    assert runs[0]['configuration'] == runs[1]['configuration']
    assert runs[0]['probeManifestSha256'] == runs[1]['probeManifestSha256']
    assert runs[0]['methods'] == runs[1]['methods'] == ['real-mixed']
    changed = [f for f in runs[0]['sourceHashes'] if runs[0]['sourceHashes'][f] != runs[1]['sourceHashes'][f]]
    assert changed == ['static/inverse/core/direct/rejected-routing.js']
    editors = [json.loads((root/'results.json').read_text()) for root in [args.baseline_editor, args.editor]]
    assert [r['id'] for r in runs[0]['rows']] == [r['id'] for r in runs[1]['rows']]
    assert [r['id'] for r in editors[0]['results']] == [r['id'] for r in editors[1]['results']]
    args.output.mkdir()
    rows, tiles = [], []
    counts = {'engineRenders': 0, 'editableRenders': 0}
    for before, after in zip(runs[0]['rows'], runs[1]['rows']):
        identity = before['id']
        assert before['selectedCrop'] == after['selectedCrop'] if 'selectedCrop' in before else 'selectedCrop' not in after
        row = {'id': identity, 'methods': {}}
        rows.append(row)
        panels = []
        for method, root, run, editor_root, editor in zip(
                ['previous', 'current'], roots, [before, after],
                [args.baseline_editor, args.editor], editors):
            # Inspect every stored export, including failed candidates.
            for a in run['assets'].values():
                asset(root, a)
            result = {'status': run['status'], 'enginePassed': bool(run.get('checkedPair'))}
            row['methods'][method] = result
            if 'independentImage' not in run:
                assert run['status'] == 'crop-unresolved'
                continue
            assert before['targetMaskSha256'] == after['targetMaskSha256']
            assert before['observedPixels'] == after['observedPixels']
            mask_image = rgb(asset(root, run['assets']['mask.png']))
            mask = np.asarray(mask_image)[:, :, 1] < 128
            assert hashlib.sha256(mask.astype(np.uint8).tobytes()).hexdigest() == run['targetMaskSha256']
            valid = np.ones(mask.shape, dtype=bool)
            if 'observed.bin' in run['assets']:
                valid = np.frombuffer(asset(root, run['assets']['observed.bin']), np.uint8).reshape(mask.shape) > 0
            assert int(valid.sum()) == run['observedPixels']
            woven = rgb(asset(root, run['assets']['woven.png']))
            error = float(np.count_nonzero(((np.asarray(woven)[:, :, 0] < 128) != mask) & valid)/valid.sum())
            assert error == run['independentImage']['mismatchFraction']
            counts['engineRenders'] += 1
            converted = next(r for r in editor['results'] if r['id'] == identity+'-real-mixed')
            assert converted['maskSha256'] == run['targetMaskSha256']
            assert converted['geometrySha256'] == run['assets']['cut_geometry.json']['sha256']
            editable_file = editor_root/(converted['id']+'-automatic-weave.png')
            if editable_file.exists():
                editable = Image.open(editable_file).convert('RGB')
                # Editor exports retain the app's red/white palette.
                prediction = np.asarray(editable)[:, :, 1] < 128
                editable_error = float(np.count_nonzero((prediction != mask) & valid)/valid.sum())
                assert abs(editable_error-converted['editableError']) < 1e-12
                counts['editableRenders'] += 1
            else:
                editable = None
                assert not converted['conversionPassed']
            result.update({
                'error': error, 'conversionPassed': converted['conversionPassed'],
                'completePassed': converted['completeCandidatePassed'],
                'failure': converted.get('error'), 'seconds': run['solveSeconds'],
                'editableError': converted.get('editableError'),
                'geometryPassed': run['report']['validation']['passed'],
                'paperStatus': run['report']['manufacturing']['status'],
                'borderRepair': any(a.get('continuousRepair', {}).get('reason') == 'border_feature_refinement_seed'
                                    for a in (run['report']['solver'].get('featureRecovery') or {}).get('attempts', [])),
            })
            if method == 'previous':
                panels += [(rgb(asset(root, run['assets']['crop.png'])), 'photo'),
                           (mask_image, 'fixed mask'), (woven, 'previous {:.2f}%'.format(error*100))]
            else:
                panels += [(woven, 'current {:.2f}%'.format(error*100)),
                           (editable, 'editable '+('pass' if converted['conversionPassed'] else 'FAIL'))]
        if panels:
            tiles.append((identity, panels))
    galleries = []
    for start in range(0, len(tiles), 4):
        group = tiles[start:start+4]
        canvas = Image.new('RGB', (1200, 280*len(group)), (230, 230, 230))
        draw = ImageDraw.Draw(canvas)
        for j, (identity, panels) in enumerate(group):
            draw.text((5, j*280+4), identity, fill='black')
            for i, (image, label) in enumerate(panels):
                draw.text((i*240+5, j*280+23), label, fill='black')
                if image is not None:
                    canvas.paste(image.resize((230, 230)), (i*240+5, j*280+44))
        file = args.output/('comparison-{:02d}.jpg'.format(len(galleries)+1))
        canvas.save(file, quality=90)
        galleries.append({**reference(file), 'ids': [g[0] for g in group]})
    result = {
        'schema': 'border-repair-cohort-review-1', 'status': 'complete',
        'references': [reference(root/'report.json') for root in roots]+[
            reference(root/'results.json') for root in [args.baseline_editor, args.editor]],
        'changedRuntimeFiles': changed, 'rows': rows, 'galleries': galleries, 'audit': counts,
        'summary': {method: {
            'total': len(rows),
            **{key: sum(bool(r['methods'][method].get(key)) for r in rows)
               for key in ['enginePassed', 'conversionPassed', 'completePassed', 'borderRepair']},
        } for method in ['previous', 'current']},
        'scope': 'Same 32 cases, masks, crop coordinates and observations. All six unresolved crops and conversion failures retained. Agreement is with a derived mask, not unavailable original artwork.',
    }
    (args.output/'report.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result['summary']))


if __name__ == '__main__':
    main()
