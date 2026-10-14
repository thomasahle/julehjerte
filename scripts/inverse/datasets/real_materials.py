"""Partial two-paper annotations, layered over unchanged reviewed body labels.

Paper A/B identify material within one photograph, not brightness, RGB classes,
cut paths or a globally ordered pair of sheets. Unannotated paper stays unknown.
"""
import argparse
import html
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

from real_annotations import (ROOT, checked_annotations, digest, photo_tensor,
                              polygon_fields, rasterize, read_source, validate_polygon)


VALUES = {'paperA': 0, 'paperB': 1, 'unknown': 255}


def checked_materials(manifest, annotations, root=ROOT, *, purpose='training-candidate'):
    if annotations.get('schema') != 'woven-heart-real-material-annotations-1' or not annotations.get('instances'):
        raise ValueError('Unsupported material annotations')
    bodies = {}
    for reference in annotations['bodyAnnotations']:
        path = (root/reference['path']).resolve()
        if not path.is_relative_to(root.resolve()) or digest(path.read_bytes()) != reference['sha256']:
            raise ValueError('Changed or escaping body annotation reference')
        parent = json.loads(path.read_bytes())
        if parent.get('schema') != 'woven-heart-real-annotations-1':
            raise ValueError('Unsupported body annotation reference')
        for row in parent['instances']:
            if row['id'] in bodies:
                raise ValueError('Duplicate body annotation reference')
            bodies[row['id']] = row
    seen = set()
    for item in annotations['instances']:
        identity = item['id']
        if identity in seen or identity not in bodies:
            raise ValueError('Duplicate or unknown material instance')
        seen.add(identity)
        # A parent file may also contain QA-only bodies that are not selected.
        row, source = next(checked_annotations(manifest, {'schema': 'woven-heart-real-annotations-1',
                                                       'instances': [bodies[identity]]}, purpose=purpose))
        if item.get('review', {}).get('status') != 'initial-reviewed' or not item['review'].get('note'):
            raise ValueError('Material polygons need a recorded visual review')
        band = item['boundaryUncertaintyPixels']
        if type(band) not in [int, float] or not math.isfinite(band) or band <= 0:
            raise ValueError('Material boundaries require positive uncertainty')
        if set(item['papers']) != {'paperA', 'paperB'}:
            raise ValueError('Require two local paper identities')
        for paper in item['papers'].values():
            if not paper.get('description') or not paper.get('polygons'):
                raise ValueError('Each material needs a description and reviewed polygons')
            for polygon in paper['polygons']:
                validate_polygon(polygon, row['sourceSize'])
        yield item, row, source


def rasterize_materials(item, body_row, resolution=256):
    body, transform = rasterize(body_row, resolution)
    yy, xx = np.mgrid[:resolution, :resolution]
    x = (xx+.5-transform['offset'][0])/transform['scale']
    y = (yy+.5-transform['offset'][1])/transform['scale']
    materials = np.full(body.shape, 255, dtype=np.uint8)
    for name in ['paperA', 'paperB']:
        known = np.zeros(body.shape, dtype=bool)
        for polygon in item['papers'][name]['polygons']:
            inside, distance = polygon_fields(polygon, x, y)
            known |= inside & (distance > item['boundaryUncertaintyPixels']**2)
        if np.any(known & (body == 0)):
            raise ValueError('Material annotation conflicts with known background')
        known &= body == 1  # Never restore an uncertain outline or hidden contact.
        if np.any(known & (materials != 255)):
            raise ValueError('Conflicting paper identities overlap')
        if not np.any(known):
            raise ValueError('Each paper needs known pixels at the requested resolution')
        materials[known] = VALUES[name]
    return body, materials, transform


def render(item, body_row, source, resolution, root):
    body, materials, transform = rasterize_materials(item, body_row, resolution)
    rgb = np.asarray(photo_tensor(read_source(root, source), transform))
    overlay = rgb.astype(float)
    overlay[body == 0] *= .5
    overlay[body == 255] = .5*overlay[body == 255]+.5*np.array([140, 140, 140])
    for value, color in [(0, [255, 130, 0]), (1, [0, 200, 255])]:
        overlay[materials == value] = .55*overlay[materials == value]+.45*np.array(color)
    arrays = {'rgb': rgb, 'body': body, 'materials': materials, 'overlay': overlay.astype(np.uint8)}
    metadata = {'id': item['id'], 'assetId': source['id'], 'imageSha256': source['sha256'],
                **{k: source[k] for k in ['nearDuplicateGroup', 'splitGroupId', 'splitStatus', 'trainingRightsStatus']},
                'allocation': body_row['allocation'], 'motif': body_row['motif'], 'transform': transform,
                'bodyPixelCounts': {str(v): int((body == v).sum()) for v in [0, 1, 255]},
                'materialPixelCounts': {str(v): int((materials == v).sum()) for v in [0, 1, 255]}}
    return arrays, metadata


