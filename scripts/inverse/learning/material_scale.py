"""Change inference resolution while keeping the same source-photo window."""
import copy

import numpy as np
import torch
from torch.nn import functional as F


def scaled_transform(transform, resolution):
    if (not isinstance(resolution, int) or resolution < 32 or resolution % 32
            or transform['resolution'] < 1 or transform['scale'] <= 0
            or len(transform['offset']) != 2
            or not np.isfinite([transform['scale'], *transform['offset']]).all()):
        raise ValueError('Require a finite letterbox transform and a positive multiple of 32')
    factor = resolution / transform['resolution']
    result = copy.deepcopy(transform)
    result.update(resolution=resolution, scale=transform['scale']*factor,
                  offset=[v*factor for v in transform['offset']])
    return result


def at_label_centres(probability, resolution):
    """Sample continuous fields at the original label centres, not new labels."""
    values = np.asarray(probability)
    if (values.ndim != 3 or values.shape[0] != 2 or values.shape[1] != values.shape[2]
            or not np.isfinite(values).all() or ((values < 0) | (values > 1)).any()
            or not isinstance(resolution, int) or resolution < 1):
        raise ValueError('Require square body/material probability fields and a label resolution')
    tensor = torch.from_numpy(np.ascontiguousarray(values))[None]
    return F.interpolate(tensor, size=(resolution, resolution), mode='bilinear',
                         align_corners=False)[0].numpy()
