"""Audit every paired border experiment and render a compact comparison."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw


def sha(data):
    return hashlib.sha256(data).hexdigest()


def checked(root, asset):
    file = (root / asset['path']).resolve()
    assert file.is_relative_to(root.resolve())
    data = file.read_bytes()
    assert sha(data) == asset['sha256'], str(file)
    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--scheduling', type=Path, required=True)
    parser.add_argument('--repair', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    roots = [args.baseline, args.scheduling, args.repair]
    reports = [json.loads((root / 'report.json').read_text()) for root in roots]
    plans = []
    for report in reports:
        assert report['schema'] == 'border-priority-replay-1'
        assert report['status'] == 'complete'
        raw = Path(report['plan']['path']).read_bytes()
        assert sha(raw) == report['plan']['sha256']
        plans.append(json.loads(raw))
    n = plans[0]['resolution']
    assert all(p['fitOrder'] == plans[0]['fitOrder'] for p in plans)
    assert all(p['inputs'] == plans[0]['inputs'] for p in plans)
    assert all(r['configuration'] == reports[0]['configuration'] for r in reports)
    args.output.mkdir()
    rows = []
    for method, root, report in zip(['baseline', 'scheduling-only', 'provisional-repair'], roots, reports):
        assert [r['variant'] for r in report['runs']] == plans[0]['fitOrder']
        masks = {name: checked(root, value['asset']) for name, value in report['variants'].items()}
        for name, mask in masks.items():
            assert len(mask) == n*n and set(mask) <= {0, 1}
            baseline_mask = checked(roots[0], reports[0]['variants'][name]['asset'])
            assert mask == baseline_mask
        for index, work in enumerate(report['fixedWork']):
            assert work == reports[0]['fixedWork'][index], 'Fixed-work results must replay exactly.'
            for finalist in work['finalists']:
                checked(root, finalist['mask'])
                assert finalist['steps'] == 150
        for run in report['runs']:
            assert 'error' not in run
            checked(root, run['geometry'])
            details = json.loads(checked(root, run['report']))
            checked(root, run['woven'])
            woven = checked(root, run['mask'])
            decoded = Image.open(root / run['woven']['path']).convert('L')
            assert decoded.size == (n, n)
            assert bytes(int(v < 128) for v in decoded.tobytes()) == woven
            error = sum(a != b for a, b in zip(woven, masks[run['variant']])) / len(woven)
            mixed_error = sum(a != b for a, b in zip(woven, masks['mixed'])) / len(woven)
            assert error == run['inputError']
            assert mixed_error == run['unchangedMixedError']
            assert details['templateChecksPassed'] == run['templateChecksPassed']
            assert details['validation']['passed'] == run['geometryPassed']
            assert details['manufacturing']['status'] == run['paperStatus']
            solver = details['solver']
            rows.append({
                'method': method, 'index': run['index'], 'variant': run['variant'],
                'error': error, 'unchangedMixedError': mixed_error,
                'templateChecksPassed': run['templateChecksPassed'],
                'geometryPassed': run['geometryPassed'], 'paperStatus': run['paperStatus'],
                'featuresPassed': run['features']['passed'], 'missing': run['features']['missing'],
                'seconds': run['seconds'], 'featureRoutingFirst': run['featureRoutingFirst'],
                'traceUsed': run['traceUsed'],
                'recovery': {
                    'accepted': solver.get('featureRecovery', {}).get('accepted'),
                    'attempts': [{
                        'initialError': a.get('continuousRepair', {}).get('initialImageError'),
                        'reason': a.get('continuousRepair', {}).get('reason'),
                        'accepted': a.get('continuousRepair', {}).get('accepted'),
                        'refinedError': a.get('continuousRepair', {}).get('imageError'),
                        'termination': a.get('solver', {}).get('termination'),
                    } for a in (solver.get('featureRecovery') or {}).get('attempts', [])],
                },
            })
    canvas = Image.new('RGB', (1400, 4*240), (232, 232, 232))
    draw = ImageDraw.Draw(canvas)
    for y, name in enumerate(plans[0]['variants']):
        panels = [(checked(roots[0], reports[0]['variants'][name]['asset']), name)]
        for method, root, report in zip(['baseline', 'schedule', 'repair'], roots, reports):
            for run in report['runs']:
                if run['variant'] == name:
                    panels.append((checked(root, run['mask']), '{} {:.2f}%; checks {}'.format(
                        method, run['inputError']*100, run['templateChecksPassed'])))
        for x, (mask, label) in enumerate(panels):
            gray = Image.frombytes('L', (n, n), mask).point(lambda v: 255-255*v)
            other = gray.point(lambda v: 30+v*225//255)
            tile = Image.merge('RGB', (Image.new('L', (n, n), 240), other, other)).resize((194, 194))
            canvas.paste(tile, (x*200+3, y*240+36))
            draw.text((x*200+3, y*240+4), label, fill=(0, 0, 0))
    gallery = args.output / 'comparison.jpg'
    canvas.save(gallery, quality=90)
    summary = {
        'schema': 'border-priority-review-1', 'status': 'complete',
        'reports': [{'path': str(root / 'report.json'), 'sha256': sha((root / 'report.json').read_bytes())} for root in roots],
        'verifiedRuns': len(rows), 'verifiedFixedWorkMasks': sum(len(r['finalists']) for report in reports for r in report['fixedWork']),
        'rows': rows, 'gallery': {'path': str(gallery), 'sha256': sha(gallery.read_bytes())},
        'scope': 'All declared repeats retained. Counterfactual-mask checks are not checks against the original mixed mask. Missing border features remain failures.',
    }
    (args.output / 'report.json').write_text(json.dumps(summary, indent=2)+'\n')
    print(json.dumps({k: summary[k] for k in ['status', 'verifiedRuns', 'verifiedFixedWorkMasks']}))


if __name__ == '__main__':
    main()