def build(manifest_path, annotations_path, output, resolution=256, root=ROOT, *, purpose='training-candidate'):
    source_bytes, annotation_bytes = manifest_path.read_bytes(), annotations_path.read_bytes()
    rows = list(checked_materials(json.loads(source_bytes), json.loads(annotation_bytes), root, purpose=purpose))
    output.mkdir(parents=True, exist_ok=False)
    result = {'schema': 'woven-heart-real-material-labels-1', 'status': 'building', 'purpose': purpose,
              'sourceManifestSha256': digest(source_bytes), 'annotationsSha256': digest(annotation_bytes),
              'implementationSha256': digest(Path(__file__).read_bytes()), 'materialValues': VALUES,
              'bodyValues': {'background': 0, 'selectedPaper': 1, 'unknown': 255},
              'scope': 'Partial assistant-reviewed material identities with independent body supervision. A/B order is local to each image. No cutting-path labels or assigned train/test split.',
              'instances': []}
    def save():
        (output/'manifest.json').write_text(json.dumps(result, indent=2)+'\n')
    save(); panels = []
    for item, body_row, source in rows:
        arrays, metadata = render(item, body_row, source, resolution, root)
        assets = {}
        for kind, array in arrays.items():
            name = item['id']+'-'+kind+'.png'
            Image.fromarray(array).save(output/name)
            assets[kind] = {'path': name, 'sha256': digest((output/name).read_bytes())}
        result['instances'].append({**metadata, 'assets': assets})
        panels.append('<article><h2>'+html.escape(item['id'])+'</h2><p>'+html.escape(item['review']['note'])+'</p>'+''.join(
            '<img width="'+str(resolution)+'" src="'+assets[k]['path']+'" alt="'+k+'">' for k in ['rgb', 'overlay'])+'</article>')
    result['status'] = 'complete'; save()
    (output/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Reviewed paper materials</title><style>body{font:16px system-ui;margin:24px}article{max-width:1100px}img{max-width:49%;height:auto}</style><h1>Partial paper identities</h1><p>Orange: paper A. Cyan: paper B. Unpainted body: unknown material. Grey: uncertain body. Darkened: background. A/B may be exchanged for the entire image, never independently per patch.</p>'+''.join(panels))
    return verify(manifest_path, annotations_path, output, root, purpose=purpose)


def verify(manifest_path, annotations_path, output, root=ROOT, *, purpose='training-candidate'):
    source_bytes, annotation_bytes = manifest_path.read_bytes(), annotations_path.read_bytes()
    rows = {i['id']: (i, b, s) for i, b, s in checked_materials(json.loads(source_bytes), json.loads(annotation_bytes), root, purpose=purpose)}
    raw = (output/'manifest.json').read_bytes(); report = json.loads(raw)
    if report.get('schema') != 'woven-heart-real-material-labels-1' or report.get('status') != 'complete' or report.get('sourceManifestSha256') != digest(source_bytes) or report.get('annotationsSha256') != digest(annotation_bytes):
        raise ValueError('Changed or incomplete material label parents')
    if report.get('purpose') not in ['training-candidate', 'diagnostic']:
        raise ValueError('Unknown material artifact purpose')
    if purpose != 'diagnostic' and report['purpose'] == 'diagnostic':
        raise ValueError('Diagnostic material labels cannot enter training')
    if report.get('materialValues') != VALUES or report.get('bodyValues') != {'background': 0, 'selectedPaper': 1, 'unknown': 255}:
        raise ValueError('Changed material or body semantics')
    ids = [r['id'] for r in report['instances']]
    if len(ids) != len(set(ids)) or set(ids) != set(rows):
        raise ValueError('Missing or duplicate material instance')
    for row in report['instances']:
        arrays, metadata = render(*rows[row['id']], row['transform']['resolution'], root)
        if any(row.get(k) != v for k, v in metadata.items()) or set(row['assets']) != set(arrays):
            raise ValueError('Changed material metadata, source grouping or assets')
        for kind, expected in arrays.items():
            asset = row['assets'][kind]; path = (output/asset['path']).resolve()
            if not path.is_relative_to(output.resolve()) or digest(path.read_bytes()) != asset['sha256']:
                raise ValueError('Changed or escaping material asset')
            if not np.array_equal(np.asarray(Image.open(path)), expected):
                raise ValueError('Material artifact pixels disagree with reviewed annotations: '+kind)
    return {'passed': True, 'instances': len(rows), 'sourceGroups': len({s['splitGroupId'] for _, _, s in rows.values()}),
            'manifestSha256': digest(raw), 'annotationsSha256': digest(annotation_bytes),
            'scope': 'Source bytes, body references, grouping, transforms and every output pixel; annotation correctness still requires visual review.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=ROOT/'docs/inverse/datasets/real-manifest.json')
    parser.add_argument('--annotations', type=Path, default=Path(__file__).with_name('real-materials.json'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--resolution', type=int, default=256)
    parser.add_argument('--purpose', choices=['training-candidate', 'diagnostic'], default='training-candidate')
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    audit = verify(args.manifest, args.annotations, args.output, purpose=args.purpose) if args.verify else build(args.manifest, args.annotations, args.output, args.resolution, purpose=args.purpose)
    print(json.dumps(audit, indent=2))
