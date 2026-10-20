"""Describe intervention sensitivity after one target-based phase per view."""
import numpy as np

from material_pairing import material_pairs


def paired_identity_metrics(predictions, items, metrics):
    if len(predictions) != len(items) or len(metrics['rows']) != len(items):
        raise ValueError('Require aligned predictions and material scores')
    if [row['id'] for row in metrics['rows']] != [item['id'] for item in items]:
        raise ValueError('Changed metric order')
    rows = []
    for original, variant in material_pairs(items):
        a, b = predictions[original, 1], predictions[variant, 1]
        known = items[original]['materials'] != 255
        if not known.any() or a.shape != known.shape or b.shape != known.shape:
            raise ValueError('Require known aligned material pixels')
        if any(not np.isfinite(p).all() or (p < 0).any() or (p > 1).any() for p in [a, b]):
            raise ValueError('Invalid material probabilities')
        first, second = metrics['rows'][original], metrics['rows'][variant]
        fa, fb = first['materialPhaseExchanged'], second['materialPhaseExchanged']
        if type(fa) is not bool or type(fb) is not bool:
            raise ValueError('Require one explicit global phase per view')
        aligned_a, aligned_b = (1-a if fa else a), (1-b if fb else b)
        hard_a, hard_b = (a >= .5) ^ fa, (b >= .5) ^ fb
        rows.append({'original': items[original]['id'], 'variant': items[variant]['id'],
            'kind': items[variant]['evidence']['kind'], 'knownPixels': int(known.sum()),
            'probabilityMSE': float(np.square(aligned_a[known].astype(float)-aligned_b[known]).mean()),
            'hardDisagreement': float((hard_a[known] != hard_b[known]).mean()),
            'materialErrorChange': second['materialPixelError']-first['materialPixelError']})
    return {'scope': 'Known training-label pixels, independent of predicted body. Each view retains its own target-based global phase from the standard material metric. Consistency alone is not accuracy.',
        'rows': rows, 'groups': {kind: {
            key: float(np.mean([row[key] for row in rows if row['kind'] == kind]))
            for key in ['probabilityMSE', 'hardDisagreement', 'materialErrorChange']}
            for kind in sorted({row['kind'] for row in rows})}}
