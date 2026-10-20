"""Give known paper boundaries more weight, retaining a single image-wide phase.

This does not supervise hidden cuts or guarantee valid junctions. Unknown
annotation margins and body/background interfaces never seed material edges.
"""
import math

import torch
from torch.nn import functional as F

from real_materials_learning import joint_material_loss


def material_boundary_weights(materials, factor=4., radius=2):
    if not math.isfinite(factor) or factor < 1 or not isinstance(radius, int) or radius < 0:
        raise ValueError('Require finite boundary factor >= 1 and nonnegative integer radius')
    if materials.ndim != 3 or not (((materials >= 0) & (materials <= 1)) | (materials == 255)).all():
        raise ValueError('Require batch/height/width fractional paper labels or unknown 255')
    known = materials != 255; centred = materials-.5
    # Include a 50%-coverage pixel on either side. The band must not change
    # when A and B are exchanged, including exactly half-covered samples.
    def transitions(a, b, ka, kb):
        return ka & kb & (a*b <= 0) & (a != b)
    horizontal = transitions(centred[:, :, 1:], centred[:, :, :-1], known[:, :, 1:], known[:, :, :-1])
    vertical = transitions(centred[:, 1:], centred[:, :-1], known[:, 1:], known[:, :-1])
    edge = torch.zeros_like(known)
    edge[:, :, 1:] |= horizontal; edge[:, :, :-1] |= horizontal
    edge[:, 1:] |= vertical; edge[:, :-1] |= vertical
    band = F.max_pool2d(edge[:, None].float(), 2*radius+1, stride=1, padding=radius)[:, 0] > 0
    return known.to(torch.float32)*(1+(factor-1)*band)


def boundary_material_loss(logits, body, materials, factor=4., radius=2):
    # Retain the original validation and body loss. Subtract its uniform
    # material term, then substitute the weighted whole-image assignment.
    baseline = joint_material_loss(logits, body, materials)
    weights = material_boundary_weights(materials, factor, radius).to(logits.dtype)
    if factor == 1:
        return baseline
    known = materials != 255
    target = torch.where(known, materials, 0).to(logits.dtype)
    direct = F.binary_cross_entropy_with_logits(logits[:, 1], target, reduction='none')
    exchanged = F.binary_cross_entropy_with_logits(logits[:, 1], 1-target, reduction='none')
    def selected(weight):
        count = weight.sum((1, 2)).clamp_min(1)
        a, b = (direct*weight).sum((1, 2))/count, (exchanged*weight).sum((1, 2))/count
        return torch.where(a <= b, a, b)
    return baseline+(selected(weights)-selected(known)).mean()
