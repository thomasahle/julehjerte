"""Side-by-side review of every fixed paired-training and development photo."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps

from data import digest
from preserved_candidate import pinned


def read_report(directory):
    path = directory/'report.json'; raw = path.read_bytes(); report = json.loads(raw)
    if report['status'] != 'complete':
        raise ValueError('Require completed experiment')
    return report, {'path': str(path), 'sha256': digest(raw)}


def read_field(directory, asset):
    path = directory/asset['path']
    if not path.resolve().is_relative_to(directory.resolve()):
        raise ValueError('Field outside probe directory')
    pinned({'path': str(path), 'sha256': asset['sha256']})
    return np.fromfile(path, dtype='<f4').reshape(320, 320)


def panels(rows, output, prefix):
    records = []; colours = np.array([[255, 130, 0], [0, 200, 255]], np.uint8)
    for start in range(0, len(rows), 4):
        selected = rows[start:start+4]; n = 320
        sheet = Image.new('RGB', (n*4, len(selected)*(n+32)), 'white'); pen = ImageDraw.Draw(sheet)
        for j, row in enumerate(selected):
            pinned({'path': row['file'], 'sha256': row['photoSha256']})
            with Image.open(row['file']) as image:
                photo = ImageOps.exif_transpose(image).convert('RGB').resize((n, n), Image.Resampling.BILINEAR)
            body = row['body']; images = [photo, Image.fromarray(np.uint8(body*255))]
            for key, flip in [('control', row['controlFlip']), ('candidate', row['candidateFlip'])]:
                labels = (row[key] >= .5) ^ flip
                rgb = np.full((n, n, 3), 130, np.uint8); known = body >= .5
                rgb[known] = colours[labels[known].astype(int)]
                images.append(Image.fromarray(rgb))
            for column, image in enumerate(images):
                sheet.paste(image, (column*n, j*(n+32)))
            pen.text((4, j*(n+32)+n+2), row['id'], fill='black')
            pen.text((4, j*(n+32)+n+16), 'Photo / unchanged body / supervised control / paired consistency', fill='black')
        file = output/(prefix+'-'+str(start//4+1)+'.jpg'); sheet.save(file, quality=90)
        records.append({'path': file.name, 'sha256': digest(file.read_bytes()), 'ids': [r['id'] for r in selected]})
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['control', 'candidate', 'control-probe', 'candidate-probe', 'output']:
        parser.add_argument('--'+name, type=Path, required=True)
    args = parser.parse_args()
    control, c_ref = read_report(args.control); candidate, n_ref = read_report(args.candidate)
    if candidate['pairedControl'] != c_ref:
        raise ValueError('Candidate does not use this matched control')
    probes = [read_report(args.control_probe), read_report(args.candidate_probe)]
    for (probe, _), reference in zip(probes, [c_ref, n_ref]):
        if probe['training'] != reference:
            raise ValueError('Probe belongs to another checkpoint')
    archives = []
    for directory, report in [(args.control, control), (args.candidate, candidate)]:
        file = directory/'training-predictions.npz'
        pinned({'path': str(file), 'sha256': report['artifacts'][file.name]})
        archives.append(np.load(file))
    left, right = archives
    if not np.array_equal(left['ids'], right['ids']) or not np.array_equal(left['body'], right['body']):
        raise ValueError('Training cohort or body changed')
    if not np.array_equal(left['initial'], right['initial']):
        raise ValueError('Initial material fields changed')
    inputs = {r['id']: r for r in control['trainingInputs']}
    training = []
    for index, identity in enumerate(left['ids']):
        source = inputs[identity]
        first, second = control['trainingMetrics']['final']['rows'][index], candidate['trainingMetrics']['final']['rows'][index]
        if first['id'] != identity or second['id'] != identity:
            raise ValueError('Training metrics are misaligned')
        training.append({'id': str(identity), 'file': source['photo'], 'photoSha256': source['photoSha256'],
            'body': left['body'][index], 'control': left['final'][index], 'candidate': right['final'][index],
            'controlFlip': first['materialPhaseExchanged'], 'candidateFlip': second['materialPhaseExchanged']})
    c_probe, n_probe = probes[0][0], probes[1][0]
    if [r['id'] for r in c_probe['rows']] != [r['id'] for r in n_probe['rows']]:
        raise ValueError('Development cohort changed')
    development = []
    for first, second in zip(c_probe['rows'], n_probe['rows']):
        for key in ['file', 'photoSha256', 'decodedRGBSha256', 'inputSha256']:
            if first[key] != second[key]:
                raise ValueError('Development image input differs')
        body = read_field(args.control_probe, first['assets']['body'])
        other_body = read_field(args.candidate_probe, second['assets']['body'])
        if not np.array_equal(body, other_body):
            raise ValueError('Body changed between paired models')
        a, b = read_field(args.control_probe, first['assets']['material']), read_field(args.candidate_probe, second['assets']['material'])
        known = body >= .5
        flip = bool(np.mean((a[known] >= .5) != (b[known] >= .5)) > .5) if known.any() else False
        development.append({'id': first['id'], 'file': first['file'], 'photoSha256': first['photoSha256'],
            'body': body, 'control': a, 'candidate': b, 'controlFlip': False, 'candidateFlip': flip})
    args.output.mkdir(parents=True, exist_ok=False)
    report = {'schema': 'paired-material-gallery-1', 'status': 'complete',
        'implementationSha256': digest(Path(__file__).read_bytes()),
        'control': c_ref, 'candidate': n_ref, 'controlProbe': probes[0][1], 'candidateProbe': probes[1][1],
        'trainingCount': len(training), 'developmentCount': len(development),
        'scope': 'All 16 training and 32 already-inspected source-separated development photos. Both binary proposals use the same frozen predicted body, shown separately; omitted paper remains a body failure. Training display uses target-based phases. Development candidate can swap labels once solely for visual comparison, not fitting or scoring. No original-artwork accuracy claim.',
        'training': panels(training, args.output, 'training'),
        'development': panels(development, args.output, 'development'),
        'displayPhases': [{'id': r['id'], 'candidateFlip': r['candidateFlip']} for r in development]}
    (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'trainingPhotos': len(training), 'developmentPhotos': len(development)}))


if __name__ == '__main__':
    main()
