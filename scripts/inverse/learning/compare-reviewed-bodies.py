"""Compare audited body models on identical or expanded reviewed training pools.

Reuse independently audited training predictions and infer only the additional
photos absent from the control run. These are training diagnostics, not a
substitute for source-separated evaluation or the photo-to-template pipeline.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps
import torch

from data import digest
from body_provenance import verify_body_sources
from preserved_candidate import pinned
from real_foreground import known_region_metrics
from u2netp_adaptation import real_training, normalize_scores
from u2netp_material_candidate import module


def checked_run(directory):
    raw = (directory/'report.json').read_bytes(); report = json.loads(raw)
    audit_raw = (directory/'audit.json').read_bytes(); audit = json.loads(audit_raw)
    reference = {'path': str(directory/'report.json'), 'sha256': digest(raw)}
    if report['status'] != 'complete' or not audit['passed'] or audit['report'] != reference:
        raise ValueError('Require independently audited training')
    verify_body_sources(report)
    for file, sha in report['artifacts'].items(): pinned({'path': str(directory/file), 'sha256': sha})
    saved = np.load(directory/'training-predictions.npz', allow_pickle=False)
    if len(saved['ids']) != len(set(saved['ids'].tolist())):
        raise ValueError('Duplicate prediction identity')
    fields = dict(zip(saved['ids'].tolist(), saved['final']))
    return report, json.loads(pinned(report['plan']).read_bytes()), fields, {
        'report': reference, 'audit': {'path': str(directory/'audit.json'), 'sha256': digest(audit_raw)}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['control', 'candidate', 'output']: parser.add_argument('--'+name, type=Path, required=True)
    args = parser.parse_args()
    torch.set_num_threads(1); torch.set_num_interop_threads(1)
    control, cp, cf, cr = checked_run(args.control)
    candidate, plan, fields, reference = checked_run(args.candidate)
    if cp['source'] != plan['source'] or not set(cf) <= set(fields):
        raise ValueError('Require one upstream source and an identical or expanded candidate pool')
    if plan['trainIds'][:len(cp['trainIds'])] != cp['trainIds']:
        raise ValueError('Require unchanged control-photo order followed by additional photos')
    root = pinned(plan['source']).parent
    for asset in json.loads((root/'source.json').read_bytes())['files']:
        pinned({'path': str(root/asset['path']), 'sha256': asset['sha256']})
    loader = module(root/'data_loader.py', 'reviewed_body_input')
    architecture = module(root/'model/u2net.py', 'reviewed_body_model')
    items, separation = real_training(plan, loader.RescaleT(320), loader.ToTensorLab(flag=0))
    if [i['id'] for i in items] != plan['trainIds'] or set(fields) != set(plan['trainIds']):
        raise ValueError('Reviewed input pool differs')
    recorded = {i['id']: i for i in candidate['trainingInputs']}
    control_recorded = {i['id']: i for i in control['trainingInputs']}
    for item in items:
        expected = {'id': item['id'], **item['evidence'], 'inputTensorSha256': digest(item['input'].numpy().tobytes())}
        if recorded[item['id']] != expected or (item['id'] in cf and control_recorded[item['id']] != expected):
            raise ValueError('Paired input/label evidence differs')
    model = architecture.U2NETP(3, 1).eval()
    model.load_state_dict(torch.load(pinned({'path': str(args.control/'model.pt'), 'sha256': control['checkpointSha256']}), map_location='cpu', weights_only=True), strict=True)
    with torch.no_grad():
        for item in items:
            if item['id'] not in cf:
                cf[item['id']] = normalize_scores(model(item['input'][None])[0])[0, 0].numpy()
    predictions = {name: np.stack([source[i['id']] for i in items]) for name, source in [('control', cf), ('candidate', fields)]}
    labels = [{'id': i['id'], 'target': (i['labels'] == 1).astype(np.float32), 'weight': (i['labels'] != 255).astype(np.float32)} for i in items]
    args.output.mkdir(parents=True, exist_ok=False)
    np.savez_compressed(args.output/'predictions.npz', ids=np.array([i['id'] for i in items]), **predictions)
    with np.load(args.output/'predictions.npz', allow_pickle=False) as saved:
        for name, values in predictions.items():
            if not np.array_equal(saved[name], values): raise ValueError('Stored prediction mismatch')
    same_pool = len(cp['trainIds']) == len(items)
    groups = ({'all-training': list(range(len(items)))} if same_pool else
              {'previous-'+str(len(cp['trainIds'])): list(range(len(cp['trainIds']))),
               'additional-'+str(len(items)-len(cp['trainIds'])): list(range(len(cp['trainIds']), len(items)))})
    metrics = {group: {name: known_region_metrics(values[ids], [labels[i] for i in ids]) for name, values in predictions.items()} for group, ids in groups.items()}
    pages = []
    for start in range(0, len(items), 4):
        selected = items[start:start+4]; sheet = Image.new('RGB', (1280, 28+len(selected)*344), 'white'); pen = ImageDraw.Draw(sheet)
        for x, label in enumerate(['Photo', 'Reviewed body (grey unknown)', 'Control', 'Candidate']): pen.text((320*x+4, 4), label, fill='black')
        for row, item in enumerate(selected):
            with Image.open(item['evidence']['photo']) as original:
                photo = ImageOps.exif_transpose(original).convert('RGB').resize((320, 320), Image.Resampling.BILINEAR)
            target = np.full((320, 320), 130, np.uint8); target[item['labels'] == 0] = 0; target[item['labels'] == 1] = 255
            panels = [photo, Image.fromarray(target), *[Image.fromarray(np.uint8(predictions[name][start+row]*255)) for name in ['control', 'candidate']]]
            y = 28+row*344
            for x, image in enumerate(panels): sheet.paste(image, (320*x, y))
            pen.text((4, y+323), item['id'], fill='black')
        file = args.output/('training-'+str(len(pages)+1)+'.jpg'); sheet.save(file, quality=90)
        pages.append({'path': file.name, 'sha256': digest(file.read_bytes())})
    report = {'schema': 'reviewed-body-comparison-1', 'status': 'complete', 'control': cr, 'candidate': reference,
              'implementationSha256': digest(Path(__file__).read_bytes()), 'sourceSeparation': separation,
              'newControlInferences': len(items)-len(cp['trainIds']), 'metrics': metrics, 'gallery': pages,
              'predictions': {'path': 'predictions.npz', 'sha256': digest((args.output/'predictions.npz').read_bytes())},
              'scope': ('Training diagnostics. Both models trained on the same photos. ' if same_pool else
                        'Training diagnostics. All candidate photos trained; additional photos were absent from control training but can share its source groups. ')+
                       'Unknown annotation bands are excluded. No held-out, crop or template accuracy claim.'}
    (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({g: {n: m['macroMean'] for n, m in methods.items()} for g, methods in metrics.items()}))


if __name__ == '__main__': main()
