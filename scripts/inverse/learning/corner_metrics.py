"""Independent crop geometry metrics for approximate visible references.

All coordinates must use the same pixel convention and the fixed physical
order notch/right/tip/left. No permutation or alignment is fitted to the answer.
Reference uncertainty is reported separately; it is not an acceptance gate.
"""
import numpy as np


def _quad(value):
    q = np.asarray(value, dtype=float)
    if q.shape != (4, 2) or not np.isfinite(q).all():
        raise ValueError('Require four finite 2D corners in physical perimeter order')
    edges = np.roll(q, -1, axis=0)-q
    scale = np.linalg.norm(edges, axis=1).mean()
    turns = edges[:, 0]*np.roll(edges[:, 1], -1)-edges[:, 1]*np.roll(edges[:, 0], -1)
    if not scale > 0 or not ((turns > 1e-12*scale**2).all() or (turns < -1e-12*scale**2).all()):
        raise ValueError('Require a nondegenerate convex quadrilateral')
    return q, float(scale)


def corner_error(proposal, reference, uncertainty_pixels=0):
    """Measure offsets without silently treating a missing crop as perfect."""
    truth, scale = _quad(reference)
    if not np.isfinite(uncertainty_pixels) or uncertainty_pixels < 0:
        raise ValueError('Reference uncertainty must be finite and nonnegative')
    if proposal is None:
        return None
    prediction, _ = _quad(proposal)
    offsets = np.linalg.norm(prediction-truth, axis=1)
    return {
        'cornerErrorPixels': offsets.tolist(),
        'referenceMeanSidePixels': scale,
        'referenceUncertaintyPixels': float(uncertainty_pixels),
        'maximumCornerErrorSideFraction': float(offsets.max()/scale),
        'maximumExcessBeyondReferenceUncertaintySideFraction': float(max(0, offsets.max()-uncertainty_pixels)/scale),
    }
