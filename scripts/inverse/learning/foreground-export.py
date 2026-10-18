"""Export fixed foreground predictions for offline crop and solver evaluation."""
import argparse
import json
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
import torch

from data import digest
from foreground import ForegroundCorpus, load_foreground_run, physical_foreground


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--device', default='mps', choices=['cpu', 'mps'])
    args = parser.parse_args()
    out = Path(args.output); out.mkdir(parents=True, exist_ok=False)
    torch.set_num_threads(2); torch.set_num_interop_threads(1)
    model, training = load_foreground_run(args.run, args.device)
    report = {'schema': 'woven-heart-foreground-probe-1', 'status': 'running', 'run': str(Path(args.run).resolve()),
              'trainingReportSha256': digest((Path(args.run)/'report.json').read_bytes()), 'checkpointSha256': training['checkpointSha256'],
              'sourceHashes': {name: digest((Path(__file__).parent/name).read_bytes()) for name in ['foreground-export.py', 'foreground.py', 'model.py']},
              'device': args.device, 'resolution': 256, 'probabilityEncoding': 'little-endian float32, row-major',
              'scope': 'All 31 complete real benchmark photos/ROIs; four preselected views from each synthetic non-training split. Synthetic oracle is a separately labeled diagnostic, never a network input.', 'rows': []}
    def save(): (out/'manifest.json').write_text(json.dumps(report, indent=2)+'\n')
    cases = []
    for name in ['hard-photo-cases.json', 'photo-cases.json']:
        catalog = json.loads((Path(__file__).parent.parent/name).read_text())
        for case in catalog['cases']:
            if case.get('cropStatus') in ['incomplete', 'obscured']: continue
            source = {**catalog.get('source', {}), **case}
            cases.append({'id': 'real-'+case['id'], 'caseId': case['id'], 'group': 'real', 'file': source['file'],
                          'expectedSha256': source.get('sha256'), 'roi': source.get('roi')})
    corpus = ForegroundCorpus([s['dataset'] for s in training['sources']], [s['foreground'] for s in training['sources']])
    for split in ['development', 'recipe-validation', 'recipe-test']:
        # First view from four uniformly spaced geometry hashes. The selection
        # depends on identities only, never model scores or latent crop quality.
        rows = sorted([r for r in corpus.rows if r['experimentalSplit'] == split], key=lambda r: (r['geometrySha256'], r['id']))
        first = {r['geometrySha256']: r for r in reversed(rows)}
        selected = [first[g] for g in sorted(first)][::max(1, len(first)//4)][:4]
        for row in selected:
            item = corpus.load(row)
            parent = json.loads((row['parentRoot']/'manifest.json').read_text())
            design = next(d for d in parent['baseDesigns'] if d['id'] == row['designId'])
            cases.append({'id': 'synthetic-'+row['id'], 'group': split, 'file': item['photo'], 'expectedSha256': item['photoSha256'], 'roi': None,
                          'labels': {'path': str(row['parentRoot']/row['labels']['path']), 'sha256': row['labels']['sha256']},
                          'canonical': {'path': str(row['parentRoot']/design['assets']['canonical.png']['path']), 'sha256': design['assets']['canonical.png']['sha256']}})
    for case in cases:
        file = Path(case['file']).resolve(); raw = file.read_bytes(); sha = digest(raw)
        if case['expectedSha256'] and sha != case['expectedSha256']: raise ValueError('Changed source photograph')
        source = ImageOps.exif_transpose(Image.open(file)).convert('RGB'); width, height = source.size
        roi = case['roi']; pad = max(roi[2]-roi[0], roi[3]-roi[1])*.18 if roi else 0
        box = [max(0, roi[0]-pad), max(0, roi[1]-pad), min(width, roi[2]+pad), min(height, roi[3]+pad)] if roi else [0, 0, width, height]
        rgb = np.asarray(source.resize((256, 256), Image.Resampling.BILINEAR, box=box)).copy()
        tensor = torch.from_numpy(np.ascontiguousarray(rgb.transpose(2, 0, 1)[None])).to(args.device, dtype=torch.float32)/255
        started = time.perf_counter()
        with torch.no_grad(): probability = model(tensor).sigmoid()[0, 0].cpu().numpy()
        row = {**case, 'file': str(file), 'photoSha256': sha, 'dimensions': [width, height], 'window': box,
               'inferenceSeconds': time.perf_counter()-started, 'assets': {}}
        folder = out/case['id']; folder.mkdir()
        for name, data in [('probability.f32', probability.astype('<f4').tobytes())]:
            (folder/name).write_bytes(data); row['assets'][name] = {'path': str((folder/name).relative_to(out)), 'sha256': digest(data)}
        Image.fromarray(rgb).save(folder/'input.png')
        Image.fromarray((probability*255).astype(np.uint8)).save(folder/'probability.png')
        if case.get('labels'):
            labels_raw = Path(case['labels']['path']).read_bytes()
            if digest(labels_raw) != case['labels']['sha256']: raise ValueError('Changed synthetic labels')
            oracle = physical_foreground(json.loads(labels_raw), 256).astype('<f4').tobytes()
            (folder/'oracle.f32').write_bytes(oracle)
            row['assets']['oracle.f32'] = {'path': str((folder/'oracle.f32').relative_to(out)), 'sha256': digest(oracle)}
        report['rows'].append(row); save(); print(case['id'], flush=True)
    report['status'] = 'complete'; save()


if __name__ == '__main__': main()
