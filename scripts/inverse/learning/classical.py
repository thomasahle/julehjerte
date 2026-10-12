"""Non-neural junction proposal baseline from the production color mask."""
import numpy as np
from scipy.ndimage import gaussian_filter


def corner_response(mask):
    """Harris response with fixed derivative/window scales in input pixels.

    det(M) - 0.04 trace(M)^2; M integrates local gradient products.
    See https://docs.opencv.org/4.x/dc/d0d/tutorial_py_features_harris.html .
    The input is a 0..1 classified mask, not reference geometry. No per-image
    maximum normalization forces flat/curved-only images to contain corners.
    """
    mask = np.asarray(mask, dtype=np.float32)
    dx = gaussian_filter(mask, sigma=1, order=(0, 1), mode='nearest')
    dy = gaussian_filter(mask, sigma=1, order=(1, 0), mode='nearest')
    xx = gaussian_filter(dx*dx, sigma=1.5, mode='nearest')
    yy = gaussian_filter(dy*dy, sigma=1.5, mode='nearest')
    xy = gaussian_filter(dx*dy, sigma=1.5, mode='nearest')
    return np.maximum(xx*yy-xy*xy-.04*(xx+yy)**2, 0)
