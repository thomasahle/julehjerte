"""Frozen upstream saliency baseline on an existing, fixed photo cohort.

Use the publisher's own input transforms and checkpoint. No heart fine-tuning,
per-photo prompts or threshold selection; scores are saliency, not calibrated
paper probabilities. This native experiment is not a browser release.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import time

import numpy as np
from PIL import Image, ImageOps
import torch

from data import digest


def checked(asset):
    file = Path(asset['path'])
    if digest(file.read_bytes()) != asset['sha256']: raise ValueError('Changed input: '+str(file))
    return file


def module(file, name):
    spec = importlib.util.spec_from_file_location(name, file)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(); plan = json.loads(args.plan.read_bytes())
    assert plan['schema'] == 'u2netp-probe-plan-1'
    source_file = checked(plan['source']); source = json.loads(source_file.read_bytes()); root = source_file.parent
    for row in source['files']: checked({'path': str(root/row['path']), 'sha256': row['sha256']})
    checkpoint = checked(plan['checkpoint'])
    selected = json.loads(checked(plan['selection']).read_bytes())
    control = json.loads(checked(plan['control']).read_bytes())
    assert control['status'] == 'complete'
    assert [r['id'] for r in control['rows'] if r['method'] == 'production'] == [r['id'] for r in selected['photos']]
    torch.set_num_threads(1); torch.set_num_interop_threads(1)
    import skimage
    assert skimage.__version__ == plan['protocol']['skimage']
    architecture = module(root/'model/u2net.py', 'upstream_u2net')
    loader = module(root/'data_loader.py', 'upstream_u2net_data')
    model = architecture.U2NETP(3, 1).eval()
    model.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True), strict=True)
    resolution = plan['protocol']['resolution']; assert resolution == 320
    rescale = loader.RescaleT(resolution); normalize = loader.ToTensorLab(flag=0)
    args.output.mkdir(parents=True, exist_ok=False)
    result = {'schema': 'u2netp-probe-result-1', 'status': 'running',
              'plan': {'path': str(args.plan), 'sha256': digest(args.plan.read_bytes())},
              'parameters': sum(p.numel() for p in model.parameters()), 'checkpointSha256': plan['checkpoint']['sha256'],
              'sourceSha256': digest(Path(__file__).read_bytes()),
              'runtime': {'torch': torch.__version__, 'skimage': skimage.__version__, 'threads': 1},
              'rows': [], 'scope': plan['scope']}
    probe = {'schema': 'woven-heart-foreground-probe-1', 'status': 'running', 'resolution': resolution,
             'fieldOrigin': {'kind': 'frozen-upstream-saliency', 'checkpointSha256': plan['checkpoint']['sha256']},
             'rows': [], 'scope': plan['scope']}
    def save():
        (args.output/'report.json').write_text(json.dumps(result, indent=2)+'\n')
        (args.output/'manifest.json').write_text(json.dumps(probe, indent=2)+'\n')
    save()
    try:
        with torch.no_grad():
            for selected_row in selected['photos']:
                identity = selected_row['id']; file = checked({'path': selected_row['file'], 'sha256': selected_row['imageSha256']})
                with Image.open(file) as original: image = ImageOps.exif_transpose(original).convert('RGB')
                assert list(image.size) == selected_row['dimensions'] and image.width*image.height <= 24e6
                pixels = np.asarray(image); assert digest(pixels.tobytes()) == selected_row['decodedRGBSha256']
                started = time.perf_counter()
                sample = rescale({'image': pixels, 'label': np.zeros((image.height, image.width, 1), dtype=np.uint8), 'imidx': np.array([0])})
                tensor = normalize(sample)['image'].float()[None].contiguous()
                assert torch.isfinite(tensor).all()
                preprocess = time.perf_counter()-started
                started = time.perf_counter(); raw = model(tensor)[0][0, 0].numpy(); seconds = time.perf_counter()-started
                assert raw.shape == (resolution, resolution) and np.isfinite(raw).all()
                low, high = float(raw.min()), float(raw.max())
                # Exact publisher postprocessing, with an explicit constant-map fallback.
                score = (raw-low)/(high-low) if high > low else np.zeros_like(raw)
                target = args.output/(identity+'-saliency.f32'); target.write_bytes(score.astype('<f4').tobytes())
                assets = {'probability.f32': {'path': target.name, 'sha256': digest(target.read_bytes())}}
                probe['rows'].append({'id': identity, 'caseId': identity, 'group': 'real', 'file': str(file),
                    'photoSha256': selected_row['imageSha256'], 'dimensions': list(image.size),
                    'decodedRGBSha256': selected_row['decodedRGBSha256'], 'window': [0, 0, image.width, image.height],
                    'inferenceSeconds': seconds, 'assets': assets})
                result['rows'].append({'id': identity, 'inputSha256': digest(tensor.numpy().astype('<f4').tobytes()),
                    'preprocessSeconds': preprocess, 'inferenceSeconds': seconds, 'rawScoreRange': [low, high],
                    'foregroundFractionAtHalf': float(np.mean(score > .5))})
                save(); print(identity, seconds, flush=True)
        probe['status'] = result['status'] = 'complete'
        result['medianInferenceSeconds'] = float(np.median([r['inferenceSeconds'] for r in result['rows']]))
        save()
        result['artifacts'] = {p.name: digest(p.read_bytes()) for p in args.output.iterdir() if p.is_file() and p.name != 'report.json'}
        result['artifactBytes'] = sum(p.stat().st_size for p in args.output.iterdir() if p.is_file())
        assert result['artifactBytes'] < plan['resources']['maxProbeMiB']*1024**2
        save(); print(json.dumps({'status': result['status'], 'medianInferenceSeconds': result['medianInferenceSeconds'], 'parameters': result['parameters']}))
    except Exception as error:
        result.update(status='failed', error=str(error)); save(); raise


if __name__ == '__main__': main()
