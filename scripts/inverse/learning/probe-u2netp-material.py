"""Inspect the fixed paper-identity head on source-separated photographs."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import time

import numpy as np
from PIL import Image, ImageDraw, ImageOps
import torch

from u2netp_material import U2NetPaperIdentity
from u2netp_adaptation import input_tensor, frozen_hash
from preserved_candidate import pinned
from data import digest


def module(file, name):
    spec = importlib.util.spec_from_file_location(name, file)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--training', type=Path, required=True)
    parser.add_argument('--control', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report_bytes = (args.training/'report.json').read_bytes(); training = json.loads(report_bytes)
    if training['schema'] != 'u2netp-material-training-1' or training['status'] != 'complete' or not training['frozenBodyExact']:
        raise ValueError('Require completed frozen-body training')
    plan = json.loads(pinned(training['plan']).read_bytes())
    for file, sha in training['sourceHashes'].items(): pinned({'path': file, 'sha256': sha})
    selected = json.loads(pinned(plan['evaluation']).read_bytes())
    source_file = pinned(plan['source']); source = json.loads(source_file.read_bytes()); root = source_file.parent
    for row in source['files']: pinned({'path': str(root/row['path']), 'sha256': row['sha256']})
    control_bytes = (args.control/'manifest.json').read_bytes(); control = json.loads(control_bytes)
    if control['status'] != 'complete' or control['resolution'] != 320 or [r['id'] for r in control['rows']] != [r['id'] for r in selected['photos']]:
        raise ValueError('Changed reference cohort')
    if control['fieldOrigin']['checkpointSha256'] != plan['checkpoint']['sha256']:
        raise ValueError('Reference body checkpoint differs')
    if shutil.disk_usage('.').free < 10*1024**3: raise ValueError('Insufficient free disk')
    torch.set_num_threads(1); torch.set_num_interop_threads(1)
    architecture = module(root/'model/u2net.py', 'u2netp_identity_probe_model')
    loader = module(root/'data_loader.py', 'u2netp_identity_probe_input')
    parent = architecture.U2NETP(3, 1).eval()
    parent.load_state_dict(torch.load(pinned(plan['checkpoint']), map_location='cpu', weights_only=True), strict=True)
    model = U2NetPaperIdentity(parent).eval()
    checkpoint = pinned({'path': str(args.training/'identity.pt'), 'sha256': training['checkpointSha256']})
    head = torch.load(checkpoint, map_location='cpu', weights_only=True)
    state = model.state_dict(); expected = {k for k in state if not k.startswith('body.')}
    if set(head) != expected: raise ValueError('Checkpoint must contain only the complete new identity head')
    state.update(head); model.load_state_dict(state, strict=True)
    if frozen_hash(model) != training['initialFrozenStateSha256']: raise ValueError('Body state differs')
    rescale, normalize = loader.RescaleT(320), loader.ToTensorLab(flag=0)
    args.output.mkdir(parents=True, exist_ok=False)
    report = {'schema': 'u2netp-material-probe-1', 'status': 'running', 'resolution': 320,
              'training': {'path': str(args.training/'report.json'), 'sha256': digest(report_bytes)},
              'selection': plan['evaluation'], 'reference': {'path': str(args.control/'manifest.json'), 'sha256': digest(control_bytes)},
              'implementationSha256': digest(Path(__file__).read_bytes()), 'rows': [], 'gallery': [],
              'scope': 'Native development inference on the same inspected source-separated cohort. Original photos and frozen body are unchanged. Conditional paper identity has no complete held-out ground truth; gallery inspection and full pipeline checks are still required. Not a browser release.'}
    panels = []
    def save(): (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    with torch.no_grad():
        for index, item in enumerate(selected['photos']):
            tensor, size, decoded = input_tensor(item['file'], item['imageSha256'], rescale, normalize)
            if size != item['dimensions'] or decoded != item['decodedRGBSha256']: raise ValueError('Changed evaluation photo')
            started = time.perf_counter(); logits = model(tensor[None]); seconds = time.perf_counter()-started
            raw = logits[:, :1].sigmoid()
            if not torch.equal(raw, parent(tensor[None])[0]): raise ValueError('New head changed the body output')
            raw = raw[0, 0].numpy(); low, high = float(raw.min()), float(raw.max())
            body = (raw-low)/(high-low) if high > low else np.zeros_like(raw)
            material = logits[0, 1].sigmoid().numpy()
            old = control['rows'][index]; asset = old['assets']['probability.f32']
            reference_file = (args.control/asset['path']).resolve()
            if not reference_file.is_relative_to(args.control.resolve()) or digest(reference_file.read_bytes()) != asset['sha256']:
                raise ValueError('Changed reference body field')
            reference = np.fromfile(reference_file, dtype='<f4').reshape(320, 320)
            assets = {}
            for name, values in [('body', body), ('material', material)]:
                target = args.output/(item['id']+'-'+name+'.f32')
                if name == 'body' and np.array_equal(values, reference): os.link(reference_file, target)
                else: target.write_bytes(values.astype('<f4').tobytes())
                assets[name] = {'path': target.name, 'sha256': digest(target.read_bytes())}
            report['rows'].append({'id': item['id'], 'file': item['file'], 'photoSha256': item['imageSha256'],
                'dimensions': size, 'decodedRGBSha256': decoded, 'inputSha256': digest(tensor.numpy().astype('<f4').tobytes()),
                'window': [0, 0, *size], 'assets': assets, 'inferenceSeconds': seconds, 'parentBodyExact': True,
                'referenceBodyMaximumDifference': float(np.abs(body-reference).max()),
                'materialRange': [float(material.min()), float(material.max())]})
            with Image.open(item['file']) as photo:
                rgb = ImageOps.exif_transpose(photo).convert('RGB').resize((320, 320), Image.Resampling.BILINEAR)
            shown = np.full((320, 320, 3), 130, dtype=np.uint8)
            shown[(body >= .5) & (material < .5)] = [255, 130, 0]
            shown[(body >= .5) & (material >= .5)] = [0, 200, 255]
            panels.append((item['id'], [rgb, Image.fromarray(np.uint8(body*255)), Image.fromarray(np.uint8(material*255)), Image.fromarray(shown)]))
            if len(panels) == 4 or index == len(selected['photos'])-1:
                sheet = Image.new('RGB', (1280, len(panels)*344), 'white'); pen = ImageDraw.Draw(sheet)
                for y, (identity, images) in enumerate(panels):
                    for x, image in enumerate(images): sheet.paste(image, (x*320, y*344))
                    pen.text((4, y*344+323), identity+' / photo, frozen body, material probability, two-paper proposal', fill='black')
                filename = 'photos-'+str(len(report['gallery'])+1)+'.jpg'; sheet.save(args.output/filename, quality=88)
                report['gallery'].append({'path': filename, 'sha256': digest((args.output/filename).read_bytes())}); panels = []
            save(); print(item['id'], seconds, flush=True)
    report.update(status='complete', allParentBodiesExact=True,
                  maximumReferenceBodyDifference=max(r['referenceBodyMaximumDifference'] for r in report['rows']),
                  medianInferenceSeconds=float(np.median([r['inferenceSeconds'] for r in report['rows']])))
    save()
    report['logicalBytes'] = sum(f.stat().st_size for f in args.output.iterdir() if f.is_file())
    if report['logicalBytes'] > 40*1024**2: raise ValueError('Probe artifact budget exceeded')
    save(); print(json.dumps({'status': report['status'], 'bodyDifference': report['maximumReferenceBodyDifference']}))


if __name__ == '__main__': main()
