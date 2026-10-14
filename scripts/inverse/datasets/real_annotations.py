"""Verify and rasterize reviewed real-photo annotations, without inventing cuts.

Coordinates belong to the untransformed source image. Labels are evaluated at
output pixel centres through an aspect-preserving letterbox transform. A real
annotation has uncertain boundaries, unlike our exact synthetic camera labels.
"""
import argparse
import hashlib
import html
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def cross(a, b, c):
    return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])


def intersects(a, b, c, d):
    if max(a[0], b[0]) < min(c[0], d[0]) or max(c[0], d[0]) < min(a[0], b[0]) or max(a[1], b[1]) < min(c[1], d[1]) or max(c[1], d[1]) < min(a[1], b[1]):
        return False
    return cross(a, b, c)*cross(a, b, d) <= 0 and cross(c, d, a)*cross(c, d, b) <= 0


def validate_polygon(polygon, size):
    if not isinstance(polygon, list) or len(polygon) < 3:
        raise ValueError('A polygon needs at least three vertices')
    for point in polygon:
        if not isinstance(point, list) or len(point) != 2 or any(type(x) not in [int, float] or not math.isfinite(x) for x in point):
            raise ValueError('Invalid polygon coordinate')
        if not 0 <= point[0] <= size[0] or not 0 <= point[1] <= size[1]:
            raise ValueError('Polygon lies outside the observed photograph')
    area = 0
    for i, a in enumerate(polygon):
        b = polygon[(i+1) % len(polygon)]
        if a == b:
            raise ValueError('Duplicate polygon vertex')
        area += a[0]*b[1]-a[1]*b[0]
        for j in range(i+2, len(polygon)):
            if i == 0 and j == len(polygon)-1:
                continue
            if intersects(a, b, polygon[j], polygon[(j+1) % len(polygon)]):
                raise ValueError('Self-intersecting polygon')
    if abs(area) < 1:
        raise ValueError('Degenerate polygon')


def checked_annotations(manifest, annotations, *, purpose='training-candidate'):
    if purpose not in ['training-candidate', 'diagnostic']:
        raise ValueError('Unknown annotation purpose')
    if annotations.get('schema') != 'woven-heart-real-annotations-1' or not isinstance(annotations.get('instances'), list):
        raise ValueError('Unsupported real-photo annotations')
    assets = {a['id']: a for a in manifest['assets']}
    if len(assets) != len(manifest['assets']):
        raise ValueError('Duplicate source asset')
    seen = set()
    for row in annotations['instances']:
        identity = row['id']
        if identity in seen or not identity or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in identity):
            raise ValueError('Duplicate or unsafe instance identifier')
        seen.add(identity)
        source = assets.get(row['assetId'])
        if not source or source['sha256'] != row['imageSha256'] or [source['width'], source['height']] != row['sourceSize']:
            raise ValueError('Annotation source identity or dimensions changed')
        reserved = source['splitStatus'] == 'qa-reserved'
        if reserved and purpose != 'diagnostic':
            raise ValueError('Existing QA or connected source group is reserved')
        if source['kind'] not in ['photo', 'photo-collage', 'photo-multiple', 'mixed-photo-template']:
            raise ValueError('Annotation source is not a reviewed photograph')
        if row.get('allocation') != ('qa-reserved' if reserved else 'unassigned'):
            raise ValueError('Annotation allocation must match its source QA reservation or remain unassigned')
        if row.get('review', {}).get('status') != 'initial-reviewed' or not row.get('review', {}).get('note'):
            raise ValueError('Annotation needs a recorded visual review')
        if not row.get('foregroundPolygons') or not isinstance(row.get('unknownPolygons'), list):
            raise ValueError('Missing foreground or uncertainty annotation')
        if type(row['boundaryUncertaintyPixels']) not in [int, float] or not math.isfinite(row['boundaryUncertaintyPixels']) or row['boundaryUncertaintyPixels'] <= 0:
            raise ValueError('Manual outlines require a positive uncertainty band')
        for polygon in row['foregroundPolygons']+row['unknownPolygons']:
            validate_polygon(polygon, row['sourceSize'])
        corners = row.get('overlapCorners')
        if corners is not None:
            if len(corners['points']) != 4 or corners['status'] != 'approximate-visible-reference' or corners['order'] != 'notch,right,tip,left':
                raise ValueError('Unsupported overlap reference')
            validate_polygon(corners['points'], row['sourceSize'])
            turns = [cross(*[corners['points'][(i+j) % 4] for j in range(3)]) for i in range(4)]
            if not all(v > 0 for v in turns):
                raise ValueError('Overlap reference must be convex and clockwise')
            radius = corners['uncertaintyRadiusPixels']
            if type(radius) not in [int, float] or not math.isfinite(radius) or radius <= 0:
                raise ValueError('Approximate corners require uncertainty')
        yield row, source


