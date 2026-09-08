"""Inspect reconstructed cuts against held-out template scans.

This is a diagnostic: ink includes construction lines and labels. No coordinates,
counts or distances produced here are exposed to reconstruction.
"""
import json
import os
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import distance_transform_edt, map_coordinates

root = Path('scripts/inverse/fixtures/hunodan')
refs = json.loads((root / 'references.json').read_text())['cases']
scope = json.loads((root / 'scope.json').read_text())
folders = [Path(p) for p in sys.argv[1:]]
if not folders:
    raise SystemExit('Pass one or more benchmark output directories; later directories replace earlier candidates.')
candidates = {}
for folder in folders:
    for row in json.loads((folder / 'results.json').read_text())['results']:
        if (folder / row['id'] / 'cut_geometry.json').exists():
            candidates[row['id']] = (folder / row['id'], row)
out = Path(os.environ.get('INVERSE_HUNODAN_REPORT', 'tmp/inverse-hunodan/reference-review'))
out.mkdir(parents=True, exist_ok=True)
results = []
try:
    font = ImageFont.truetype('DejaVuSans.ttf', 15)
except OSError:
    font = ImageFont.load_default()

def sample(data, family):
    paths = []
    for path in data[['A_overlap_paths', 'B_overlap_paths'][family]]:
        points = []
        for segment in path:
            c = np.array(data['curves'][str(segment['curve'])]['control_points'])
            if segment['reverse']:
                c = c[::-1]
            t = np.linspace(0, 1, 25)[:, None]
            p = (1-t)**3*c[0] + 3*t*(1-t)**2*c[1] + 3*t*t*(1-t)*c[2] + t**3*c[3]
            points.extend(p[:, ::-1] if family else p)
        p = np.array(points) / data['square_width_mm']
        # Uniform arclength avoids weighting tiny Bézier pieces more heavily.
        arc = np.r_[0, np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
        at = np.linspace(0, arc[-1], 300)
        paths.append(np.array([np.interp(at, arc, p[:, i]) for i in range(2)]).T)
    return paths

def inspect(paths, image):
    a = np.array(image, dtype=float)
    ink = (a.min(2) < 210) & (a.max(2)-a.min(2) < 18)
    # Remove frame edges; they are not slit evidence.
    ink[:3] = ink[-3:] = False
    ink[:, :3] = ink[:, -3:] = False
    distance = distance_transform_edt(~ink)
    h, w = ink.shape
    best = None
    for flip in [False, True]:
        transformed = [p * [-1, 1] + [1, 0] if flip else p.copy() for p in paths]
        points = np.concatenate(transformed)
        points = points[(points[:, 1] > .02) & (points[:, 1] < .98)]
        distances = map_coordinates(distance, [points[:, 1]*(h-1), points[:, 0]*(w-1)], order=1, mode='nearest') * 100 / w
        record = {'meanInkDistanceMm': float(distances.mean()), 'p95InkDistanceMm': float(np.quantile(distances, .95)), 'mirroredHorizontally': flip}
        if best is None or record['meanInkDistanceMm'] < best[0]['meanInkDistanceMm']:
            best = record, transformed
    return best

for ref in refs:
    id = ref['id']
    if id not in candidates:
        continue
    folder, row = candidates[id]
    data = json.loads((folder / 'cut_geometry.json').read_text())
    source = Image.open(root / 'source' / (id + '.jpg')).convert('RGB')
    reference_images = [source.crop(r['bodyPixels']) for r in ref['templates']]
    families = [sample(data, f) for f in range(2)]
    permutations = [[0, 0]] if ref['sameReferenceForBothSheets'] else [[0, 1], [1, 0]]
    choices = []
    for assignment in permutations:
        match = [inspect(families[f], reference_images[assignment[f]]) for f in range(2)]
        choices.append((sum(m[0]['meanInkDistanceMm'] for m in match), assignment, match))
    _, assignment, match = min(choices, key=lambda c: c[0])
    expected = [ref['templates'][i]['fullSlits'] for i in assignment]
    result = {'id': id, 'benchmarkPassed': row['passed'], 'photoError': row.get('independentImageError'), 'actualCounts': list(map(len, families)), 'referenceCounts': expected, 'countAgreement': list(map(len, families)) == expected, 'referenceAssignment': assignment, 'inkDiagnostics': [m[0] for m in match], 'artifactDirectory': str(folder)}
    results.append(result)
    sheet = Image.new('RGB', (1260, 320), '#f4f5f0')
    draw = ImageDraw.Draw(sheet)
    error = row.get('independentImageError', 1)
    draw.text((8, 6), f'{id} | photo difference {100*error:.2f}% | slits {result["actualCounts"]}, reference {expected}', fill='#162c35', font=font)
    for i, image in enumerate(reference_images):
        image = image.resize((255, 255))
        sheet.paste(image, (8 + i*260, 51))
    if len(reference_images) == 1:
        photo_path = Path(row['sourcePhoto']) if 'sourcePhoto' in row else None
        if photo_path and photo_path.exists():
            photo = Image.open(photo_path).convert('RGB')
            photo.thumbnail((245, 255))
            sheet.paste(photo, (270, 51))
    for f in range(2):
        image = reference_images[assignment[f]].resize((255, 255))
        draw2 = ImageDraw.Draw(image)
        for p in match[f][1]:
            draw2.line([tuple(x) for x in p*254], fill='#007eaa' if f == 0 else '#ba166b', width=2)
        x = 530 + f*260
        sheet.paste(image, (x, 51))
        draw.text((x, 30), f'Sheet {"AB"[f]} over reference', fill='#162c35', font=font)
    independent = Image.open(folder / 'independent.png').convert('RGB').resize((205, 205))
    sheet.paste(independent, (1050, 66))
    sheet.save(out / f'{id}.png')
    print(id, result['actualCounts'], expected, [round(m[0]['meanInkDistanceMm'], 2) for m in match])

for start in range(0, len(results), 5):
    page = Image.new('RGB', (1260, 320*len(results[start:start+5])), 'white')
    for j, row in enumerate(results[start:start+5]):
        page.paste(Image.open(out / (row['id']+'.png')), (0, j*320))
    page.save(out / f'page-{start//5+1}.jpg')
(out / 'results.json').write_text(json.dumps({'limitations': 'Ink proximity includes construction guides and lettering. It is a diagnostic, not an exact geometric ground-truth score. Reference counts and overlays require visual review.', 'scope': scope, 'results': results}, indent=2))
(out / 'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Hunodan reference review</title><style>body{font:16px system-ui;background:#f4f5f0;margin:24px}img{max-width:100%;display:block;margin:20px 0}</style><h1>Independent reference review</h1><p>Reference scans, photographed heart, and fitted sheet cuts overlaid on the references. Horizontal reflection and sheet assignment are chosen only for validation. The last panel independently renders exported curves. Ink proximity includes construction lines; inspect the overlays.</p>' + ''.join(f'<img src="{r["id"]}.png" alt="{r["id"]} reference and fitted cuts">' for r in results))
print(out)
