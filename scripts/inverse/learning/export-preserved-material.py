"""Audit and export the preserved foreground/material network, without retraining."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import platform
import time

import numpy as np
from PIL import Image
import torch

from foreground import load_foreground_run
from preserved_material import PreservedForegroundMaterialNet
from real_materials_learning import MaterialNet
from real_foreground import check_current_training_sources
from real_annotations import photo_tensor


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_bytes())


def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2)+'\n')


def pinned(entry):
    path = Path(entry['path'])
    assert sha(path) == entry['sha256'], str(path)
    return path


def differences(actual, expected):
    assert actual.shape == expected.shape and actual.shape[-3] == 2
    assert np.isfinite(actual).all() and np.isfinite(expected).all()
    assert ((actual >= 0) & (actual <= 1)).all()
    return [{'head': name, 'maxAbsoluteDifference': float(np.max(np.abs(actual[..., c, :, :]-expected[..., c, :, :]))),
             'changedHalfThresholdPixels': int(np.count_nonzero((actual[..., c, :, :] >= .5) != (expected[..., c, :, :] >= .5)))}
            for c, name in enumerate(['body', 'material'])]


def timing(fn, protocol):
    for _ in range(protocol['warmupRuns']): fn()
    values = []
    for _ in range(protocol['timingRuns']):
        start = time.perf_counter(); fn(); values.append(1000*(time.perf_counter()-start))
    return {'medianMilliseconds': float(np.median(values)), 'p90Milliseconds': float(np.percentile(values, 90)),
            'runs': len(values)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    plan = read(args.plan); assert plan['schema'] == 'preserved-material-onnx-plan-1'
    protocol = plan['protocol']
    assert protocol['inputShape'] == [1, 3, 256, 256] and protocol['threshold'] == .5
    torch.set_num_threads(protocol['threads']); torch.set_num_interop_threads(1)
    import onnx
    import onnxruntime as ort
    assert onnx.__version__ == protocol['onnx'] and ort.__version__ == protocol['onnxruntime']
    paths = {key: pinned(plan[key]) for key in ['training', 'audit', 'foreground', 'sourceManifest', 'probe']}
    training, audit = read(paths['training']), read(paths['audit'])
    assert training['status'] == audit['status'] == 'complete'
    assert audit['trainingReportSha256'] == plan['training']['sha256']
    for file, digest in {**training['sourceHashes'], **training['inputPins']}.items():
        assert sha(file) == digest, file
    probe = read(paths['probe']); assert probe['status'] == 'complete'
    assert [row['id'] for row in probe['rows']] == plan['ids']
    rows = {row['id']: row for row in probe['rows']}
    labels = {}
    for entry in training['labelAudits']:
        root = Path(entry['directory']); label_manifest = read(root/'manifest.json')
        check_current_training_sources(label_manifest['instances'], paths['sourceManifest'])
        for row in label_manifest['instances']:
            assert row['id'] not in labels
            labels[row['id']] = (root, row)
    assert set(rows) == set(labels)
    rgb, archived = {}, {}
    for identity, row in rows.items():
        root, label = labels[identity]
        file = pinned({'path': str(root/label['assets']['rgb']['path']), 'sha256': label['assets']['rgb']['sha256']})
        pixels = np.array(Image.open(file).convert('RGB'))
        assert sha(row['file']) == row['photoSha256']
        with Image.open(row['file']) as photo:
            assert list(photo.size) == row['dimensions']
            assert hashlib.sha256(np.array(photo.convert('RGB')).tobytes()).hexdigest() == row['decodedRGBSha256']
            np.testing.assert_array_equal(np.array(photo_tensor(photo, label['transform'])), pixels)
        rgb[identity] = torch.from_numpy(pixels.transpose(2, 0, 1).copy()).float()/255
        fields = []
        for name in ['body', 'material']:
            asset = row['assets']['preserved-body'][name]
            file = pinned({'path': str(paths['probe'].parent/asset['path']), 'sha256': asset['sha256']})
            fields.append(np.fromfile(file, dtype='<f4').reshape(256, 256))
        archived[identity] = np.stack(fields)
    body, body_report = load_foreground_run(paths['foreground'].parent)
    assert body_report['checkpointSha256'] == training['initialization']['parentCheckpointSha256']
    assert plan['foreground']['sha256'] == training['initialization']['parentReportSha256']
    args.output.mkdir(parents=True, exist_ok=False)
    out_probe = args.output/'probe'; out_probe.mkdir()
    result = {'schema': 'preserved-material-onnx-result-1', 'status': 'running',
              'plan': {'path': str(args.plan), 'sha256': sha(args.plan)}, 'folds': [],
              'runtime': {'torch': torch.__version__, 'onnx': onnx.__version__, 'onnxruntime': ort.__version__,
                          'python': platform.python_version(), 'platform': platform.platform(), 'threads': protocol['threads']},
              'sourceHashes': {str(p): sha(p) for p in [Path(__file__), Path(__file__).with_name('preserved_material.py')]},
              'limitations': plan['limitations']}
    checked = set(); checks = []
    for fold in training['folds']:
        name = fold['id']; entry = training['runs'][name]; ids = fold['heldOut']
        assert entry['heldOutIds'] == ids and entry['trainIds'] == fold['train']
        assert not (set(fold['train']) & set(ids)) and not (checked & set(ids))
        checked.update(ids)
        verified = next(r for r in audit['checkedRuns'] if r['run'] == name)
        assert verified['sourceSeparationPassed'] and verified['frozenParametersAndAllBuffersIdentical']
        checkpoint = paths['training'].parent/name/'model.pt'
        assert sha(checkpoint) == entry['checkpointSha256']
        material = MaterialNet().eval()
        material.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True), strict=True)
        model = PreservedForegroundMaterialNet(body, material, protocol['sharedPrefixBlocks']).eval()
        # Match the archived batch size as well as the single-photo export shape.
        batch_diffs = []
        with torch.no_grad():
            for start in range(0, len(ids), 4):
                batch_ids = ids[start:start+4]; tensor = torch.stack([rgb[i] for i in batch_ids])
                expected = torch.cat([body(tensor), material(tensor)[:, 1:2]], dim=1)
                actual = model(tensor)
                assert torch.equal(actual, expected), 'Shared-prefix composition changed logits'
                batch_diffs.extend(differences(actual.sigmoid().numpy(), np.stack([archived[i] for i in batch_ids])))
        package = torch.nn.Sequential(model, torch.nn.Sigmoid()).eval()
        first = rgb[ids[0]][None].contiguous(); file = args.output/(name+'.onnx')
        with torch.no_grad():
            torch.onnx.export(package, first, str(file), input_names=['rgb'], output_names=['probabilities'],
                              opset_version=protocol['opset'], dynamo=False)
        graph = onnx.load(file); onnx.checker.check_model(graph, full_check=True)
        assert not any(t.data_location == onnx.TensorProto.EXTERNAL for t in graph.graph.initializer)
        options = ort.SessionOptions(); options.intra_op_num_threads = protocol['threads']; options.inter_op_num_threads = 1
        start = time.perf_counter()
        session = ort.InferenceSession(str(file), sess_options=options, providers=protocol['providers'])
        startup = 1000*(time.perf_counter()-start)
        assert session.get_providers() == protocol['providers']
        photo_checks = []
        with torch.no_grad():
            for identity in ids:
                tensor = rgb[identity][None].contiguous()
                expected = package(tensor).numpy()[0]
                actual = session.run(['probabilities'], {'rgb': tensor.numpy()})[0][0]
                current = {'id': identity, 'onnxVsTorch': differences(actual, expected),
                           'torchVsArchived': differences(expected, archived[identity]),
                           'onnxVsArchived': differences(actual, archived[identity])}
                photo_checks.append(current); checks.append(current)
                row = rows[identity]; row['assets'] = {'onnx': {}}
                for channel, head in enumerate(['body', 'material']):
                    field = out_probe/(identity+'-'+head+'.f32'); field.write_bytes(actual[channel].astype('<f4').tobytes())
                    row['assets']['onnx'][head] = {'path': field.name, 'sha256': sha(field)}
            # Rotate order across folds; do not interpret microtimings as an SLA.
            tasks = {'torchSeparate': lambda: torch.cat([body(first), material(first)[:, 1:2]], dim=1).sigmoid(),
                     'torchShared': lambda: package(first),
                     'onnxCpu': lambda: session.run(['probabilities'], {'rgb': first.numpy()})}
            order = list(tasks) if not result['folds'] else list(reversed(tasks))
            timings = {key: timing(tasks[key], protocol) for key in order}
        result['folds'].append({'id': name, 'checkpointSha256': sha(checkpoint), 'heldOutIds': ids,
            'exactTorchComposition': True, 'batchedVsArchived': batch_diffs, 'photos': photo_checks,
            'parameters': sum(p.numel() for p in model.parameters()),
            'separateParameters': sum(p.numel() for m in [body, material] for p in m.parameters()),
            'onnx': {'path': file.name, 'sha256': sha(file), 'bytes': file.stat().st_size,
                     'irVersion': graph.ir_version, 'nodes': len(graph.graph.node), 'sessionStartupMilliseconds': startup},
            'warmInference': timings})
        write(args.output/'report.json', result)
    assert checked == set(plan['ids'])
    result['checks'] = {
        'exactTorchComposition': all(f['exactTorchComposition'] for f in result['folds']),
        'archivedProbabilityParity': all(d['maxAbsoluteDifference'] <= protocol['archiveAtol']
            for f in result['folds'] for d in f['batchedVsArchived']) and all(d['maxAbsoluteDifference'] <= protocol['archiveAtol']
            for r in checks for d in r['torchVsArchived']),
        'onnxProbabilityParity': all(d['maxAbsoluteDifference'] <= protocol['probabilityAtol'] for r in checks for d in r['onnxVsTorch']),
        'onnxArchivedHalfThresholdParity': all(d['changedHalfThresholdPixels'] == 0 for r in checks for d in r['onnxVsArchived'])}
    manifest = copy.deepcopy(probe)
    manifest.update(methods=['onnx'], exportPlan=result['plan'],
                    scope='Actual single-thread CPU ONNX outputs of the original two held-out folds; no retraining or per-photo selection. Full source photos are reused in place.')
    write(out_probe/'manifest.json', manifest)
    result['status'] = 'complete'; result['passed'] = all(result['checks'].values())
    result['artifactBytesExcludingReport'] = sum(p.stat().st_size for p in args.output.rglob('*') if p.is_file() and p.name != 'report.json')
    assert result['artifactBytesExcludingReport'] <= plan['resources']['maxArtifactBytes']
    result['artifacts'] = {str(p.relative_to(args.output)): sha(p) for p in args.output.rglob('*') if p.is_file() and p.name != 'report.json'}
    write(args.output/'report.json', result)
    print(json.dumps({'passed': result['passed'], 'checks': result['checks'], 'folds': [
        {key: f[key] for key in ['id', 'parameters', 'separateParameters', 'onnx', 'warmInference']} for f in result['folds']]}, indent=2))
    if not result['passed']: raise SystemExit('Export validation failed; see the preserved report.')


if __name__ == '__main__': main()
