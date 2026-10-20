"""Target-informed reference for the material head's output-grid capacity.

Fit free logits using exactly the head's bilinear upsampling convention. This
uses labels, not photographs: it is neither a deployable predictor nor a proven
optimum/lower bound. Low error exhibits a representation the grid can express.
"""
import numpy as np
import torch
from torch.nn import functional as F


def fit_grid_reference(target, grid_size, steps=200, learning_rate=.15):
    target = np.asarray(target)
    if target.ndim != 2 or not np.isfinite(target).all():
        raise ValueError('Require a finite two-dimensional material target')
    if not (((target >= 0) & (target <= 1)) | (target == 255)).all():
        raise ValueError('Require fractional coverage or unknown 255')
    if not (target != 255).any():
        raise ValueError('Require known material pixels')
    if type(grid_size) is not int or not 1 <= grid_size <= min(target.shape):
        raise ValueError('Invalid grid size')
    if type(steps) is not int or steps < 0 or not np.isfinite(learning_rate) or learning_rate <= 0:
        raise ValueError('Invalid optimization budget')
    known = torch.from_numpy(target != 255)[None, None]
    # Double precision avoids phase-dependent Adam drift in nearly saturated
    # free logits. Decode the final witness in float32, as the actual head does.
    labels = torch.from_numpy(np.where(target == 255, .5, target).astype(np.float64))[None, None]
    mass = F.adaptive_avg_pool2d(known.double(), (grid_size, grid_size))
    average = F.adaptive_avg_pool2d(labels*known, (grid_size, grid_size))
    average = torch.where(mass > 0, average/mass.clamp_min(1e-8), .5)
    logits = torch.logit(average.clamp(.001, .999)).detach().requires_grad_()
    optimizer = torch.optim.Adam([logits], lr=learning_rate)

    def evaluate():
        full = F.interpolate(logits, size=target.shape, mode='bilinear', align_corners=False)
        loss = F.binary_cross_entropy_with_logits(full[known], labels[known])
        return full, loss

    initial_loss = float(evaluate()[1].detach())
    for _ in range(steps):
        optimizer.zero_grad(set_to_none=True)
        _, loss = evaluate()
        loss.backward()
        optimizer.step()
    full, loss = evaluate()
    if not torch.isfinite(full).all():
        raise ValueError('Nonfinite reference')
    witness = F.interpolate(logits.detach().float(), size=target.shape, mode='bilinear', align_corners=False).sigmoid()
    return witness.numpy()[0, 0], {
        'gridSize': grid_size, 'steps': steps, 'learningRate': learning_rate,
        'initialBCE': initial_loss, 'finalBCE': float(loss.detach()),
        'interpolation': 'bilinear; align_corners=False; logits then sigmoid',
        'selection': 'Fixed final update; no per-image checkpoint selection',
        'optimizationDtype': 'float64', 'witnessDtype': 'float32',
    }, logits.detach().float().numpy()[0, 0]
