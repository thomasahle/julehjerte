"""Small diagnostic contact sheets for every distinct exported fallback fit."""
import argparse
import hashlib
import html
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--all-attempts', action='store_true', help='Also show unresolved crops and fits, without hiding failed cases.')
    args = parser.parse_args()
    report = json.loads((args.run/'report.json').read_bytes())
    assert report['status'] == 'complete'
    rows = [r for r in report['rows'] if (args.all_attempts or r.get('independentImage')) and not r.get('reusedFitFrom')]
    args.output.mkdir(parents=True, exist_ok=False)
    size = 300; pages = []; records = []
    for start in range(0, len(rows), 4):
        selected = rows[start:start+4]
        panel = Image.new('RGB', (4*size, 30+len(selected)*(size+48)), 'white')
        draw = ImageDraw.Draw(panel)
        for column, title in enumerate(['Source and chosen crop', 'Rectified RGB', 'Classified target', 'Independent exported weave']):
            draw.text((column*size+4, 8), title, fill='black')
        for index, row in enumerate(selected):
            top = 30+index*(size+48)
            error = row.get('independentImage', {}).get('mismatchFraction')
            label = f'{row["id"]} / {row["method"]} / {row["status"]}' + (f' / {error:.2%}' if error is not None else '')
            draw.text((4, top+4), label, fill='black')
            photo = Path(row['source']); assert sha(photo) == row['sourceSha256']
            with Image.open(photo) as image:
                original = ImageOps.exif_transpose(image).convert('RGB'); thumbnail = ImageOps.contain(original, (size, size))
                frame = Image.new('RGB', (size, size), (225, 225, 225))
                ox, oy = (size-thumbnail.width)//2, (size-thumbnail.height)//2
                frame.paste(thumbnail, (ox, oy)); overlay = ImageDraw.Draw(frame)
                if row.get('selectedCrop'):
                    quad = [(ox+p[0]*thumbnail.width/original.width, oy+p[1]*thumbnail.height/original.height) for p in row['selectedCrop']['quad']]
                    overlay.line(quad+[quad[0]], fill=(0, 100, 255), width=2)
            images = [frame]
            for name in ['crop.png', 'mask.png', 'woven.png']:
                if name not in row['assets']:
                    empty = Image.new('RGB', (size, size), (245, 245, 245))
                    ImageDraw.Draw(empty).text((8, 12), 'Not generated', fill='black'); images.append(empty); continue
                asset = row['assets'][name]; file = args.run/asset['path']; assert sha(file) == asset['sha256']
                with Image.open(file) as image:
                    images.append(image.convert('RGB').resize((size, size), Image.Resampling.NEAREST if name != 'crop.png' else Image.Resampling.BILINEAR))
            for column, image in enumerate(images): panel.paste(image, (column*size, top+30))
            records.append({'id': row['id'], 'method': row['method'], 'status': row['status'], 'imageError': error,
                            'page': len(pages)+1, 'row': index+1})
        filename = f'fits-{len(pages)+1}.png'; panel.save(args.output/filename)
        pages.append({'path': filename, 'sha256': sha(args.output/filename)})
    unresolved = [{'id': r['id'], 'method': r['method'], 'status': r['status'], 'selection': r.get('selection')}
                  for r in report['rows'] if not r.get('independentImage')]
    summary = {'schema': 'photo-fallback-gallery-1', 'reportSha256': sha(args.run/'report.json'), 'allAttempts': args.all_attempts,
               'distinctAttempts': records, 'distinctExports': [r for r in records if r['imageError'] is not None],
               'unresolved': unresolved, 'pages': pages,
               'scope': 'Diagnostic thumbnails only. Creating a gallery is not visual review; record observations after inspecting every page.'}
    (args.output/'manifest.json').write_text(json.dumps(summary, indent=2)+'\n')
    heading = 'every distinct attempt' if args.all_attempts else 'every distinct export'
    content = '<!doctype html><meta charset="utf-8"><title>Neural crop fallback</title><style>body{font:16px system-ui;margin:24px}img{max-width:100%}</style><h1>Neural crop fallback: '+heading+'</h1><p>Derived-mask agreement is not original-artwork ground truth. Shared production fits appear once.</p>'
    content += ''.join('<img src="'+html.escape(p['path'])+'" alt="Source crop, RGB, target, and exported weave">' for p in pages)
    (args.output/'index.html').write_text(content)
    print(json.dumps({'distinctAttempts': len(records), 'distinctExports': len(summary['distinctExports']), 'unresolvedAttempts': len(unresolved), 'pages': len(pages)}))


if __name__ == '__main__': main()
