"""Non-neural junction proposal baseline from the production color mask."""
import numpy as np
from scipy.ndimage import gaussian_filter
from data import detect_nodes


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


def refine_corners(mask, nodes, radius=5):
    """Intersect local gradient-normal lines to remove inward Harris bias.

    Iteratively solve sum(w*g*g.T) q = sum(w*g*g.T*p), in pixel-center
    coordinates. Singular windows and moves beyond the original window retain
    the original proposal. The refinement never sees reference coordinates.
    """
    mask = np.asarray(mask, dtype=np.float32)
    dx = gaussian_filter(mask, sigma=1, order=(0, 1), mode='nearest')
    dy = gaussian_filter(mask, sigma=1, order=(1, 0), mode='nearest')
    result = []
    for original in nodes:
        q = np.array(original, dtype=np.float64)
        for _ in range(15):
            left, right = max(0, int(q[0])-radius), min(mask.shape[1], int(q[0])+radius+1)
            top, bottom = max(0, int(q[1])-radius), min(mask.shape[0], int(q[1])+radius+1)
            yy, xx = np.mgrid[top:bottom, left:right]; xx, yy = xx+.5, yy+.5
            weight = np.exp(-((xx-q[0])**2+(yy-q[1])**2)/(2*(radius/2)**2))
            gx, gy = dx[top:bottom, left:right], dy[top:bottom, left:right]
            a, b, c = weight*gx*gx, weight*gx*gy, weight*gy*gy
            matrix = np.array([[a.sum(), b.sum()], [b.sum(), c.sum()]])
            eigenvalues = np.linalg.eigvalsh(matrix)
            if eigenvalues[0] < max(1e-10, eigenvalues[1]*1e-3):
                q = original; break
            refined = np.linalg.solve(matrix, [(a*xx+b*yy).sum(), (b*xx+c*yy).sum()])
            if np.linalg.norm(refined-original) > radius or not ((refined >= 0).all() and (refined < mask.shape[::-1]).all()):
                q = original; break
            change = np.linalg.norm(refined-q); q = refined
            if change < .01: break
        result.append(q)
    return np.asarray(result, dtype=np.float32).reshape(-1, 2)


def corner_nodes(mask, response, threshold, valid, refine=False):
    nodes = detect_nodes(response*valid, threshold)
    if not refine: return nodes
    nodes = refine_corners(mask, nodes)
    selected = []
    for node in nodes:  # Preserve the original response-score order.
        if not valid[int(node[1]), int(node[0])]: continue
        if not any(np.max(np.abs(node-p)) <= 4 for p in selected): selected.append(node)
    return np.asarray(selected, dtype=np.float32).reshape(-1, 2)
