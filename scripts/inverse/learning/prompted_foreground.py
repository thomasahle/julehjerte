"""Automatic prompts and field alignment for offline object-segmentation probes.

Coordinates in the saved prediction window are source pixel edges. SAM prompts
use source pixel centres (the first centre is zero). No annotation is consumed.
"""
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, label


def validate_window(window, dimensions):
    box = np.asarray(window, dtype=float)
    size = np.asarray(dimensions, dtype=float)
    if (box.shape != (4,) or size.shape != (2,) or not np.isfinite(box).all()
            or not np.isfinite(size).all() or (size <= 0).any()
            or box[2] <= box[0] or box[3] <= box[1]):
        raise ValueError('Require a finite positive window and source dimensions')
    return box, size


def automatic_prompts(probability, window, dimensions, padding=.05, paper_probability=None):
    """Largest observed .5 component, padded box and deepest interior point.

    Equal-size components and equal-depth points use NumPy's first row-major
    result. Padding is a fraction of component width/height, not source size.
    Letterbox padding cannot produce prompts outside the source photograph.
    """
    p = np.asarray(probability)
    box, size = validate_window(window, dimensions)
    if (p.ndim != 2 or min(p.shape) < 2 or not np.isfinite(p).all()
            or ((p < 0) | (p > 1)).any() or not np.isfinite(padding) or padding < 0):
        raise ValueError('Require finite probabilities and nonnegative padding')
    material = None if paper_probability is None else np.asarray(paper_probability)
    if material is not None and (material.shape != p.shape or not np.isfinite(material).all()
                                 or ((material < 0) | (material > 1)).any()):
        raise ValueError('Require matching finite paper probabilities')
    h, w = p.shape
    dx, dy = (box[2:]-box[:2])/[w, h]
    xs, ys = box[0]+(np.arange(w)+.5)*dx, box[1]+(np.arange(h)+.5)*dy
    observed = ((ys >= 0) & (ys < size[1]))[:, None] & ((xs >= 0) & (xs < size[0]))[None, :]
    components, count = label((p >= .5) & observed, structure=np.ones((3, 3)))
    if not count:
        return None
    counts = np.bincount(components.ravel()); counts[0] = 0
    component = components == counts.argmax()
    yy, xx = np.nonzero(component)
    # Boundaries enclose the component's cells; convert to SAM pixel centres.
    bounds = np.array([box[0]+xx.min()*dx, box[1]+yy.min()*dy,
                       box[0]+(xx.max()+1)*dx, box[1]+(yy.max()+1)*dy])-.5
    pad = (bounds[2:]-bounds[:2])*padding
    bounds[:2] -= pad; bounds[2:] += pad
    bounds = np.clip(bounds, 0, np.tile(size-1, 2))
    if (bounds[2:] <= bounds[:2]).any():
        return None
    # Explicit exterior zeros keep an all-foreground component well-defined.
    depth = distance_transform_edt(np.pad(component, 1), sampling=[dy, dx])[1:-1, 1:-1]
    y, x = np.unravel_index(depth.argmax(), depth.shape)
    point = np.clip([xs[x]-.5, ys[y]-.5], 0, size-1)
    result = {'box': bounds.tolist(), 'point': point.tolist(),
              'componentPixels': int(component.sum()), 'componentCount': int(count)}
    if material is not None:
        # Ask for both papers, rather than letting one prompt identify a single
        # coloured sheet. These are frozen RGB estimates, not material labels.
        seeds = [component & (p >= .8) & (material <= .2),
                 component & (p >= .8) & (material >= .8)]
        result['paperSeedPixels'] = [int(seed.sum()) for seed in seeds]
        result['paperPoints'] = None
        if min(result['paperSeedPixels']) >= 16:
            points = []
            for seed in seeds:
                depth = distance_transform_edt(np.pad(seed, 1), sampling=[dy, dx])[1:-1, 1:-1]
                y, x = np.unravel_index(depth.argmax(), depth.shape)
                points.append(np.clip([xs[x]-.5, ys[y]-.5], 0, size-1).tolist())
            result['paperPoints'] = points
    return result


def probability_window(logits, window, resolution=256):
    """Sample full-source logits onto the frozen field window; padding is zero."""
    a = np.asarray(logits)
    if a.ndim != 2 or not np.isfinite(a).all() or resolution < 2:
        raise ValueError('Require finite 2D source logits and positive resolution')
    box, _ = validate_window(window, [a.shape[1], a.shape[0]])
    probability = (1/(1+np.exp(-np.clip(a.astype(np.float64), -40, 40)))).astype(np.float32)
    transform = ((box[2]-box[0])/resolution, 0, box[0],
                 0, (box[3]-box[1])/resolution, box[1])
    sampled = Image.fromarray(probability).transform(
        (resolution, resolution), Image.Transform.AFFINE, transform,
        resample=Image.Resampling.BILINEAR, fillcolor=0)
    return np.asarray(sampled).copy()