def polygon_fields(polygon, x, y):
    """Even-odd membership and squared distance to every straight boundary."""
    inside = np.zeros(x.shape, dtype=bool)
    distance = np.full(x.shape, np.inf)
    for i, a in enumerate(polygon):
        b = polygon[(i+1) % len(polygon)]
        dx, dy = b[0]-a[0], b[1]-a[1]
        if dy:
            inside ^= ((a[1] > y) != (b[1] > y)) & (x < a[0]+(y-a[1])*dx/dy)
        t = np.clip(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy), 0, 1)
        distance = np.minimum(distance, (x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2)
    return inside, distance


def rasterize(row, resolution=256):
    if type(resolution) is not int or not 32 <= resolution <= 1024:
        raise ValueError('Resolution must be an integer from 32 to 1024')
    width, height = row['sourceSize']
    scale = resolution/max(width, height)
    offset = [(resolution-width*scale)/2, (resolution-height*scale)/2]
    yy, xx = np.mgrid[:resolution, :resolution]
    x, y = (xx+.5-offset[0])/scale, (yy+.5-offset[1])/scale
    observed = (x >= 0) & (x < width) & (y >= 0) & (y < height)
    foreground = np.zeros(x.shape, dtype=bool)
    unknown = ~observed
    band = row['boundaryUncertaintyPixels']**2
    for polygon in row['foregroundPolygons']:
        inside, distance = polygon_fields(polygon, x, y)
        foreground |= inside
        unknown |= distance <= band
    for polygon in row['unknownPolygons']:
        inside, distance = polygon_fields(polygon, x, y)
        unknown |= inside | (distance <= band)
    labels = foreground.astype(np.uint8)
    labels[unknown] = 255
    if not np.any(labels == 1) or not np.any(labels == 0):
        raise ValueError('Annotations need known paper and known background')
    return labels, {'scale': scale, 'offset': offset, 'resolution': resolution}


def photo_tensor(photo, transform):
    """Sample the same continuous pixel-edge transform as the label renderer."""
    scale, (ox, oy), n = transform['scale'], transform['offset'], transform['resolution']
    photo = photo.convert('RGB')
    width, height = photo.size
    # PIL's affine BILINEAR sampler only sees four source pixels, regardless
    # of the shrinking factor. Prefilter the full footprint with resize first
    # so fine printed patterns do not alias into arbitrary material evidence.
    # Keep the original continuous transform, including fractional padding.
    if scale < 1:
        photo = photo.resize((math.ceil(width*scale), math.ceil(height*scale)), Image.Resampling.BILINEAR)
    sx, sy = photo.width/width, photo.height/height
    return photo.transform((n, n), Image.Transform.AFFINE,
                           (sx/scale, 0, -ox*sx/scale, 0, sy/scale, -oy*sy/scale),
                           Image.Resampling.BILINEAR, fillcolor=(127, 127, 127))


def read_source(root, source):
    path = (root/source['localPath']).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError('Source asset escapes the workspace')
    raw = path.read_bytes()
    if digest(raw) != source['sha256']:
        raise ValueError('Source photograph checksum changed')
    photo = Image.open(path)
    if photo.size != (source['width'], source['height']):
        raise ValueError('Source photograph dimensions changed')
    return photo


def build(manifest_path, annotations_path, output, resolution=256, root=ROOT, *, purpose='training-candidate'):
    manifest_bytes, annotations_bytes = manifest_path.read_bytes(), annotations_path.read_bytes()
    manifest, annotations = json.loads(manifest_bytes), json.loads(annotations_bytes)
    rows = list(checked_annotations(manifest, annotations, purpose=purpose))
    output.mkdir(parents=True, exist_ok=False)
    result = {'schema': 'woven-heart-real-labels-1', 'status': 'building', 'purpose': purpose,
              'sourceManifestSha256': digest(manifest_bytes), 'annotationsSha256': digest(annotations_bytes),
              'implementationSha256': digest(Path(__file__).read_bytes()),
              'labelValues': {'background': 0, 'selectedPaper': 1, 'unknown': 255},
              'scope': 'Assistant-reviewed visible-body labels with uncertainty. No cut-path ground truth, exact-corner claim or train/test allocation.',
              'instances': []}
    def save():
        (output/'manifest.json').write_text(json.dumps(result, indent=2)+'\n')
    save()
    panels = []
    for row, source in rows:
        labels, transform = rasterize(row, resolution)
        photo = photo_tensor(read_source(root, source), transform)
        prefix = row['id']
        photo.save(output/(prefix+'-rgb.png'))
        Image.fromarray(labels).save(output/(prefix+'-labels.png'))
        # Overlay is illustrative only: show known paper green and unknown gold.
        overlay = np.asarray(photo).astype(float)
        overlay[labels == 1] = .6*overlay[labels == 1]+.4*np.array([0, 210, 70])
        overlay[labels == 255] = .5*overlay[labels == 255]+.5*np.array([255, 180, 0])
        overlay = Image.fromarray(overlay.astype(np.uint8))
        pen = ImageDraw.Draw(overlay)
        if row.get('overlapCorners'):
            xy = [(x*transform['scale']+transform['offset'][0], y*transform['scale']+transform['offset'][1]) for x, y in row['overlapCorners']['points']]
            pen.line(xy+[xy[0]], fill='#ff00ff', width=1)
        overlay.save(output/(prefix+'-overlay.png'))
        assets = {kind: {'path': prefix+'-'+kind+'.png', 'sha256': digest((output/(prefix+'-'+kind+'.png')).read_bytes())} for kind in ['rgb', 'labels', 'overlay']}
        result['instances'].append({'id': prefix, 'assetId': source['id'], 'imageSha256': source['sha256'],
                                    'nearDuplicateGroup': source['nearDuplicateGroup'], 'splitGroupId': source['splitGroupId'],
                                    'splitStatus': source['splitStatus'], 'allocation': row['allocation'],
                                    'motif': row['motif'], 'trainingRightsStatus': source['trainingRightsStatus'],
                                    'transform': transform, 'pixelCounts': {str(v): int((labels == v).sum()) for v in [0, 1, 255]},
                                    'assets': assets})
        panels.append('<article><h2>'+html.escape(row['motif']['candidateFamily'])+'</h2><p>'+html.escape(row['review']['note'])+'</p>'+''.join('<img width="'+str(resolution)+'" src="'+assets[k]['path']+'" alt="'+k+'">' for k in ['rgb', 'overlay'])+'</article>')
    result['status'] = 'complete'; save()
    (output/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Real photo annotation pilot</title><style>body{font:16px system-ui;margin:24px;background:#eee}article{display:inline-block;vertical-align:top;width:540px;padding:12px;margin:8px;background:white}h2{font-size:18px}img{max-width:49%;height:auto}</style><h1>Visible basket annotations</h1><p>Green: known selected paper. Gold: uncertain or unobserved. Magenta: approximate overlap reference, never a cut label. Sources and coordinates are pinned in the manifests.</p>'+''.join(panels))
    return verify(manifest_path, annotations_path, output, root, purpose=purpose)


def verify(manifest_path, annotations_path, output, root=ROOT, *, purpose='training-candidate'):
    source_bytes, annotation_bytes = manifest_path.read_bytes(), annotations_path.read_bytes()
    rows = {r['id']: (r, s) for r, s in checked_annotations(json.loads(source_bytes), json.loads(annotation_bytes), purpose=purpose)}
    raw = (output/'manifest.json').read_bytes(); result = json.loads(raw)
    artifact_purpose = result.get('purpose', 'training-candidate')
    if artifact_purpose not in ['training-candidate', 'diagnostic']:
        raise ValueError('Unknown label artifact purpose')
    if purpose != 'diagnostic' and artifact_purpose == 'diagnostic':
        raise ValueError('Diagnostic labels cannot be used for training')
    if result.get('schema') != 'woven-heart-real-labels-1' or result.get('status') != 'complete' or result['sourceManifestSha256'] != digest(source_bytes) or result['annotationsSha256'] != digest(annotation_bytes):
        raise ValueError('Incomplete labels or changed parent annotation/source inventory')
    if result['labelValues'] != {'background': 0, 'selectedPaper': 1, 'unknown': 255}:
        raise ValueError('Changed label semantics')
    ids = [r['id'] for r in result['instances']]
    if len(ids) != len(set(ids)) or set(ids) != set(rows):
        raise ValueError('Missing or duplicated annotated instance')
    for item in result['instances']:
        row, source = rows[item['id']]
        for key in ['assetId', 'imageSha256', 'allocation', 'motif']:
            if item[key] != row[key]:
                raise ValueError('Changed annotation identity or allocation')
        for key in ['nearDuplicateGroup', 'splitGroupId', 'splitStatus', 'trainingRightsStatus']:
            if item[key] != source[key]:
                raise ValueError('Changed source grouping or provenance')
        labels, transform = rasterize(row, item['transform']['resolution'])
        if transform != item['transform'] or {str(v): int((labels == v).sum()) for v in [0, 1, 255]} != item['pixelCounts']:
            raise ValueError('Changed label transform or counts')
        for name, asset in item['assets'].items():
            file = (output/asset['path']).resolve()
            if not file.is_relative_to(output.resolve()) or digest(file.read_bytes()) != asset['sha256']:
                raise ValueError('Changed or escaping label asset')
        actual = np.asarray(Image.open(output/item['assets']['labels']['path']))
        rgb = np.asarray(Image.open(output/item['assets']['rgb']['path']))
        if not np.array_equal(actual, labels):
            raise ValueError('Label pixels disagree with reviewed polygons')
        if not np.array_equal(rgb, np.asarray(photo_tensor(read_source(root, source), transform))):
            raise ValueError('RGB pixels disagree with the source photograph')
    return {'passed': True, 'instances': len(rows), 'sourceGroups': len({s['splitGroupId'] for _, s in rows.values()}),
            'approximateOverlapReferences': sum(r.get('overlapCorners') is not None for r, _ in rows.values()),
            'manifestSha256': digest(raw), 'annotationsSha256': digest(annotation_bytes),
            'scope': 'All source hashes, inherited groups, transforms, known/unknown labels and RGB pixels; not an independent human annotation audit.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=ROOT/'docs/inverse/datasets/real-manifest.json')
    parser.add_argument('--annotations', type=Path, default=Path(__file__).with_name('real-annotations.json'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--resolution', type=int, default=256)
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--purpose', choices=['training-candidate', 'diagnostic'], default='training-candidate')
    args = parser.parse_args()
    if args.verify:
        audit = verify(args.manifest, args.annotations, args.output, purpose=args.purpose)
    else:
        audit = build(args.manifest, args.annotations, args.output, args.resolution, purpose=args.purpose)
    print(json.dumps(audit, indent=2))
