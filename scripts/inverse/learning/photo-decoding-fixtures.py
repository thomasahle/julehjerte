"""Small independent Pillow references for all eight JPEG EXIF orientations."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps, __version__


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    image = Image.new('RGB', (77, 51), (235, 230, 220))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 22, 17), fill=(210, 15, 50))
    draw.rectangle((39, 25, 76, 50), fill=(10, 80, 195))
    draw.polygon([(28, 5), (60, 10), (40, 38)], fill=(220, 180, 0))
    rows = []
    for orientation in range(1, 9):
        name = f'exif-{orientation}'
        exif = image.getexif()
        exif[274] = orientation
        original = args.output / f'{name}.jpg'
        reference = args.output / f'{name}.png'
        image.save(original, quality=95, subsampling=0, exif=exif)
        with Image.open(original) as decoded:
            expected = ImageOps.exif_transpose(decoded).convert('RGB')
            expected.save(reference)
        rows.append({
            'id': name, 'orientation': orientation,
            'source': str(original), 'sourceSha256': digest(original.read_bytes()),
            'reference': str(reference), 'referenceSha256': digest(reference.read_bytes()),
            'dimensions': list(expected.size),
            'decodedRGBSha256': digest(expected.tobytes()),
        })
    (args.output / 'manifest.json').write_text(json.dumps({
        'schema': 'photo-decoding-fixtures-1', 'pillow': __version__,
        'sourceSha256': digest(Path(__file__).read_bytes()), 'rows': rows,
    }, indent=2) + '\n')


def digest(data):
    return hashlib.sha256(data).hexdigest()


if __name__ == '__main__':
    main()
