"""Observable graph labels and fixed-source splits for the offline CNN experiment."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, maximum_filter, binary_erosion
from scipy.optimize import linear_sum_assignment


def digest(data):
    return hashlib.sha256(data).hexdigest()


def project(matrix, points):
    points = np.asarray(points, dtype=np.float64).reshape(-1, 2)
    xyz = np.column_stack([points, np.ones(len(points))]) @ np.asarray(matrix).reshape(3, 3).T
    return xyz[:, :2] / xyz[:, 2:]


def bezier(controls, t):
    p = np.asarray(controls)
    return (1-t)**3*p[0] + 3*(1-t)**2*t*p[1] + 3*(1-t)*t*t*p[2] + t**3*p[3]


def projected_polyline(controls, matrix, tolerance=.2):
    """Flatten the projected curve, never its naively transformed control polygon."""
    def at(t):
        return project(matrix, [bezier(controls, t)])[0]
    result = [at(0)]
    def split(a, b, pa, pb, depth):
        ts = [a+(b-a)*f for f in (.25, .5, .75)]
        actual = [at(t) for t in ts]
        error = max(np.linalg.norm(p-((1-f)*pa+f*pb)) for p, f in zip(actual, (.25, .5, .75)))
        if error <= tolerance or depth >= 12:
            result.append(pb)
        else:
            split(a, ts[1], pa, actual[1], depth+1)
            split(ts[1], b, actual[1], pb, depth+1)
    split(0, 1, result[0], at(1), 0)
    return result


def observable_nodes(curves, matrix, corner_degrees=20):
    """Visible branches/corners; suppress degree-one endpoints and smooth knots.

    Only visible curves enter this function. Unobservable shared-cut anchors
    cannot become uniquely supervised junctions merely because a witness has one.
    """
    incident = {}
    for curve in curves:
        for end, t, inner in [(0, 0, .01), (3, 1, .99)]:
            key = tuple(round(x, 5) for x in curve[end])
            point, nearby = project(matrix, [bezier(curve, t), bezier(curve, inner)])
            direction = nearby-point
            if np.linalg.norm(direction) < 1e-10:
                continue
            incident.setdefault(key, (point, []))[1].append(direction/np.linalg.norm(direction))
    nodes = []
    for point, directions in incident.values():
        smooth = len(directions) == 2 and np.dot(*directions) < -np.cos(np.deg2rad(corner_degrees))
        if len(directions) >= 2 and not smooth:
            nodes.append(point)
    return np.asarray(nodes, dtype=np.float32).reshape(-1, 2)


def boundary_pixels(curves, matrix, resolution):
    image = Image.new('L', (resolution, resolution))
    draw = ImageDraw.Draw(image)
    for curve in curves:
        points = projected_polyline(curve, matrix)
        draw.line([tuple(p-.5) for p in points], fill=255, width=1)
    return np.asarray(image) > 0


def node_heatmap(points, resolution, sigma=2):
    heat = np.zeros((resolution, resolution), dtype=np.float32)
    for x, y in points:
        left, top = max(0, int(x-4*sigma)), max(0, int(y-4*sigma))
        right, bottom = min(resolution, int(x+4*sigma+1)), min(resolution, int(y+4*sigma+1))
        if right <= left or bottom <= top:
            continue
        yy, xx = np.mgrid[top:bottom, left:right]
        gaussian = np.exp(-((xx+.5-x)**2+(yy+.5-y)**2)/(2*sigma*sigma))
        heat[top:bottom, left:right] = np.maximum(heat[top:bottom, left:right], gaussian)
    return heat


def detect_nodes(heat, threshold=.25, radius=4, maximum=512):
    # Predictions are stored in float16 to bound evaluation memory, while
    # scipy.ndimage's maximum filter requires at least float32 on this platform.
    heat = np.asarray(heat, dtype=np.float32)
    peaks = (heat >= threshold) & (heat == maximum_filter(heat, size=2*radius+1, mode='constant'))
    y, x = np.where(peaks)
    order = np.argsort(-heat[y, x], kind='stable')
    # Equal maxima can occupy several adjacent pixels (even an exact Gaussian
    # centered at integer coordinates has four). Keep one local proposal,
    # instead of counting a perfect response as duplicate false positives.
    blocked = np.zeros(heat.shape, dtype=bool)
    selected = []
    for i in order:
        px, py = x[i], y[i]
        if blocked[py, px]: continue
        selected.append([px+.5, py+.5])
        blocked[max(0, py-radius):py+radius+1, max(0, px-radius):px+radius+1] = True
        if len(selected) >= maximum: break
    return np.asarray(selected, dtype=np.float32).reshape(-1, 2)


def point_counts(predicted, target, tolerance=3):
    """One-to-one matching, so duplicate detections cannot inflate recall."""
    predicted, target = np.asarray(predicted).reshape(-1, 2), np.asarray(target).reshape(-1, 2)
    if not len(predicted) or not len(target):
        return [0, len(predicted), len(target)]
    distances = np.linalg.norm(predicted[:, None]-target[None], axis=-1)
    costs = np.where(distances <= tolerance, distances/(tolerance+1), 1e6)
    rows, cols = linear_sum_assignment(costs)
    matched = int(np.sum(distances[rows, cols] <= tolerance))
    return [matched, len(predicted), len(target)]


def scores(counts):
    matched, predicted, target = counts
    precision = matched/predicted if predicted else float(target == 0)
    recall = matched/target if target else float(predicted == 0)
    return {'precision': precision, 'recall': recall, 'f1': 2*precision*recall/(precision+recall) if precision+recall else 0,
            'matched': int(matched), 'predicted': int(predicted), 'target': int(target)}


def checked_asset(root, asset):
    filename = (root/asset['path']).resolve()
    if not filename.is_relative_to(root.resolve()):
        raise ValueError('Dataset path escapes root')
    data = filename.read_bytes()
    if digest(data) != asset['sha256']:
        raise ValueError('Changed dataset asset: '+str(filename))
    return filename


class Corpus:
    def __init__(self, prepared):
        self.root = Path(prepared).resolve()
        self.prepared = json.loads((self.root/'manifest.json').read_text())
        self.dataset = Path(self.prepared['dataset'])
        source = (self.dataset/'manifest.json').read_bytes()
        if self.prepared['status'] != 'complete' or digest(source) != self.prepared['datasetManifestSha256']:
            raise ValueError('Incomplete preprocessing or changed source manifest')
        self.manifest = json.loads(source)
        self.designs = {d['id']: d for d in self.manifest['baseDesigns']}
        self.views = {v['id']: v for v in self.manifest['views']}
        if len(self.views) != len(self.prepared['rows']):
            raise ValueError('Preprocessing omitted views')
        if self.manifest['sourceProvenance']['externalAssets'] or any(self.manifest['splitPolicy'][k] for k in ['existingPhotoQAIncluded', 'existingHunodanQAIncluded', 'existingGalleryIncluded']):
            raise ValueError('This experiment only accepts procedural data')
        # All views of a design stay together. This is an in-recipe development
        # holdout, not a claim of topology-independent generalization.
        train = sorted((d for d in self.designs.values() if d['split'] == 'train'), key=lambda d: d['geometrySha256'])
        if len(train) < 8:
            raise ValueError('Require at least eight training geometries')
        development = {d['id'] for d in train[::5]}
        self.split = {d['id']: ('development' if d['id'] in development else 'train') if d['split'] == 'train' else 'recipe-'+d['split'] for d in self.designs.values()}
        geometry_splits = {}
        for d in self.designs.values():
            previous = geometry_splits.setdefault(d['geometrySha256'], self.split[d['id']])
            if previous != self.split[d['id']]:
                raise ValueError('Identical cutting geometry crosses experimental splits')
        self.resolution = self.prepared['resolution']
        self.rows = self.prepared['rows']

    def load(self, row):
        n = self.resolution
        view = self.views[row['id']]
        design = self.designs[view['designId']]
        labels = json.loads(checked_asset(self.dataset, view['assets']['labels.json']).read_text())
        graph = json.loads(checked_asset(self.dataset, design['assets']['graph.json']).read_text())
        # Crop labels use original image pixels. Scale to the actual network input.
        matrix = np.asarray(labels['canonicalToCrop']).reshape(3, 3).copy()
        matrix[:2] *= n/labels['resolution']
        curves = [e['cubic'] for e in graph['edges'] if e['visible']]
        nodes = observable_nodes(curves, matrix)
        nodes = nodes[(nodes >= 0).all(1) & (nodes < n).all(1)]
        boundary = boundary_pixels(curves, matrix, n)
        heat = np.exp(-distance_transform_edt(~boundary)**2/(2*1.5**2)).astype(np.float32) if boundary.any() else np.zeros((n, n), np.float32)
        rgb = np.asarray(Image.open(checked_asset(self.root, row['assets']['rgb.png'])).convert('RGB')).copy()
        mask = np.asarray(Image.open(checked_asset(self.root, row['assets']['mask.png'])).convert('L')).copy()/255
        trace = json.loads(checked_asset(self.root, row['assets']['trace.json']).read_text())
        baseline_matrix = np.diag([n/100, n/100, 1])
        baseline_nodes = observable_nodes(trace['curves'], baseline_matrix)
        baseline_nodes = baseline_nodes[(baseline_nodes >= 0).all(1) & (baseline_nodes < n).all(1)]
        baseline_boundary = boundary_pixels(trace['curves'], baseline_matrix, n)
        valid = np.asarray(Image.open(checked_asset(self.dataset, view['assets']['crop-overlap-valid.png'])).convert('L').resize((n, n), Image.Resampling.NEAREST)) > 127
        # The first experiment measures boundary/junction recovery inside the
        # known overlap. Endpoint/crop hypotheses require a separate task.
        valid = binary_erosion(valid, iterations=2)
        inside = lambda points: points[valid[np.clip(points[:, 1].astype(int), 0, n-1), np.clip(points[:, 0].astype(int), 0, n-1)]]
        nodes, baseline_nodes = inside(nodes), inside(baseline_nodes)
        return {'id': row['id'], 'designId': view['designId'], 'split': self.split[view['designId']],
                'rgb': rgb, 'mask': mask.astype(np.float32), 'target': np.stack([heat, node_heatmap(nodes, n)]),
                'valid': valid, 'boundary': boundary, 'nodes': nodes, 'baselineNodes': baseline_nodes, 'baselineBoundary': baseline_boundary}
