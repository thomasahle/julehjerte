"""Pinned real-photo exposure with a shared synthetic/reflection schedule."""
import json

import numpy as np

from preserved_candidate import pinned


def training_draws(plan, synthetic_count, real_count):
    p = plan['protocol']
    if any(type(v) is not int or v < 1 for v in [synthetic_count, real_count, p['updates']]):
        raise ValueError('Require positive integer exposure dimensions')
    if 'drawSchedule' not in plan:
        # Preserve the original RNG calls and their order for historical replays.
        rng = np.random.default_rng(p['seed'])
        return [{'synthetic': int(rng.integers(synthetic_count)), 'real': int(rng.integers(real_count)),
                 'flips': (rng.random(2) < .5).tolist()} for _ in range(p['updates'])]
    schedule = json.loads(pinned(plan['drawSchedule']).read_bytes())
    arm = p['scheduleArm']
    if schedule['schema'] != 'paired-body-exposure-schedule-1' or arm not in ['control', 'candidate']:
        raise ValueError('Unknown paired exposure schedule')
    if schedule['trainIds'][arm] != plan['trainIds'] or len(plan['trainIds']) != real_count:
        raise ValueError('Exposure schedule uses different real photos')
    if schedule['syntheticCount'] != synthetic_count or len(schedule['rows']) != p['updates']:
        raise ValueError('Exposure schedule dimensions differ')
    draws = []
    for row in schedule['rows']:
        draw = {'synthetic': row['synthetic'], 'real': row[arm], 'flips': row['flips']}
        if (type(draw['synthetic']) is not int or not 0 <= draw['synthetic'] < synthetic_count or
            type(draw['real']) is not int or not 0 <= draw['real'] < real_count or
            not isinstance(draw['flips'], list) or len(draw['flips']) != 2 or
            any(type(v) is not bool for v in draw['flips'])):
            raise ValueError('Invalid exposure draw')
        draws.append(draw)
    return draws
