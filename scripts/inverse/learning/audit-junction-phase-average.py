"""Rescore saved predictions and diagnose the existing target/peak decoder."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import maximum_flow

from data import detect_nodes, node_heatmap, scores
from localization import aggregate
from metrics import thin_boundary, pixel_matching_counts


def reference(file):
    return {'path': str(file), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}


def pinned(ref):
    file = Path(ref['path'])
    assert reference(file)['sha256'] == ref['sha256'], str(file)
    return file


def corner_counts(first, second, tolerance=3):
    """Dinic flow independently checks the runner's Hungarian assignment."""
    a, b = np.asarray(first).reshape(-1, 2), np.asarray(second).reshape(-1, 2)
    if not len(a) or not len(b):
        return [0, len(a), len(b)]
    edges = np.argwhere(np.linalg.norm(a[:, None, :]-b[None, :, :], axis=-1) <= tolerance)
    sink = len(a)+len(b)+1
    rows = np.r_[np.zeros(len(a), dtype=int), edges[:, 0]+1, np.arange(len(b))+1+len(a)]
    cols = np.r_[np.arange(len(a))+1, edges[:, 1]+1+len(a), np.full(len(b), sink)]
    network = csr_matrix((np.ones(len(rows), np.int32), (rows, cols)), shape=(sink+1, sink+1))
    return [int(maximum_flow(network, 0, sink, method='dinic').flow_value), len(a), len(b)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report_file = args.run/'report.json'
    report = json.loads(report_file.read_text())
    assert report['schema'] == 'junction-phase-average-probe-1' and report['status'] == 'complete'
    plan = json.loads(pinned(report['plan']).read_text())
    old = json.loads(pinned(plan['previousSyntheticReplay']).read_text())
    real = json.loads(pinned(plan['previousRealProbe']).read_text())
    original_references = {r['id']: np.asarray(r['reference'], np.float32).reshape(-1, 2) for r in old['rows']['cnn']}
    for ref in report['sources']:
        pinned(ref)
    assert corner_counts([[1, 1], [1, 1]], [[1, 1]]) == [1, 2, 1]
    assert corner_counts([[1, 1], [10, 10]], [[2, 2], [11, 11]]) == [2, 2, 2]
    verified, target_decode = [], []
    measurements = {m: [] for m in report['methods']}
    for row in report['rows']:
        with np.load(pinned(row['predictions'])) as archive:
            def unpack(name):
                data = archive[name]
                assert data.dtype == np.uint8 and data.shape == (384*384//8,)
                return np.unpackbits(data).reshape(384, 384).astype(bool)
            valid, boundary = unpack('valid'), unpack('reference_boundary')
            reference_nodes = archive['reference_nodes']
            assert np.array_equal(reference_nodes, original_references[row['id']])
            reference_thin = thin_boundary(boundary)
            row_checks = {}
            for method in report['methods']:
                predicted = unpack(method+'_boundary')
                assert not (predicted & ~valid).any()
                thin = thin_boundary(predicted)
                metric = row['methods'][method]
                assert metric['rawBoundaryPixels'] == int(predicted.sum())
                assert metric['thinBoundaryPixels'] == int(thin.sum())
                values = {}
                for tolerance in [1, 2, 3]:
                    counts = pixel_matching_counts(thin, reference_thin, tolerance)
                    assert scores(counts) == metric['boundary'][str(tolerance)]
                for label, name in [('junctions', method+'_nodes'), ('refinedJunctions', method+'_refined')]:
                    points = archive[name]
                    assert points.ndim == 2 and points.shape[1] == 2 and np.isfinite(points).all()
                    assert (points >= 0).all() and (points < 384).all()
                    if len(points):
                        assert valid[points[:, 1].astype(int), points[:, 0].astype(int)].all()
                    counts = corner_counts(points, reference_nodes)
                    assert scores(counts) == metric[label], (row['id'], method, label)
                    values[label] = counts
                assert len(archive[method+'_nodes']) == len(archive[method+'_refined'])
                row_checks[method] = values
                measurements[method].append(metric)
            # Post-hoc diagnostic prompted by closely spaced reference markers
            # in the review: decode the *ideal training target*, without a CNN.
            # This is not an upper bound on any possible model's recall: a
            # model can move peaks away from the exact heatmap target.
            ideal = node_heatmap(reference_nodes, 384)
            points = detect_nodes(ideal*valid, .4)
            target_decode.append({
                'id': row['id'], 'designId': row['designId'], 'split': row['split'],
                'counts': corner_counts(points, reference_nodes),
            })
            verified.append({'id': row['id'], 'methods': row_checks})
    for method, rows in measurements.items():
        assert aggregate(rows) == report['summary'][method]['raw']
        assert aggregate([{**r, 'junctions': r['refinedJunctions']} for r in rows]) == report['summary'][method]['refined']
    assert len(verified) == len(plan['expectedEvaluation']) == 308
    assert [r['id'] for r in verified] == [r['id'] for r in plan['expectedEvaluation']]
    real_rows = []
    for row, original in zip(report['realRows'], real['rows']):
        assert row['id'] == original['id'] and row['status'] == original['status']
        if row['status'] == 'crop-unresolved':
            real_rows.append({'id': row['id'], 'status': row['status']})
            continue
        assert row['sourceFields'] == original['fields']
        with np.load(pinned(original['fields'])) as fields:
            # Higher-precision independent arithmetic must give the same
            # Float16 average. The half-precision inputs are exactly representable.
            first, second = fields['original'].astype(np.float64), fields['exchanged'].astype(np.float64)
        average = ((first+second)/2).astype(np.float16)
        assert hashlib.sha256(average.tobytes()).hexdigest() == row['averageFieldSha256']
        assert np.array_equal(average, ((second+first)/2).astype(np.float16))
        real_rows.append({'id': row['id'], 'status': row['status'], 'independentAverageExact': True})
    assert len(real_rows) == 32
    target_summary = {}
    for split in sorted({r['split'] for r in target_decode}):
        rows = [r for r in target_decode if r['split'] == split]
        target_summary[split] = {
            'views': len(rows), **scores([sum(r['counts'][i] for r in rows) for i in range(3)]),
            'viewsWithEveryReferenceRecovered': sum(r['counts'][0] == r['counts'][2] for r in rows),
        }
    result = {
        'schema': 'junction-phase-average-audit-1', 'status': 'complete',
        'run': reference(report_file), 'source': reference(Path(__file__)),
        'scope': 'All saved predictions and every synthetic reference replay. Independent maximum-flow corner assignments; existing tested thin-boundary scorer reapplied to packed bitmaps. Higher-precision real-field averages replay exactly. No fitting, training or further model inference.',
        'duplicateProposalNegativeControlPassed': True,
        'syntheticRows': verified, 'realRows': real_rows,
        'idealTargetDecode': {
            'timing': 'Post-hoc diagnostic after inspecting close reference corners; did not select a method or threshold.',
            'method': 'Decode the exact existing Gaussian target using the unchanged peak detector and 0.4 threshold; score against original visible junctions.',
            'limitation': 'This is target/decoder consistency, not an upper bound on learned recall or a change to the reference labels.',
            'summary': target_summary, 'rows': target_decode,
        },
    }
    with args.output.open('x') as file:
        file.write(json.dumps(result, indent=2)+'\n')
    print(json.dumps({'syntheticViews': len(verified), 'realPhotos': len(real_rows), 'idealTargetDecode': target_summary}))


if __name__ == '__main__':
    main()
