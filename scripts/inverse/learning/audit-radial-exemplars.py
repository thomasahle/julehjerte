"""Recompute both radial cohorts from saved masks and fractional source labels."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation

from data import checked_asset, digest
from exemplar_experiment import reference
from foreground import physical_foreground
from material_pilot import conditional_material_labels
from paper_exemplars import overlap_region
from preserved_candidate import pinned


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--joint', required=True, type=Path)
    parser.add_argument('--residual', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    assert not args.output.exists()
    reports = {k: json.loads((p/'report.json').read_bytes())
               for k, p in [('joint', args.joint), ('residual', args.residual)]}
    a, b = reports.values()
    assert a['status'] == b['status'] == 'complete'
    assert a['models'] == b['models'] and a['bodySha256'] == b['bodySha256']
    plans = [json.loads(pinned(r['plan']).read_bytes()) for r in reports.values()]
    assert plans[0]['dataset'] == plans[1]['dataset']
    assert plans[0]['viewIds'] == plans[1]['viewIds'] == [r['id'] for r in a['rows']] == [r['id'] for r in b['rows']]
    assert reference(args.joint/'report.json') == plans[1]['controlReport']
    manifest_path = pinned(plans[0]['dataset'])
    manifest = json.loads(manifest_path.read_bytes())
    views = {v['id']: v for v in manifest['views']}
    rows = []
    for joint, residual in zip(a['rows'], b['rows']):
        assert joint['status'] == residual['status'] == 'complete'
        assert joint['evidence'] == residual['evidence']
        view = views[joint['id']]
        labels = json.loads(checked_asset(manifest_path.parent, view['assets']['labels.json']).read_bytes())
        coverage_file = checked_asset(manifest_path.parent, view['assets']['photo-paper-a.png'])
        with Image.open(coverage_file) as image:
            coverage = np.asarray(image.convert('L'), dtype=np.float32)/255
        target = conditional_material_labels(coverage, physical_foreground(labels, 320))
        assert digest(target.tobytes()) == joint['evidence']['materialLabelsSha256']
        matrix = np.asarray(labels['canonicalToPhoto']).reshape(3, 3)@np.diag([100, 100, 1])
        region = overlap_region(matrix, 320, (labels['resolution'],)*2)
        valid = region & (target != 255)
        truth = target.astype(np.float64)
        hard = truth >= .5
        edge = np.zeros(valid.shape, bool)
        horizontal = valid[:, 1:] & valid[:, :-1] & (hard[:, 1:] != hard[:, :-1])
        vertical = valid[1:] & valid[:-1] & (hard[1:] != hard[:-1])
        edge[:, 1:] |= horizontal
        edge[:, :-1] |= horizontal
        edge[1:] |= vertical
        edge[:-1] |= vertical
        band = binary_dilation(edge, np.ones((3, 3), bool), iterations=2) & valid
        row = {'id': joint['id'], 'minimumHardLabelError': float(np.minimum(truth[valid], 1-truth[valid]).mean()),
               'methods': {}}
        rgb = None
        for head, original in [('joint', joint), ('residual', residual)]:
            with np.load(pinned(original['masks'])) as masks:
                assert np.array_equal(masks['valid'].astype(bool), valid)
                if rgb is None:
                    rgb = masks['rgb-only'].copy()
                else:
                    assert np.array_equal(rgb, masks['rgb-only'])
                for name, metric in original['metrics'].items():
                    prediction = masks[name].astype(bool)
                    error = np.where(prediction, 1-truth, truth)
                    flip = bool((1-error[valid]).sum() < error[valid].sum())
                    if flip:
                        error = 1-error
                    value = float(error[valid].mean())
                    assert flip == metric['materialPhaseExchanged']
                    assert abs(value-metric['materialPixelError']) < 1e-12
                    for key, support in [('boundaryError', band), ('interiorError', valid & ~band)]:
                        assert abs(float(error[support].mean())-original['boundaries'][name][key]) < 1e-12
                    row['methods'][head+':'+name] = value
        rows.append(row)
    result = {'schema': 'radial-exemplar-audit-1', 'passed': True,
              'reports': {k: reference(p/'report.json') for k, p in [('joint', args.joint), ('residual', args.residual)]},
              'cases': len(rows), 'recomputedScores': len(rows)*8,
              'rgbExactReplays': len(rows),
              'meanMinimumHardLabelError': float(np.mean([r['minimumHardLabelError'] for r in rows])),
              'meanErrors': {k: float(np.mean([r['methods'][k] for r in rows])) for k in rows[0]['methods']},
              'rows': rows,
              'scope': 'Independent score and phase arithmetic on source-reconstructed fractional targets; common camera/body/label resampling helpers. Binary classification has nonzero unavoidable expected disagreement on fractional antialiased labels.'}
    args.output.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({k: v for k, v in result.items() if k not in ['rows', 'reports']}))


if __name__ == '__main__':
    main()
