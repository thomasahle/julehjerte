"""Reproducible intervention pairs, retaining each original/print/scene view."""
from collections import Counter

import numpy as np


def material_pairs(items):
    groups = {}
    for index, item in enumerate(items):
        key = item['id'].split('--', 1)[0]
        kind = item['evidence']['kind']
        group = groups.setdefault(key, {})
        if kind in group:
            raise ValueError('Duplicate counterpart kind')
        group[kind] = index
    pairs = []
    for group in groups.values():
        if set(group) != {'synthetic-original', 'synthetic-printed', 'synthetic-scene'}:
            raise ValueError('Require original, print and scene for every geometry')
        original = group['synthetic-original']
        for kind in ['synthetic-printed', 'synthetic-scene']:
            other = group[kind]
            if any(not np.array_equal(items[original][key], items[other][key]) for key in ['body', 'materials']):
                raise ValueError('Intervention changed body or material labels')
            pairs.append([original, other])
    if not pairs:
        raise ValueError('Require paired synthetic views')
    return pairs


def paired_draws(real_count, pairs, epochs, seed):
    if type(real_count) is not int or real_count < 1 or len(pairs) % real_count:
        raise ValueError('Require balanced complete real passes per pair epoch')
    if type(epochs) is not int or epochs < 1 or not pairs:
        raise ValueError('Require positive complete pair epochs')
    rng = np.random.default_rng(seed); draws = []
    for epoch in range(epochs):
        real = np.concatenate([rng.permutation(real_count) for _ in range(len(pairs)//real_count)])
        order = rng.permutation(len(pairs))
        draws.extend({'real': int(r), 'synthetic': list(pairs[int(p)]), 'pair': int(p),
                      'epoch': epoch, 'flips': (rng.random(2) < .5).tolist()}
                     for r, p in zip(real, order))
    return draws


def synthetic_draw_counts(draws):
    """Read historical single-view and current paired-view training records."""
    counts = Counter()
    for draw in draws:
        values = draw['synthetic']
        if type(values) is int:
            values = [values]
        if not isinstance(values, list) or not values or any(type(i) is not int or i < 0 for i in values):
            raise ValueError('Invalid synthetic draw record')
        counts.update(values)
    return counts
