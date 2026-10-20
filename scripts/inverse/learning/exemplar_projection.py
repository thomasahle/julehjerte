"""Learn a feature subspace through a differentiable, lobe-fitted classifier.

Overlap labels enter the outer training loss only. Each forward fit uses just
balanced exposed-paper samples, including its normalization and ridge solve.
"""
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

from material_boundary_loss import material_boundary_weights


def sample_indices(support, minimum=32, maximum=1024):
    support = np.asarray(support)
    if (support.ndim != 3 or support.shape[0] != 2 or support.dtype != bool or
            (support[0] & support[1]).any() or not 1 <= minimum <= maximum):
        raise ValueError('Require disjoint boolean lobe samples')
    counts = support.sum((1, 2))
    if counts.min() < minimum:
        raise ValueError('Too few lobe samples')
    n = int(min(maximum, counts.min()))
    return torch.from_numpy(np.concatenate([
        np.flatnonzero(mask)[np.linspace(0, count-1, n, dtype=int)]
        for mask, count in zip(support, counts)
    ])), n


def fit_ridge(features, indices, per_paper, regularization=.1, *, target=None):
    """CHW features; differentiable double-precision statistics and solve."""
    if features.ndim != 3 or not regularization > 0:
        raise ValueError('Require CHW features and positive ridge penalty')
    if indices.numel() != 2*per_paper or per_paper < 1:
        raise ValueError('Require balanced samples')
    samples = features.flatten(1).T[indices].double()
    centre = samples.mean(0)
    scale = samples.std(0, unbiased=False).clamp_min(1e-4)
    x = (samples-centre)/scale
    y = (torch.cat([-torch.ones(per_paper), torch.ones(per_paper)]).to(x)
         if target is None else target.to(x))
    if y.shape != (2*per_paper,) or not torch.isfinite(y).all():
        raise ValueError('Require one finite target per lobe sample')
    covariance = x.T@x/len(x)+regularization*torch.eye(x.shape[1], dtype=x.dtype, device=x.device)
    weight = torch.linalg.solve(covariance, x.T@y/len(x))
    return centre, scale, weight


def score_ridge(features, classifier):
    centre, scale, weight = classifier
    return (((features.permute(1, 2, 0).double()-centre)/scale)@weight).to(features.dtype)


def fit_context_residual(rgb, context, indices, per_paper):
    """Fit on the full photo's exposed lobes, independently of query pixels.

    This is an offline alternative to joint ridge fitting, not a safety gate:
    an unseen context value can still worsen a good RGB prediction.
    """
    rgb_low = F.interpolate(rgb[None], context.shape[-2:], mode='bilinear',
                            align_corners=False)[0]
    base = fit_ridge(rgb_low, indices, per_paper)
    targets = torch.cat([-torch.ones(per_paper), torch.ones(per_paper)]).to(rgb_low)
    residual = targets-score_ridge(rgb_low, base).flatten()[indices]
    correction = fit_ridge(context, indices, per_paper, target=residual)
    return base, correction


def score_context_residual(rgb, context, classifier):
    """Score RGB and context already sampled at the same query pixel centres."""
    if rgb.shape[-2:] != context.shape[-2:]:
        raise ValueError('Require matching RGB/context query grids')
    base, correction = classifier
    return score_ridge(rgb, base)+score_ridge(context, correction)


def context_residual_score(rgb, context, indices, per_paper):
    classifier = fit_context_residual(rgb, context, indices, per_paper)
    high = F.interpolate(context[None], rgb.shape[-2:], mode='bilinear', align_corners=False)[0]
    return score_context_residual(rgb, high, classifier)


class ExemplarProjection(nn.Module):
    """Only 1,536 trainable weights; the shared U2NETP body stays frozen."""
    def __init__(self, channels=192, outputs=8):
        super().__init__()
        self.projection = nn.Conv2d(channels, outputs, 1, bias=False)

    def context(self, frozen):
        return self.projection(frozen[None])[0]

    def fit(self, rgb, context, indices, per_paper, *, residual=False):
        if residual:
            return fit_context_residual(rgb, context, indices, per_paper)
        size = context.shape[-2:]
        rgb_low = F.interpolate(rgb[None], size, mode='bilinear', align_corners=False)[0]
        return fit_ridge(torch.cat([rgb_low, context]), indices, per_paper)

    def score(self, rgb, context, classifier, *, residual=False):
        if residual:
            return score_context_residual(rgb, context, classifier)
        return score_ridge(torch.cat([rgb, context]), classifier)

    def forward(self, rgb, frozen, indices, per_paper, *, residual=False):
        context = self.context(frozen)
        classifier = self.fit(rgb, context, indices, per_paper, residual=residual)
        high = F.interpolate(context[None], rgb.shape[-2:], mode='bilinear', align_corners=False)[0]
        return self.score(rgb, high, classifier, residual=residual)


def overlap_loss(score, labels, factor=4., radius=2, temperature=4.):
    """Fractional labels, unknown margins, and one phase for the entire image."""
    weights = material_boundary_weights(labels[None], factor, radius)[0].to(score)
    if not weights.sum() > 0:
        raise ValueError('No known overlap pixels')
    target = torch.where(labels != 255, labels, 0).to(score)
    logits = score*temperature
    direct = F.binary_cross_entropy_with_logits(logits, target, reduction='none')
    exchanged = F.binary_cross_entropy_with_logits(logits, 1-target, reduction='none')
    a, b = [(value*weights).sum()/weights.sum() for value in [direct, exchanged]]
    return torch.where(a <= b, a, b)


def crop_context(context, matrix, source_size, size):
    """Sample a full-photo feature field at production's crop pixel centres."""
    width, height = source_size
    yy, xx = np.mgrid[:size, :size]
    points = np.stack([(xx+.5)/size, (yy+.5)/size, np.ones_like(xx)], axis=-1)
    projected = points@np.asarray(matrix).T
    if not np.isfinite(projected).all() or (np.abs(projected[..., 2]) < 1e-10).any():
        raise ValueError('Invalid crop projection')
    xy = projected[..., :2]/projected[..., 2:]
    grid = torch.from_numpy(xy/np.array([width, height])*2-1).to(context)
    # Coverage remains the production RGB validity mask. Border replication
    # samples context only; it never changes which RGB pixels are observed.
    return F.grid_sample(context[None], grid[None], align_corners=False,
                         mode='bilinear', padding_mode='border')[0]
