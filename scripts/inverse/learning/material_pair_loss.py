"""Penalize changes in paper identity under paired photographic interventions.

Both views retain the same fractional target and known-pixel mask. Orient each
prediction once for the whole image, using the supervised boundary-weighted
assignment, then compare probabilities. Unknown pixels and predicted foreground
never affect the denominator. This supplements, rather than replaces, labels.
"""
import torch
from torch.nn import functional as F

from material_boundary_loss import material_boundary_weights


def material_pair_consistency(logits, materials, factor=4., radius=2):
    if logits.ndim != 3 or logits.shape[0] != 2 or materials.shape != logits.shape:
        raise ValueError('Require two aligned material-logit images and targets')
    if not torch.isfinite(logits).all() or not torch.equal(materials[0], materials[1]):
        raise ValueError('Paired views require finite logits and identical labels')
    weights = material_boundary_weights(materials, factor, radius).to(logits.dtype)
    known = materials != 255
    target = torch.where(known, materials, 0).to(logits.dtype)
    direct = (F.binary_cross_entropy_with_logits(logits, target, reduction='none')*weights).sum((1, 2))
    exchanged = (F.binary_cross_entropy_with_logits(logits, 1-target, reduction='none')*weights).sum((1, 2))
    flip = direct > exchanged
    probabilities = logits.sigmoid()
    aligned = torch.where(flip[:, None, None], 1-probabilities, probabilities)
    return ((aligned[0]-aligned[1]).square()*weights[0]).sum()/weights[0].sum().clamp_min(1)
