"""Explicit visible/hidden supervision for controlled foreground occlusion.

This is a raster intervention on existing procedural photographs, not a camera
simulation. The original binary physical-body target remains the latent target;
fractional coverage belongs to the new foreground object, not to background.
"""
import hashlib

import numpy as np


def training_rows(corpus, count=16):
    if not isinstance(count, int) or count < 1:
        raise ValueError('Require a positive geometry count')
    roles, selected = {}, {}
    for row in sorted(corpus.rows, key=lambda r: (r['geometrySha256'], r['key'])):
        geometry, role = row['geometrySha256'], row['experimentalSplit']
        if roles.setdefault(geometry, role) != role:
            raise ValueError('Geometry crosses experimental splits')
        if role == 'train':
            selected.setdefault(geometry, row)
    if len(selected) < count:
        raise ValueError('Not enough distinct training geometries')
    return list(selected.values())[:count]


def ribbon_spec(geometry):
    seed = hashlib.sha256(('notch-ribbon-v1:'+geometry).encode()).digest()
    colors = [[130, 124, 112], [210, 202, 180], [52, 72, 94], [145, 30, 42],
              [45, 96, 78], [217, 204, 166], [48, 46, 52], [182, 178, 185]]
    return {'angle': float(np.pi/4+(seed[0]/255-.5)*.24),
            'start': -65., 'end': 14.+20*seed[1]/255,
            'width': 3.+7*seed[2]/255, 'rgb': colors[seed[3] % len(colors)]}


def ribbon_polygon(spec):
    angle, start, end, width = [float(spec[k]) for k in ['angle', 'start', 'end', 'width']]
    if not np.isfinite([angle, start, end, width]).all() or not start < 0 < end or width <= 0:
        raise ValueError('Require a finite ribbon crossing the canonical notch')
    direction = np.array([np.cos(angle), np.sin(angle)])
    normal = np.array([-direction[1], direction[0]])*width/2
    return np.array([start*direction-normal, end*direction-normal,
                     end*direction+normal, start*direction+normal])


def ribbon_coverage(labels, spec, supersample=8):
    n = labels['resolution']
    if labels.get('schema') != 'woven-heart-synthetic-view-1' or not isinstance(n, int) or not 16 <= n <= 4096:
        raise ValueError('Invalid synthetic camera labels')
    if not isinstance(supersample, int) or not 1 <= supersample <= 16:
        raise ValueError('Invalid supersampling factor')
    matrix = np.asarray(labels['canonicalToPhoto'], dtype=float).reshape(3, 3)
    polygon = ribbon_polygon(spec)
    if not np.isfinite(matrix).all():
        raise ValueError('Nonfinite camera')
    projected = np.column_stack([polygon, np.ones(4)]) @ matrix.T
    denominator = projected[:, 2]
    if not (np.all(denominator > 1e-10) or np.all(denominator < -1e-10)):
        raise ValueError('Ribbon crosses the projective horizon')
    inverse = np.linalg.inv(matrix)
    yy, xx = np.mgrid[:n, :n]
    count = np.zeros((n, n), dtype=np.uint16)
    c, s = np.cos(spec['angle']), np.sin(spec['angle'])
    for oy in (np.arange(supersample)+.5)/supersample:
        for ox in (np.arange(supersample)+.5)/supersample:
            px, py = xx+ox, yy+oy
            w = inverse[2, 0]*px+inverse[2, 1]*py+inverse[2, 2]
            with np.errstate(divide='ignore', invalid='ignore'):
                x = (inverse[0, 0]*px+inverse[0, 1]*py+inverse[0, 2])/w
                y = (inverse[1, 0]*px+inverse[1, 1]*py+inverse[1, 2])/w
            along, across = c*x+s*y, -s*x+c*y
            count += ((along >= spec['start']) & (along <= spec['end']) &
                      (np.abs(across) <= spec['width']/2)).astype(np.uint16)
    return count.astype(np.float32)/(supersample*supersample)


def visibility_labels(amodal, source_support, coverage):
    arrays = [np.asarray(a, dtype=np.float32) for a in [amodal, source_support, coverage]]
    if arrays[0].ndim != 2 or any(a.shape != arrays[0].shape or not np.isfinite(a).all() or
                                 a.min() < 0 or a.max() > 1 for a in arrays):
        raise ValueError('Require equally sized finite probability fields')
    amodal, source_support, coverage = arrays
    return {'amodalBody': amodal.copy(), 'visibleBody': amodal*(1-coverage),
            'occludedBody': amodal*coverage, 'occluderCoverage': coverage.copy(),
            'sourceMaterialSupport': source_support.copy(),
            'materialObservation': source_support*(1-coverage)}


def composite(rgb, coverage, color):
    rgb, coverage, color = np.asarray(rgb), np.asarray(coverage), np.asarray(color)
    if rgb.dtype != np.uint8 or rgb.shape != (*coverage.shape, 3) or coverage.ndim != 2 or color.shape != (3,):
        raise ValueError('Invalid image, coverage or foreground color')
    if not np.isfinite(coverage).all() or coverage.min() < 0 or coverage.max() > 1 or not np.isfinite(color).all() or color.min() < 0 or color.max() > 255:
        raise ValueError('Invalid compositing values')
    return np.rint(rgb*(1-coverage[..., None])+color*coverage[..., None]).astype(np.uint8)
