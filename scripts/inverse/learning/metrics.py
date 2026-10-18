"""Thin, one-to-one boundary evaluation; independent of neural model training."""
import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import maximum_flow


def thin_boundary(mask):
    """Guo–Hall two-subiteration thinning with a zero-padded exterior.

    NumPy evaluation of the deletion conditions, also documented in OpenCV:
    https://github.com/opencv/opencv_contrib/blob/4.x/modules/ximgproc/src/thinning.cpp
    Padding lets boundaries touching the image edge undergo the same operation.
    No component pruning, gap filling, or reference-dependent cleanup occurs.
    """
    mask = np.asarray(mask, dtype=bool)
    if mask.ndim != 2:
        raise ValueError('Boundary must be a two-dimensional array')
    work = np.pad(mask, 1)
    center = work[1:-1, 1:-1]
    while True:
        changed = False
        for phase in range(2):
            north, ne = work[:-2, 1:-1], work[:-2, 2:]
            east, se = work[1:-1, 2:], work[2:, 2:]
            south, sw = work[2:, 1:-1], work[2:, :-2]
            west, nw = work[1:-1, :-2], work[:-2, :-2]
            transitions = sum(x.astype(np.uint8) for x in [~north & (ne | east), ~east & (se | south),
                                                         ~south & (sw | west), ~west & (nw | north)])
            pairs_a = sum(x.astype(np.uint8) for x in [nw | north, ne | east, se | south, sw | west])
            pairs_b = sum(x.astype(np.uint8) for x in [north | ne, east | se, south | sw, west | nw])
            pairs = np.minimum(pairs_a, pairs_b)
            protected = ((south | sw | ~nw) & west) if phase == 0 else ((north | ne | ~se) & east)
            remove = center & (transitions == 1) & (pairs >= 2) & (pairs <= 3) & ~protected
            if remove.any():
                center[remove] = False
                changed = True
        if not changed:
            return center.copy()


def pixel_matching_counts(prediction, target, tolerance=3):
    """Maximum-cardinality pixel matching within a Euclidean pixel radius.

    Each pixel participates once. Local grid offsets build a sparse graph;
    memory does not scale as prediction_pixels * target_pixels.
    Returns matched/predicted/reference counts, compatible with data.scores.
    """
    prediction, target = np.asarray(prediction, dtype=bool), np.asarray(target, dtype=bool)
    if prediction.ndim != 2 or prediction.shape != target.shape:
        raise ValueError('Boundary arrays must have matching two-dimensional shapes')
    if not np.isfinite(tolerance) or tolerance < 0:
        raise ValueError('Tolerance must be finite and nonnegative')
    py, px = np.nonzero(prediction)
    n_pred, n_target = len(py), int(target.sum())
    if not n_pred or not n_target:
        return [0, n_pred, n_target]
    indices = np.full(target.shape, -1, dtype=np.int32)
    indices[target] = np.arange(n_target)
    height, width = target.shape
    radius = int(np.floor(tolerance))
    offsets = sorted((dx*dx+dy*dy, dy, dx) for dy in range(-radius, radius+1)
                     for dx in range(-radius, radius+1) if dx*dx+dy*dy <= tolerance*tolerance)
    neighbors = np.full((n_pred, len(offsets)), -1, dtype=np.int32)
    for column, (_, dy, dx) in enumerate(offsets):
        xx, yy = px+dx, py+dy
        keep = np.flatnonzero((xx >= 0) & (xx < width) & (yy >= 0) & (yy < height))
        neighbors[keep, column] = indices[yy[keep], xx[keep]]
    connected = neighbors >= 0
    indptr = np.r_[0, np.cumsum(connected.sum(axis=1))]
    columns = neighbors[connected]
    # A unit-capacity source -> prediction -> target -> sink flow is exactly
    # maximum-cardinality bipartite matching. The installed SciPy 1.13.1
    # Hopcroft–Karp DFS was pathologically slow on an actual contour fixture;
    # Dinic avoids that traversal without changing which pixels may match.
    sink = n_pred+n_target+1
    left = np.arange(n_pred)+1; right = np.arange(n_target)+1+n_pred
    rows = np.r_[np.zeros(n_pred, dtype=np.int32), np.repeat(left, np.diff(indptr)), right]
    cols = np.r_[left, columns+1+n_pred, np.full(n_target, sink)]
    graph = csr_matrix((np.ones(len(rows), np.int32), (rows, cols)), shape=(sink+1, sink+1))
    matched = maximum_flow(graph, 0, sink, method='dinic').flow_value
    return [int(matched), n_pred, n_target]


def thin_matching_counts(prediction, target, valid, tolerances=(1, 2, 3)):
    """Apply the identical thinning/scoring procedure to both boundary sources."""
    prediction, target = thin_boundary(prediction & valid), thin_boundary(target & valid)
    return {str(t): pixel_matching_counts(prediction, target, t) for t in tolerances}
