"""Export the fixed saliency baseline and compare against its saved native fields."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import time
import numpy as np
from PIL import Image, ImageOps
import torch
from data import digest


def checked(asset):
    file = Path(asset['path'])
    assert digest(file.read_bytes()) == asset['sha256'], str(file)
    return file


def module(file, name):
    spec = importlib.util.spec_from_file_location(name, file)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result


class Saliency(torch.nn.Module):
    def __init__(self, model):
        super().__init__(); self.model = model

    def forward(self, rgb):
        raw = self.model(rgb)[0]
        low, high = raw.amin(), raw.amax()
        return (raw-low)/torch.clamp(high-low, min=1e-12)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(); plan = json.loads(args.plan.read_bytes())
    assert plan['schema'] == 'u2netp-runtime-plan-1'
    probe_file = checked(plan['probe']); probe = json.loads(probe_file.read_bytes())
    assert probe['status'] == 'complete'
    original_plan = json.loads(checked(probe['plan']).read_bytes())
    source_file = checked(original_plan['source']); source = json.loads(source_file.read_bytes()); root = source_file.parent
    for row in source['files']: checked({'path': str(root/row['path']), 'sha256': row['sha256']})
    checkpoint = checked(original_plan['checkpoint'])
    manifest_file = checked(plan['probeManifest']); manifest = json.loads(manifest_file.read_bytes())
    assert manifest['status'] == 'complete'
    assert [r['id'] for r in probe['rows']] == [r['id'] for r in manifest['rows']]
    protocol = plan['protocol']; assert protocol['threads'] == 1 and protocol['inputShape'] == [1, 3, 320, 320]
    torch.set_num_threads(1); torch.set_num_interop_threads(1)
    import onnx
    import onnxruntime as ort
    import skimage
    assert onnx.__version__ == protocol['onnx'] and ort.__version__ == protocol['onnxruntime']
    assert skimage.__version__ == original_plan['protocol']['skimage']
    loader = module(root/'data_loader.py', 'u2netp_loader')
    rescale, normalize = loader.RescaleT(320), loader.ToTensorLab(flag=0)
    args.output.mkdir(parents=True, exist_ok=False)
    file = args.output/'model.onnx'
    if 'reuseModel' in plan:
        os.link(checked(plan['reuseModel']), file)
    else:
        model = module(root/'model/u2net.py', 'u2netp_architecture').U2NETP(3, 1).eval()
        model.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True), strict=True)
        with torch.no_grad():
            torch.onnx.export(Saliency(model).eval(), torch.zeros(1, 3, 320, 320), str(file),
                              input_names=['rgb'], output_names=['saliency'], opset_version=protocol['opset'], dynamo=False)
    graph = onnx.load(file); onnx.checker.check_model(graph, full_check=True)
    assert not any(t.data_location == onnx.TensorProto.EXTERNAL for t in graph.graph.initializer)
    options = ort.SessionOptions(); options.intra_op_num_threads = options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(file), sess_options=options, providers=['CPUExecutionProvider'])
    result = {'schema': 'u2netp-export-1', 'status': 'running',
              'plan': {'path': str(args.plan), 'sha256': digest(args.plan.read_bytes())},
              'sourceSha256': digest(Path(__file__).read_bytes()), 'rows': [],
              'onnx': {'path': file.name, 'sha256': digest(file.read_bytes()), 'bytes': file.stat().st_size},
              'runtime': {'onnx': onnx.__version__, 'onnxruntime': ort.__version__, 'torch': torch.__version__, 'threads': 1}}
    if 'reuseModel' in plan: result['reusedModel'] = plan['reuseModel']
    def save(): (args.output/'report.json').write_text(json.dumps(result, indent=2)+'\n')
    save()
    try:
        for row, native in zip(manifest['rows'], probe['rows']):
            photo = checked({'path': row['file'], 'sha256': row['photoSha256']})
            with Image.open(photo) as opened: image = ImageOps.exif_transpose(opened).convert('RGB')
            assert list(image.size) == row['dimensions'] and digest(image.tobytes()) == row['decodedRGBSha256']
            sample = rescale({'image': np.asarray(image), 'label': np.zeros((image.height, image.width, 1), dtype=np.uint8), 'imidx': np.array([0])})
            tensor = normalize(sample)['image'].float()[None].contiguous().numpy()
            assert digest(tensor.astype('<f4').tobytes()) == native['inputSha256']
            field = row['assets']['probability.f32']; reference_file = checked({'path': str(manifest_file.parent/field['path']), 'sha256': field['sha256']})
            expected = np.frombuffer(reference_file.read_bytes(), dtype='<f4').reshape(320, 320)
            started = time.perf_counter(); actual = session.run(['saliency'], {'rgb': tensor})[0][0, 0]; seconds = time.perf_counter()-started
            assert actual.shape == expected.shape and np.isfinite(actual).all() and ((actual >= 0) & (actual <= 1)).all()
            assets = {}
            for suffix, value in [('input', tensor), ('saliency', actual)]:
                target = args.output/(row['id']+'-'+suffix+'.f32'); target.write_bytes(value.astype('<f4').tobytes())
                assets[suffix] = {'path': target.name, 'sha256': digest(target.read_bytes())}
            difference = {'maxAbsoluteDifference': float(np.max(np.abs(actual-expected))),
                          'changedHalfThresholdPixels': int(np.count_nonzero((actual > .5) != (expected > .5)))}
            result['rows'].append({'id': row['id'], 'inferenceSeconds': seconds, 'vsTorch': difference, 'assets': assets})
            save(); print(row['id'], difference, flush=True)
        result['checks'] = {'probabilityParity': all(r['vsTorch']['maxAbsoluteDifference'] <= protocol['probabilityAtol'] for r in result['rows']),
                            'halfThresholdParity': all(r['vsTorch']['changedHalfThresholdPixels'] == 0 for r in result['rows'])}
        result['passed'] = all(result['checks'].values()); result['status'] = 'complete'
        result['artifactBytes'] = sum(p.stat().st_size for p in args.output.iterdir() if p.is_file())
        assert result['artifactBytes'] < plan['resources']['nativeMaxArtifactMiB']*1024**2
        save(); print(json.dumps({'passed': result['passed'], 'checks': result['checks'], 'onnx': result['onnx']}))
    except Exception as error:
        result.update(status='failed', error=str(error)); save(); raise


if __name__ == '__main__': main()
