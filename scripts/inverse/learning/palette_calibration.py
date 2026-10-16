"""Offline RGB calibration using predicted paper seeds, never annotation masks."""
import numpy as np


def mixture(rgb, colors, mode='illumination'):
    if mode not in ['affine', 'illumination']:
        raise ValueError('Unknown mixture model')
    rgb, colors = np.asarray(rgb, float), np.asarray(colors, float)
    if rgb.shape[-1] != 3 or colors.shape != (2, 3) or not np.isfinite(rgb).all() or not np.isfinite(colors).all():
        raise ValueError('Finite RGB pixels and two RGB paper colors are required')
    if ((rgb < 0) | (rgb > 1)).any() or ((colors < 0) | (colors > 1)).any():
        raise ValueError('RGB colors must be in [0, 1]')
    difference = colors[1]-colors[0]
    separation = float(difference@difference)
    if separation < .01:
        raise ValueError('Paper colors are insufficiently separated')
    a, b = colors; aa, bb, ab = float(a@a), float(b@b), float(a@b)
    determinant = aa*bb-ab*ab
    largest = (aa+bb+np.hypot(aa-bb, 2*ab))/2
    conditioning = determinant/max(largest*largest, 1e-20)
    if mode == 'affine' or conditioning < .001:
        p = np.clip(((rgb-a)*difference).sum(-1)/separation, 0, 1)
        return p, {'model': 'affine-color-segment', 'conditioning': conditioning}
    if mode != 'illumination':
        raise ValueError('Unknown mixture model')
    ia, ib = (rgb*a).sum(-1), (rgb*b).sum(-1)
    u, v = (ia*bb-ib*ab)/determinant, (ib*aa-ia*ab)/determinant
    outside = u < 0
    u, v = np.where(outside, 0., u), np.where(outside, ib/bb, v)
    outside = v < 0
    u, v = np.where(outside, ia/aa, u), np.where(outside, 0., v)
    p = np.divide(v, u+v, out=np.full_like(v, .5), where=u+v > 1e-8)
    return np.clip(p, 0, 1), {'model': 'nonnegative-color-mixture', 'conditioning': conditioning}


def rgb_palette(pixels):
    channel = int(np.argmax(np.quantile(pixels, .8, axis=0)-np.quantile(pixels, .2, axis=0)))
    low, high = np.quantile(pixels[:, channel], [.2, .8])
    colors = np.stack([np.median(pixels[pixels[:, channel] <= low], axis=0),
                       np.median(pixels[pixels[:, channel] >= high], axis=0)])
    for _ in range(10):
        assignment = ((pixels[:, None]-colors[None])**2).sum(-1).argmin(-1)
        groups = [pixels[assignment == k] for k in range(2)]
        if min(map(len, groups)) < 32:
            raise ValueError('Too few samples in a color cluster')
        colors = np.stack([np.median(group, axis=0) for group in groups])
    return colors, [len(group) for group in groups]


def calibrate(rgb, body_probability, material_probability, valid, *, palette='learned', mode='illumination'):
    if palette not in ['learned', 'rgb'] or mode not in ['affine', 'illumination']:
        raise ValueError('Unknown calibration strategy')
    rgb = np.asarray(rgb)
    body, material, valid = np.asarray(body_probability), np.asarray(material_probability), np.asarray(valid)
    if rgb.dtype != np.uint8 or rgb.shape != (*body.shape, 3) or material.shape != body.shape or valid.shape != body.shape or valid.dtype != bool:
        raise ValueError('Require uint8 RGB, matching body/material probabilities and a boolean source-coverage mask')
    if not np.isfinite(body).all() or not np.isfinite(material).all() or ((body < 0) | (body > 1) | (material < 0) | (material > 1)).any():
        raise ValueError('Require probabilities in [0, 1]')
    observed = valid & (body > .8)
    evidence = {'palette': palette, 'mode': mode, 'bodySeedPixels': int(observed.sum())}
    try:
        if observed.sum() < 64:
            raise ValueError('Too few confident body samples')
        values = rgb.astype(float)/255
        if palette == 'learned':
            seeds = [observed & (material < .2), observed & (material > .8)]
            counts = [int(seed.sum()) for seed in seeds]
            if min(counts) < 32:
                raise ValueError('Too few confident samples of both papers')
            colors = np.stack([np.median(values[seed], axis=0) for seed in seeds])
        elif palette == 'rgb':
            colors, counts = rgb_palette(values[observed])
        else:
            raise ValueError('Unknown palette strategy')
        result, model = mixture(values, colors, mode)
        result = np.where(valid, result, material).astype(material.dtype)
        evidence.update(applied=True, colors=colors.tolist(), seedCounts=counts, **model)
    except ValueError as error:
        result = material.copy()
        evidence.update(applied=False, reason=str(error))
    return result, evidence
