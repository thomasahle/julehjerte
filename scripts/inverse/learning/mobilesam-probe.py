"""Frozen MobileSAM body proposals from existing predictions, never annotations.

Run with the experiment's isolated Python environment. Inputs are the completed
neural-palette probe and a pinned checkout of the official MobileSAM repository.
This is an offline experiment; it does not add inference to the application.
"""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import subprocess
import sys
import time

import numpy as np
from PIL import Image
from prompted_foreground import automatic_prompts, probability_window

MODEL_COMMIT = 'f706ad9c4eb7f219c00d9050e46328518ffb65d2'
CHECKPOINT_SHA256 = '6dbb90523a35330fedd7f1d3dfc66f995213d81b29a5ca8108dbcdd4e37d6c2f'


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def write(file, value):
    Path(file).write_text(json.dumps(value, indent=2)+'\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--model-source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    started = time.perf_counter()
    source, output = args.model_source.resolve(), args.output.resolve()
    git = lambda *a: subprocess.check_output(['git', '-C', str(source), *a], text=True).strip()
    if git('rev-parse', 'HEAD') != MODEL_COMMIT or git('status', '--porcelain', '--untracked-files=no'):
        raise ValueError('Require the pinned, unmodified MobileSAM checkout')
    checkpoint = source/'weights/mobile_sam.pt'
    if sha(checkpoint) != CHECKPOINT_SHA256:
        raise ValueError('Unexpected MobileSAM checkpoint')
    prior = json.loads(args.input.read_text())
    if prior['status'] != 'complete' or prior['resolution'] != 256:
        raise ValueError('Require a completed 256-pixel frozen prediction probe')
    output.mkdir()  # Never overwrite a previously inspected experiment.
    methods = ['unchanged', 'sam-box', 'sam-box-point']
    scope = ('Development photographs; automatically prompted pretrained segmentation, no annotation, '
             'supplied corners, ROI, retraining or templates. Frozen RGB material estimates are unchanged. '
             'Pretraining overlap with these public photographs is unknown.')
    plan = {
        'schema': 'mobilesam-foreground-plan-1', 'status': 'declared-before-inference',
        'scope': scope, 'inputManifestSha256': sha(args.input), 'cases': len(prior['rows']),
        'modelRepository': 'https://github.com/ChaoningZhang/MobileSAM', 'modelCommit': MODEL_COMMIT,
        'checkpointSha256': CHECKPOINT_SHA256, 'checkpointGitBlob': git('rev-parse', 'HEAD:weights/mobile_sam.pt'),
        'modelSourceSha256': {str(p.relative_to(source)): sha(p) for p in sorted((source/'mobile_sam').rglob('*.py'))},
        'driverSha256': sha(__file__), 'promptHelperSha256': sha(Path(__file__).with_name('prompted_foreground.py')),
        'methods': methods, 'promptRule': 'Largest 8-connected .5 body component inside source; box padded 5% per axis; optional deepest interior point. Ties use first row-major component/pixel.',
        'predictionRule': 'Single mask per prompt (multimask_output=False); no per-photo selection or fallback. Sigmoid of native logits, bilinear sample to frozen 256-pixel window; outside source is zero.',
        'runtime': {'device': 'cpu', 'dtype': 'float32', 'torchThreads': 2, 'torchInteropThreads': 1},
        'dependencies': {p: importlib.metadata.version(p) for p in ['torch', 'torchvision', 'numpy', 'scipy', 'Pillow', 'timm', 'safetensors']},
        'evaluation': ['Replay unchanged control and both SAM arms with the unchanged locator and support gates.',
                       'Inspect every photograph, prompt, mask and proposed crop.',
                       'Report body metrics only on the separately annotated known pixels.',
                       'Do not call crop proposals successful templates; fit only after crop review.'],
    }
    write(output/'plan.json', plan)
    sys.path.insert(0, str(source))
    import torch
    from mobile_sam import SamPredictor, sam_model_registry
    torch.set_num_threads(2); torch.set_num_interop_threads(1)
    model = sam_model_registry['vit_t']()
    model.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True), strict=True)
    model.eval(); predictor = SamPredictor(model)
    manifest = {'schema': 'mobilesam-foreground-probe-1', 'status': 'running', 'scope': scope,
                'resolution': 256, 'methods': methods, 'planSha256': sha(output/'plan.json'),
                'parameterCount': sum(p.numel() for p in model.parameters()),
                'setupSeconds': time.perf_counter()-started, 'rows': []}
    with torch.inference_mode():
        for index, old in enumerate(prior['rows']):
            case_start = time.perf_counter()
            photo = Path(old['file'])
            if sha(photo) != old['photoSha256']:
                raise ValueError('Source photograph changed')
            rgb = np.asarray(Image.open(photo).convert('RGB'))
            if list(rgb.shape[1::-1]) != old['dimensions'] or hashlib.sha256(rgb.tobytes()).hexdigest() != old['decodedRGBSha256']:
                raise ValueError('Source RGB identity changed')
            fields = {}
            for key in ['body', 'material']:
                asset = old['assets']['rgb'][key]; file = args.input.parent/asset['path']
                if sha(file) != asset['sha256']:
                    raise ValueError('Frozen input prediction changed')
                fields[key] = np.fromfile(file, dtype='<f4').reshape(256, 256)
            prompt = automatic_prompts(fields['body'], old['window'], old['dimensions'])
            row = {k: v for k, v in old.items() if k != 'assets'}
            row.update(assets={}, prompt=prompt, timing={}, sam={})
            predictions = {'unchanged': fields['body']}
            if prompt:
                start = time.perf_counter(); predictor.set_image(rgb)
                row['timing']['imageEncodingSeconds'] = time.perf_counter()-start
                arms = methods[1:] if index % 2 == 0 else methods[1:][::-1]
                for method in arms:
                    start = time.perf_counter()
                    kwargs = {'box': np.asarray(prompt['box']), 'multimask_output': False, 'return_logits': True}
                    if method == 'sam-box-point':
                        kwargs.update(point_coords=np.asarray([prompt['point']]), point_labels=np.array([1]))
                    logits, quality, _ = predictor.predict(**kwargs)
                    predictions[method] = probability_window(logits[0], old['window'])
                    row['timing'][method+'DecodeAndSampleSeconds'] = time.perf_counter()-start
                    row['sam'][method] = {'predictedIoU': float(quality[0])}
            else:
                # Explicit failed prompt, not an unchanged-body fallback.
                predictions.update({method: np.zeros((256, 256), np.float32) for method in methods[1:]})
            for method in methods:
                row['assets'][method] = {}
                for key in ['body', 'material']:
                    values = predictions[method] if key == 'body' else fields[key]
                    file = output/(old['id']+'-'+method+'-'+key+'.f32')
                    file.write_bytes(values.astype('<f4').tobytes())
                    row['assets'][method][key] = {'path': file.name, 'sha256': sha(file)}
            row['timing']['caseSecondsBothArmsIncludingIO'] = time.perf_counter()-case_start
            manifest['rows'].append(row); write(output/'manifest.json', manifest)
            print(old['id'], json.dumps(row['timing']), flush=True)
    manifest.update(status='complete', totalSeconds=time.perf_counter()-started)
    write(output/'manifest.json', manifest)


if __name__ == '__main__':
    main()
