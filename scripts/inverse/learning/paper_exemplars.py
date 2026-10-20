"""Offline paper classification from exposed-lobe samples.

Only image features and crop geometry enter the classifier. The overlap mask is
never a fitting input. Synthetic true corners are an explicitly privileged
diagnostic; real photos must retain their fixed automatic crop proposals.
"""
import numpy as np
import torch
from torch.nn import functional as F


def quad_transform(quad):
    """Map unit-square corners (notch, side, tip, side) to source coordinates."""
    quad = np.asarray(quad, dtype=np.float64)
    if quad.shape != (4, 2) or not np.isfinite(quad).all():
        raise ValueError('Require four finite corners')
    edges = np.roll(quad, -1, axis=0)-quad
    turns = edges[:, 0]*np.roll(edges[:, 1], -1)-edges[:, 1]*np.roll(edges[:, 0], -1)
    if not (np.all(turns > 1e-9) or np.all(turns < -1e-9)):
        raise ValueError('Require a nondegenerate convex quad')
    a, b = [], []
    for (x, y), (u, v) in zip([(0, 0), (1, 0), (1, 1), (0, 1)], quad):
        a.extend([[x, y, 1, 0, 0, 0, -u*x, -u*y],
                  [0, 0, 0, x, y, 1, -v*x, -v*y]])
        b.extend([u, v])
    return np.append(np.linalg.solve(a, b), 1).reshape(3, 3)


def canonical_grid(matrix, size, source_size):
    matrix = np.asarray(matrix, dtype=np.float64)
    width, height = source_size
    if matrix.shape != (3, 3) or not np.isfinite(matrix).all() or min(width, height, size) <= 0:
        raise ValueError('Invalid camera geometry')
    yy, xx = np.mgrid[:size, :size]
    pixels = np.stack([(xx+.5)*width/size, (yy+.5)*height/size, np.ones_like(xx)], axis=-1)
    projected = pixels @ np.linalg.inv(matrix).T
    valid = np.abs(projected[..., 2]) > 1e-10
    xy = np.divide(projected[..., :2], projected[..., 2:],
                   out=np.full((*xx.shape, 2), np.nan), where=valid[..., None])
    return xy[..., 0], xy[..., 1]


def lobe_samples(matrix, size, source_size):
    """Inset semicircle samples, clear of the outer outline and overlap crease."""
    x, y = canonical_grid(matrix, size, source_size)
    return np.stack([(y < -.08) & ((x-.5)**2+y*y < .42**2),
                     (x < -.08) & (x*x+(y-.5)**2 < .42**2)])


def overlap_region(matrix, size, source_size):
    x, y = canonical_grid(matrix, size, source_size)
    return (x >= 0) & (x <= 1) & (y >= 0) & (y <= 1)


def rgb_texture_features(rgb, size=160):
    """Raw colour plus seven-pixel local mean and standard deviation."""
    rgb = np.asarray(rgb)
    if rgb.dtype != np.uint8 or rgb.ndim != 3 or rgb.shape[-1] != 3:
        raise ValueError('Require uint8 RGB')
    value = torch.from_numpy(rgb.copy().transpose(2, 0, 1)).float()[None]/255
    value = F.interpolate(value, (320, 320), mode='bilinear', align_corners=False)
    mean = F.avg_pool2d(F.pad(value, (3, 3, 3, 3), mode='reflect'), 7, stride=1)
    second = F.avg_pool2d(F.pad(value.square(), (3, 3, 3, 3), mode='reflect'), 7, stride=1)
    deviation = (second-mean.square()).clamp_min(0).sqrt()
    features = F.interpolate(torch.cat([value, mean, deviation], dim=1), (size, size),
                             mode='bilinear', align_corners=False)
    return features[0].numpy().transpose(1, 2, 0).copy()


def fit_exemplars(features, support, *, regularization=.1, minimum=32, maximum=1024):
    """Balanced ridge classifier; all normalization is fitted on lobe samples."""
    features, support = np.asarray(features), np.asarray(support)
    if features.ndim != 3 or support.shape != (2, *features.shape[:2]) or support.dtype != bool:
        raise ValueError('Require HWC features and two boolean support masks')
    if not np.isfinite(features).all() or (support[0] & support[1]).any():
        raise ValueError('Nonfinite features or overlapping paper samples')
    if not np.isfinite(regularization) or regularization <= 0 or not 1 <= minimum <= maximum:
        raise ValueError('Invalid ridge protocol')
    counts = support.sum((1, 2))
    if counts.min() < minimum:
        raise ValueError('Too few visible samples in one or both lobes')
    n = int(min(maximum, counts.min()))
    groups = []
    for mask in support:
        indices = np.flatnonzero(mask)
        selected = indices[np.linspace(0, len(indices)-1, n, dtype=int)]
        groups.append(features.reshape(-1, features.shape[-1])[selected])
    x = np.concatenate(groups).astype(np.float64)
    centre = x.mean(0)
    scale = x.std(0).clip(min=1e-4)
    x = (x-centre)/scale
    y = np.repeat([-1., 1.], n)
    weight = np.linalg.solve(x.T@x/len(x)+regularization*np.eye(x.shape[1]), x.T@y/len(x))
    # Keep the saved scoring field float32; no per-photo threshold search.
    score = (((features.astype(np.float64)-centre)/scale)@weight).astype(np.float32)
    return score, {'supportPixels': counts.tolist(), 'samplesPerPaper': n,
                   'features': features.shape[-1], 'regularization': regularization,
                   'trainingMisclassification': float(((x@weight >= 0) != (y > 0)).mean())}


def score_probability(score, size=320):
    value = torch.from_numpy(np.asarray(score, dtype=np.float32))[None, None]
    return F.interpolate(value, (size, size), mode='bilinear', align_corners=False).sigmoid()[0, 0].numpy()
