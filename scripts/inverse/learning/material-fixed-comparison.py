"""Compare material and RGB targets at identical saved crop coordinates.

The RGB target is a previous classifier output, not ground truth. A lower fit
error against a neural target does not establish better artwork reconstruction.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def image(root, row, name):
    asset = row.get('assets', {}).get(name)
    if not asset:
        return None
    file = (root/asset['path']).resolve()
    assert file.is_relative_to(root.resolve()) and sha(file) == asset['sha256']
    with Image.open(file) as source:
        return source.convert('RGB')


def mask(value):
    rgb = np.asarray(value).astype(np.int16)
    return rgb[:, :, 0] > rgb[:, :, 1]+20


def woven_mask(value):
    # The independent SVG renderer writes black/white, whereas classified
    # target previews use red/white. Do not classify black as white paper.
    rgb = np.asarray(value)
    assert np.array_equal(rgb[:, :, 0], rgb[:, :, 1]) and np.array_equal(rgb[:, :, 1], rgb[:, :, 2])
    return rgb[:, :, 0] < 128


def observed(root, row, shape):
    asset = row['assets'].get('observed.bin')
    if not asset:
        return np.ones(shape, dtype=bool)
    file = (root/asset['path']).resolve()
    assert file.is_relative_to(root.resolve()) and sha(file) == asset['sha256']
    result = np.frombuffer(file.read_bytes(), np.uint8).reshape(shape)
    assert np.isin(result, [0, 1]).all()
    return result.astype(bool)


def disagreement(first, second, valid):
    differing = (first != second)[valid]
    error = float(differing.mean())
    return {'fraction': min(error, 1-error), 'phaseExchanged': error > .5}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--reference-method', default='fallback')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    old = json.loads((args.reference/'report.json').read_bytes())
    new = json.loads((args.candidate/'report.json').read_bytes())
    assert old['status'] == new['status'] == 'complete'
    before = [r for r in old['rows'] if r['method'] == args.reference_method]
    assert [r['id'] for r in before] == [r['id'] for r in new['rows']]
    args.output.mkdir(parents=True, exist_ok=False)
    report = {'schema': 'material-fixed-comparison-1', 'scope': __doc__.strip(),
              'inputs': [{'path': str(root/'report.json'), 'sha256': sha(root/'report.json')}
                         for root in [args.reference, args.candidate]],
              'implementationSha256': sha(Path(__file__)), 'rows': [], 'gallery': []}
    size = 240
    for start in range(0, len(before), 4):
        pairs = list(zip(before[start:start+4], new['rows'][start:start+4]))
        sheet = Image.new('RGB', (5*size, 32+len(pairs)*(size+40)), 'white')
        pen = ImageDraw.Draw(sheet)
        for column, title in enumerate(['Fixed crop/photo', 'Previous RGB mask', 'Previous RGB weave', 'Neural mask', 'Neural weave']):
            pen.text((column*size+4, 8), title, fill='black')
        for index, (a, b) in enumerate(pairs):
            assert a['sourceSha256'] == b['sourceSha256']
            assert a.get('selectedCrop') == b.get('selectedCrop')
            photo = image(args.candidate, b, 'crop.png')
            if photo is None:
                source = Path(b['source']); assert sha(source) == b['sourceSha256']
                with Image.open(source) as original:
                    photo = ImageOps.exif_transpose(original).convert('RGB')
            images = [photo, image(args.reference, a, 'mask.png'), image(args.reference, a, 'woven.png'),
                      image(args.candidate, b, 'mask.png'), image(args.candidate, b, 'woven.png')]
            result = {'id': b['id'], 'referenceStatus': a['status'], 'candidateStatus': b['status'],
                      'referenceChecked': bool(a.get('checkedPair')), 'candidateChecked': bool(b.get('checkedPair')),
                      'referenceOwnMaskError': a.get('independentImage', {}).get('mismatchFraction'),
                      'candidateOwnMaskError': b.get('independentImage', {}).get('mismatchFraction')}
            if images[1] is not None and images[3] is not None:
                am, bm = mask(images[1]), mask(images[3]); assert am.shape == bm.shape
                valid = observed(args.reference, a, am.shape)
                assert np.array_equal(valid, observed(args.candidate, b, bm.shape))
                result['targetsDisagreement'] = disagreement(am, bm, valid)
                if images[4] is not None:
                    woven = woven_mask(images[4])
                    # Independently confirm the preview interpretation against
                    # the renderer's own recorded target error before comparison.
                    own_error = disagreement(bm, woven, valid)['fraction']
                    assert abs(own_error-result['candidateOwnMaskError']) < 1e-12
                    result['candidateWeaveToReferenceMask'] = disagreement(am, woven, valid)
            report['rows'].append(result)
            top = 32+index*(size+40)
            errors = [result['referenceOwnMaskError'], result['candidateOwnMaskError']]
            text = ' / '.join('none' if e is None else f'{e:.2%}' for e in errors)
            pen.text((4, top+4), b['id']+' / own-mask errors RGB, NN: '+text, fill='black')
            for column, item in enumerate(images):
                frame = Image.new('RGB', (size, size), (235, 235, 235))
                if item is None:
                    ImageDraw.Draw(frame).text((8, 8), 'Not generated', fill='black')
                else:
                    thumbnail = ImageOps.contain(item, (size, size), Image.Resampling.BILINEAR if column == 0 else Image.Resampling.NEAREST)
                    frame.paste(thumbnail, ((size-thumbnail.width)//2, (size-thumbnail.height)//2))
                sheet.paste(frame, (column*size, top+30))
        filename = f'comparison-{len(report["gallery"])+1}.jpg'
        sheet.save(args.output/filename, quality=90)
        report['gallery'].append({'path': filename, 'sha256': sha(args.output/filename)})
    (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'photos': len(report['rows']), 'galleryPages': len(report['gallery'])}))


if __name__ == '__main__':
    main()
