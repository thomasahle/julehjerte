"""Export frozen body/paper predictions for a predeclared full-photo cohort.

No annotation, crop, motif-family assignment or fitted template is an input.
The output is consumed by mobilesam-probe.py and the geometric replay tools.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

import numpy as np
from PIL import Image, ImageOps

from palette_calibration import calibrate

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT/'scripts/inverse/datasets'))
from real_annotations import photo_tensor


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2)+'\n')


def source_photo(source, root=ROOT):
    path = (root/source['localPath']).resolve()
    if not path.is_relative_to(root.resolve()) or sha(path) != source['sha256']:
        raise ValueError('Source file changed or escapes the workspace')
    with Image.open(path) as original:
        photo = ImageOps.exif_transpose(original).convert('RGB')
    if photo.size != (source['width'], source['height']):
        raise ValueError('Source dimensions changed')
    if hashlib.sha256(photo.tobytes()).hexdigest() != source['decodedPixelsSha256']:
        raise ValueError('Decoded source RGB changed')
    return photo


def letterbox(photo, resolution=256):
    width, height = photo.size
    scale = resolution/max(width, height)
    ox, oy = (resolution-width*scale)/2, (resolution-height*scale)/2
    transform = {'resolution': resolution, 'scale': scale, 'offset': [ox, oy]}
    rgb = np.asarray(photo_tensor(photo, transform)).copy()
    yy, xx = np.mgrid[:resolution, :resolution]
    valid = ((xx+.5 >= ox) & (xx+.5 < ox+scale*width) &
             (yy+.5 >= oy) & (yy+.5 < oy+scale*height))
    window = [-ox/scale, -oy/scale, (resolution-ox)/scale, (resolution-oy)/scale]
    return rgb, valid, transform, window


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    plan = read(args.plan)
    selection, frontend = plan['selection'], plan['frontend']
    catalog = ROOT/selection['manifest']
    if sha(catalog) != selection['manifestSha256']:
        raise ValueError('Selected source catalog changed')
    sources = {row['id']: row for row in read(catalog)['assets']}
    ids = selection['selectedIds']
    if len(ids) != len(set(ids)) or len(ids) != selection['selectedPhotos']:
        raise ValueError('Invalid selected cohort')
    training_report, checkpoint = ROOT/frontend['report'], ROOT/frontend['checkpoint']
    if sha(training_report) != frontend['reportSha256'] or sha(checkpoint) != frontend['checkpointSha256']:
        raise ValueError('Frozen model changed')
    run = read(training_report)['runs'][frontend['fold']]
    if run['checkpointSha256'] != sha(checkpoint) or sorted(run['trainIds']) != sorted(frontend['realTrainIds']):
        raise ValueError('Checkpoint training provenance changed')
    # Use only asset identities to verify grouping. Never open annotation files.
    known = [sources[identity] for identity in selection['knownAnnotationAssets']]
    for identity in ids:
        row = sources[identity]
        if not row.get('qaReserved'):
            raise ValueError('Evaluation source is not reserved')
        for key in ['splitGroupId', 'nearDuplicateGroup']:
            if row[key] in {other[key] for other in known}:
                raise ValueError('Evaluation source overlaps known annotation sources')
    args.output.mkdir(parents=True, exist_ok=False)
    pins = {str(path): sha(path) for path in [args.plan, catalog, checkpoint, training_report]}
    for directory in [ROOT/'scripts/inverse/learning', ROOT/'scripts/inverse/datasets']:
        pins.update({str(path): sha(path) for path in directory.glob('*.py')})
    write(args.output/'sources.json', pins)
    started = time.perf_counter()
    import torch
    from foreground import load_foreground_run
    from material_transfer import material_from_foreground
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    original, _ = load_foreground_run(ROOT/frontend['initialRun'])
    model = material_from_foreground(original)
    model.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True), strict=True)
    model.eval()
    result = {'schema': 'woven-heart-material-probe-1', 'status': 'running',
              'resolution': 256, 'scope': plan['scope'], 'planSha256': sha(args.plan),
              'checkpointSha256': sha(checkpoint), 'rows': [],
              'parameterCount': sum(p.numel() for p in model.parameters()),
              'setupSeconds': time.perf_counter()-started}
    with torch.inference_mode():
        for identity in ids:
            began = time.perf_counter()
            source = sources[identity]
            photo = source_photo(source)
            rgb, valid, transform, window = letterbox(photo)
            prepared = time.perf_counter()
            tensor = torch.from_numpy(np.ascontiguousarray(rgb.transpose(2, 0, 1))[None]).float()/255
            prediction = model(tensor).sigmoid().numpy()[0]
            inferred = time.perf_counter()
            material, evidence = calibrate(rgb, prediction[0], prediction[1], valid,
                                           palette='rgb', mode='illumination')
            calibrated = time.perf_counter()
            path = args.output/(identity+'-source.png')
            photo.save(path)
            row = {'id': identity, 'file': str(path.resolve()), 'photoSha256': sha(path),
                   'originalPhotoSha256': source['sha256'],
                   'decodedRGBSha256': hashlib.sha256(photo.tobytes()).hexdigest(),
                   'dimensions': list(photo.size), 'window': window, 'transform': transform,
                   'calibration': evidence, 'assets': {},
                   'timing': {'prepareSeconds': prepared-began, 'networkSeconds': inferred-prepared,
                              'calibrationSeconds': calibrated-inferred}}
            Image.fromarray(rgb).save(args.output/(identity+'-input.png'))
            for method, values in [('network', prediction), ('rgb', [prediction[0], material])]:
                row['assets'][method] = {}
                for key, value in zip(['body', 'material'], values):
                    file = args.output/(identity+'-'+method+'-'+key+'.f32')
                    file.write_bytes(value.astype('<f4').tobytes())
                    row['assets'][method][key] = {'path': file.name, 'sha256': sha(file)}
            row['timing']['caseSecondsIncludingIO'] = time.perf_counter()-began
            result['rows'].append(row)
            write(args.output/'manifest.json', result)
            print(identity, json.dumps(row['timing']), 'calibration', evidence['applied'], flush=True)
    for path, expected in pins.items():
        if sha(path) != expected:
            raise ValueError('Pinned input or implementation changed: '+path)
    result.update(status='complete', totalSeconds=time.perf_counter()-started)
    write(args.output/'manifest.json', result)


if __name__ == '__main__':
    main()
