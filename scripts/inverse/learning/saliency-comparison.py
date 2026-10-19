"""Compare pinned saliency fields in their full-photo network coordinate frame."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps


def checked(root, asset):
    file = (root/asset['path']).resolve()
    if not file.is_relative_to(root.resolve()): raise ValueError('Escaping field asset')
    raw = file.read_bytes()
    if hashlib.sha256(raw).hexdigest() != asset['sha256']: raise ValueError('Changed field')
    return raw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['reference', 'candidate', 'output']: parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--ids', help='Optional explicit diagnostic subset, never a quality denominator')
    args = parser.parse_args(); manifests = [json.loads((root/'manifest.json').read_bytes()) for root in [args.reference, args.candidate]]
    a, b = manifests
    if any(m['status'] != 'complete' for m in manifests) or a['resolution'] != b['resolution']:
        raise ValueError('Require completed fields at the same resolution')
    if [r['id'] for r in a['rows']] != [r['id'] for r in b['rows']]: raise ValueError('Cohorts differ')
    ids = args.ids.split(',') if args.ids else [r['id'] for r in a['rows']]
    if len(set(ids)) != len(ids) or not set(ids) <= {r['id'] for r in a['rows']}: raise ValueError('Unknown or repeated ID')
    args.output.mkdir(parents=True, exist_ok=False); n = a['resolution']; pages = []; records = []
    for start in range(0, len(ids), 3):
        selected = ids[start:start+3]; panel = Image.new('RGB', (3*n, 26+len(selected)*(n+28)), 'white'); pen = ImageDraw.Draw(panel)
        for i, label in enumerate(['Whole photo: network frame', 'Frozen saliency', 'Adapted saliency']): pen.text((i*n+4, 4), label, fill='black')
        for index, identity in enumerate(selected):
            rows = [next(r for r in m['rows'] if r['id'] == identity) for m in manifests]
            for key in ['photoSha256', 'decodedRGBSha256', 'window', 'dimensions']: assert rows[0][key] == rows[1][key]
            photo = Path(rows[0]['file']); assert hashlib.sha256(photo.read_bytes()).hexdigest() == rows[0]['photoSha256']
            with Image.open(photo) as source:
                rgb = ImageOps.exif_transpose(source).convert('RGB'); assert list(rgb.size) == rows[0]['dimensions']
                assert hashlib.sha256(np.asarray(rgb).tobytes()).hexdigest() == rows[0]['decodedRGBSha256']
                images = [rgb.resize((n, n), Image.Resampling.BILINEAR)]
            for root, row in zip([args.reference, args.candidate], rows):
                field = np.frombuffer(checked(root, row['assets']['probability.f32']), dtype='<f4').reshape(n, n)
                assert np.isfinite(field).all() and np.all((field >= 0) & (field <= 1))
                images.append(Image.fromarray(np.uint8(field*255)))
            top = 26+index*(n+28)
            for col, image in enumerate(images): panel.paste(image, (col*n, top))
            pen.text((4, top+n+3), identity, fill='black'); records.append({'id': identity, 'page': len(pages)+1, 'row': index+1})
        file = args.output/('bodies-'+str(len(pages)+1)+'.jpg'); panel.save(file, quality=92)
        pages.append({'path': file.name, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
    manifest = {'reference': str(args.reference), 'candidate': str(args.candidate), 'records': records, 'pages': pages,
                'scope': 'Diagnostic selection only. Photos and fields are stretched to the same network frame; these are neither physical crop proposals nor reviewed body labels. Creating this gallery is not visual review.'}
    (args.output/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print(json.dumps({'photos': len(ids), 'pages': len(pages)}))


if __name__ == '__main__': main()
