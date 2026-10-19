"""Export one audited candidate and evaluate its fixed source-held-out photo list.

Original JPEGs stay in place; only small inputs and probability fields are saved.
No crop, mask or template result can select an image or checkpoint.
"""
import argparse
import json
from pathlib import Path
import time

import numpy as np
from PIL import Image, ImageOps
import torch

from data import digest
from preserved_candidate import load_candidate, pinned, source_separation
from real_annotations import photo_tensor


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_bytes())
    assert plan['schema'] == 'preserved-candidate-runtime-plan-1'
    audit = json.loads(pinned(plan['audit']).read_bytes())
    assert audit['passed'] and audit['status'] == 'complete'
    for file, expected in audit['sourceHashes'].items(): pinned({'path': file, 'sha256': expected})
    training_path = pinned(audit['candidateReport'])
    model, foreground, training = load_candidate(training_path.parent)
    assert audit['checkpointSha256'] == training['checkpointSha256']
    training_plan = json.loads(pinned(training['plan']).read_bytes())
    evaluation_path = pinned(training_plan['evaluation'])
    evaluation = json.loads(evaluation_path.read_bytes())
    labels = json.loads(pinned(training_plan['labelCatalog']).read_bytes())
    catalog = json.loads(pinned(training_plan['sourceManifest']).read_bytes())
    separation = source_separation(labels['instances'], evaluation['photos'], catalog)
    assert separation == audit['sourceSeparation']
    protocol = plan['protocol']
    assert protocol['threads'] == 1 and protocol['inputShape'] == [1, 3, 256, 256]
    torch.set_num_threads(1); torch.set_num_interop_threads(1)
    import onnx
    import onnxruntime as ort
    assert onnx.__version__ == protocol['onnx'] and ort.__version__ == protocol['onnxruntime']
    package = torch.nn.Sequential(model, torch.nn.Sigmoid()).eval()
    args.output.mkdir(parents=True, exist_ok=False)
    (args.output/'probe').mkdir()
    file = args.output/'model.onnx'
    with torch.no_grad():
        torch.onnx.export(package, torch.zeros(1, 3, 256, 256), str(file), input_names=['rgb'],
                          output_names=['probabilities'], opset_version=protocol['opset'], dynamo=False)
    graph = onnx.load(file); onnx.checker.check_model(graph, full_check=True)
    assert not any(t.data_location == onnx.TensorProto.EXTERNAL for t in graph.graph.initializer)
    options = ort.SessionOptions(); options.intra_op_num_threads = 1; options.inter_op_num_threads = 1
    started = time.perf_counter()
    session = ort.InferenceSession(str(file), sess_options=options, providers=['CPUExecutionProvider'])
    startup = 1000*(time.perf_counter()-started)
    assert session.get_providers() == ['CPUExecutionProvider']
    result = {'schema': 'preserved-candidate-probe-1', 'status': 'running',
              'plan': {'path': str(args.plan), 'sha256': digest(args.plan.read_bytes())},
              'evaluation': training_plan['evaluation'], 'training': audit['candidateReport'],
              'sourceSeparation': separation, 'parameters': training['parameters'],
              'onnx': {'path': file.name, 'sha256': digest(file.read_bytes()), 'bytes': file.stat().st_size},
              'runtime': {'torch': torch.__version__, 'onnx': onnx.__version__, 'onnxruntime': ort.__version__,
                          'threads': 1, 'sessionStartupMilliseconds': startup},
              'sourceHashes': {str(p): digest(p.read_bytes()) for p in [Path(__file__), Path(__file__).parents[1]/'datasets/real_annotations.py']},
              'photos': [], 'scope': 'One frozen candidate on the separately selected source-held-out sample. No fitted result or annotation is used.'}
    manifest = {'schema': 'preserved-candidate-fields-1', 'status': 'running', 'methods': ['torch', 'onnx'], 'rows': [],
                'evaluation': training_plan['evaluation'], 'training': audit['candidateReport']}
    def save():
        (args.output/'report.json').write_text(json.dumps(result, indent=2)+'\n')
        (args.output/'probe/manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    save()
    try:
        for selected in evaluation['photos']:
            photo_path = pinned({'path': selected['file'], 'sha256': selected['imageSha256']})
            with Image.open(photo_path) as original: photo = ImageOps.exif_transpose(original).convert('RGB')
            width, height = photo.size
            assert list(photo.size) == selected['dimensions'] and width*height <= 24e6
            assert digest(photo.tobytes()) == selected['decodedRGBSha256']
            scale = 256/max(width, height); ox, oy = (256-width*scale)/2, (256-height*scale)/2
            transform = {'resolution': 256, 'scale': scale, 'offset': [ox, oy]}
            rgb = np.asarray(photo_tensor(photo, transform)).copy()
            tensor = torch.from_numpy(rgb.transpose(2, 0, 1).copy()).float()[None]/255
            with torch.no_grad():
                logits = model(tensor)
                assert torch.equal(logits[:, :1], foreground(tensor))
                expected = logits.sigmoid().numpy()[0]
            started = time.perf_counter()
            actual = session.run(['probabilities'], {'rgb': tensor.numpy()})[0][0]
            elapsed = 1000*(time.perf_counter()-started)
            assert expected.shape == actual.shape == (2, 256, 256) and np.isfinite(actual).all()
            assert ((actual >= 0) & (actual <= 1)).all()
            identity = selected['id']; image_file = args.output/'probe'/(identity+'-rgb.png')
            Image.fromarray(rgb).save(image_file)
            row = {**selected, 'photoSha256': selected['imageSha256'], 'originalPhotoSha256': selected['imageSha256'],
                   'window': [-ox/scale, -oy/scale, (256-ox)/scale, (256-oy)/scale], 'transform': transform,
                   'inputRgbSha256': digest(rgb.tobytes()), 'inputTensorSha256': digest(tensor.numpy().astype('<f4').tobytes()),
                   'rgb': {'path': image_file.name, 'sha256': digest(image_file.read_bytes())}, 'assets': {}}
            heads = []
            for channel, head in enumerate(['body', 'material']):
                heads.append({'head': head, 'maxAbsoluteDifference': float(np.abs(actual[channel]-expected[channel]).max()),
                              'changedHalfThresholdPixels': int(np.count_nonzero((actual[channel] >= .5) != (expected[channel] >= .5)))})
                for method, values in [('torch', expected), ('onnx', actual)]:
                    field = args.output/'probe'/(identity+'-'+method+'-'+head+'.f32')
                    field.write_bytes(values[channel].astype('<f4').tobytes())
                    row['assets'].setdefault(method, {})[head] = {'path': field.name, 'sha256': digest(field.read_bytes())}
            manifest['rows'].append(row)
            result['photos'].append({'id': identity, 'heads': heads, 'milliseconds': elapsed, 'foregroundLogitsExact': True})
            save()
        result['checks'] = {'allPhotos': len(result['photos']) == len(evaluation['photos']),
                            'foregroundExact': all(r['foregroundLogitsExact'] for r in result['photos']),
                            'probabilityParity': all(h['maxAbsoluteDifference'] <= protocol['probabilityAtol'] for r in result['photos'] for h in r['heads']),
                            'halfThresholdParity': all(h['changedHalfThresholdPixels'] == 0 for r in result['photos'] for h in r['heads'])}
        manifest['status'] = result['status'] = 'complete'; result['passed'] = all(result['checks'].values())
        save()
        result['artifacts'] = {str(p.relative_to(args.output)): digest(p.read_bytes()) for p in args.output.rglob('*') if p.is_file() and p.name != 'report.json'}
        result['artifactBytes'] = sum(p.stat().st_size for p in args.output.rglob('*') if p.is_file())
        assert result['artifactBytes'] <= plan['resources']['nativeMaxArtifactMiB']*1024**2
        save(); print(json.dumps({k: result[k] for k in ['passed', 'checks', 'onnx', 'artifactBytes']}))
    except Exception as error:
        result.update(status='failed', error=str(error)); save(); raise
    if not result['passed']: raise SystemExit('Native export parity gate failed; all cases are retained.')


if __name__ == '__main__': main()
