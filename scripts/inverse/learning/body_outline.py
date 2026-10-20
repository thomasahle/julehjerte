"""Known-pixel outline supervision; unknown labels never become background."""
import math

import numpy as np
from scipy.ndimage import distance_transform_edt
import torch
from torch.nn import functional as F

from data import digest
from real_foreground import known_region_metrics


def outline_options(protocol):
    options = protocol.get('outlineLoss')
    if options is None:
        return None
    if set(options) != {'radiusPixels', 'weight'}:
        raise ValueError('Require outline radius and weight')
    radius, weight = options['radiusPixels'], options['weight']
    if type(radius) is not int or not 1 <= radius <= 32:
        raise ValueError('Outline radius must be 1 through 32 network pixels')
    if type(weight) not in (int, float) or not math.isfinite(weight) or not 0 < weight <= 2:
        raise ValueError('Outline weight must be finite and in (0, 2]')
    return options


def outline_band(labels, radius):
    """Known pixels within radius of a known opposite-class pixel centre.

    Do not use the edge of a binary observed mask: that would create false
    boundaries around unknown holes and occlusions. Do not invent labels in
    an uncertainty band. Distances are in the existing stretched network frame.
    """
    labels = np.asarray(labels)
    if labels.ndim != 2 or not np.isin(labels, [0, 1, 255]).all():
        raise ValueError('Require a 2D foreground/background/unknown label field')
    if type(radius) not in (int, float) or not math.isfinite(radius) or radius <= 0:
        raise ValueError('Require positive finite radius')
    band = np.zeros(labels.shape, np.uint8)
    for value in (0, 1):
        opposite = labels == 1-value
        if opposite.any():
            band[(labels == value) & (distance_transform_edt(~opposite) <= radius)] = 1
    return band


def prepare_outline(items, protocol):
    options = outline_options(protocol)
    if options is None:
        return None
    evidence = []
    for item in items:
        band = outline_band(item['labels'], options['radiusPixels'])
        item['outlineBand'] = band
        evidence.append({'id': item['id'], 'sha256': digest(band.tobytes()),
                         'paperPixels': int(((item['labels'] == 1) & (band == 1)).sum()),
                         'backgroundPixels': int(((item['labels'] == 0) & (band == 1)).sum())})
    return {'options': options, 'items': evidence,
            'scope': 'Known pixels near known opposite-class pixels. Unknown annotation bands/occlusions remain excluded. Network-frame distances, not original-photo pixel distances.'}


def outline_bce(logits, target, observed, band):
    """Mean BCE per image, balanced between the known inner and outer bands.

    An absent class contributes zero; an image with no band contributes zero.
    This is an auxiliary term; the unchanged whole-image BCE+Dice remains.
    """
    if logits.ndim != 4 or logits.shape[1] != 1 or any(x.shape != logits.shape for x in (target, observed, band)):
        raise ValueError('Require matching NCHW single-channel tensors')
    if not torch.isfinite(logits).all() or any(not ((x == 0) | (x == 1)).all() for x in (target, observed, band)):
        raise ValueError('Require finite logits and binary labels/weights')
    if (band > observed).any():
        raise ValueError('Outline supervision cannot include unknown pixels')
    bce = F.binary_cross_entropy_with_logits(logits, target, reduction='none')
    losses, present = [], []
    for value in (0, 1):
        selected = band*(target == value)
        count = selected.sum((1, 2, 3))
        losses.append((bce*selected).sum((1, 2, 3))/count.clamp_min(1))
        present.append((count > 0).to(logits.dtype))
    return ((losses[0]+losses[1])/(present[0]+present[1]).clamp_min(1)).mean()


def outline_metrics(predictions, items):
    selected = [(p, i) for p, i in zip(predictions, items) if i['outlineBand'].any()]
    if len(predictions) != len(items) or not selected:
        raise ValueError('Require matching predictions and at least one observed outline band')
    values = np.stack([p for p, _ in selected])
    rows = [{'id': i['id'], 'target': (i['labels'] == 1).astype(np.float32),
             'weight': i['outlineBand'].astype(np.float32)} for _, i in selected]
    result = known_region_metrics(values, rows)
    result.update(excludedWithoutKnownBand=len(items)-len(selected),
                  scope='Known outline-band training pixels only. Not exact boundary displacement, crop accuracy, or held-out performance.')
    return result
