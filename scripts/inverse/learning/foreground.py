"""Full-photo synthetic foreground task, separate from rectified graph proposals."""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, distance_transform_edt
import torch
from torch import nn
from torch.nn import functional as F

from data import checked_asset, digest
from model import ProposalNet


class ForegroundNet(ProposalNet):
    def __init__(self, initialization='random', checkpoint_directory=None):
        super().__init__(initialization, checkpoint_directory)
        if initialization == 'imagenet' and self.initialization['sha256'] != '047dcff4addef86ea5bc2eff13c9614dc11f47ab1160d0a71a25e7db994f4e1f':
            raise ValueError('Unexpected pretrained checkpoint')
        self.head[-1] = nn.Conv2d(16, 1, 1)
        nn.init.zeros_(self.head[-1].bias)

    def forward(self, rgb):
        # Reuse the existing dense decoder without a classifier/target input.
        # Its fourth detail channel is always zero, including at evaluation.
        return super().forward(rgb, torch.zeros_like(rgb[:, :1]))


def foreground_loss(logits, target):
    probability = logits.sigmoid()
    dice = (2*(probability*target).sum((2, 3))+1)/(probability.sum((2, 3))+target.sum((2, 3))+1)
    return F.binary_cross_entropy_with_logits(logits, target) + (1-dice).mean()


def physical_foreground(labels, resolution=None):
    n = labels['resolution'] if resolution is None else resolution
    if labels.get('schema') != 'woven-heart-synthetic-view-1' or not isinstance(n, int) or n < 16 or n > 4096:
        raise ValueError('Unsupported camera labels or resolution')
    h = np.asarray(labels['canonicalToPhoto'], dtype=float).reshape(3, 3).copy()
    if not np.isfinite(h).all(): raise ValueError('Nonfinite camera transform')
    h[:2] *= n/labels['resolution']
    inverse = np.linalg.inv(h)
    yy, xx = np.mgrid[:n, :n]
    pixels = np.stack([xx+.5, yy+.5, np.ones_like(xx)], axis=-1) @ inverse.T
    with np.errstate(divide='ignore', invalid='ignore'):
        x, y = pixels[..., 0]/pixels[..., 2], pixels[..., 1]/pixels[..., 2]
    return ((x >= 0) & (x <= 100) & (y >= 0) & (y <= 100) |
            (y < 0) & ((x-50)**2+y*y <= 2500) |
            (x < 0) & (x*x+(y-50)**2 <= 2500))


class ForegroundCorpus:
    def __init__(self, datasets, foregrounds, resolution=256):
        if not datasets or len(datasets) != len(foregrounds) or not isinstance(resolution, int) or resolution < 32 or resolution > 1024:
            raise ValueError('Pair each parent dataset with its foreground sidecar')
        self.resolution = resolution
        self.sources, self.rows = [], []
        identities = set(); geometry_roles = {}
        for dataset, foreground in zip(datasets, foregrounds):
            root, extra = Path(dataset).resolve(), Path(foreground).resolve()
            raw = (root/'manifest.json').read_bytes(); parent = json.loads(raw)
            side_raw = (extra/'manifest.json').read_bytes(); side = json.loads(side_raw)
            identity = digest(raw)
            if identity in identities: raise ValueError('Duplicate parent dataset')
            identities.add(identity)
            if parent.get('schema') != 'woven-heart-synthetic-dataset-1' or parent.get('status') != 'complete' or side.get('schema') != 'woven-heart-foreground-dataset-1' or side.get('status') != 'complete' or side['parentManifestSha256'] != identity:
                raise ValueError('Incomplete or mismatched foreground dataset')
            if parent['sourceProvenance']['externalAssets'] or any(parent['splitPolicy'][k] for k in ['existingPhotoQAIncluded', 'existingHunodanQAIncluded', 'existingGalleryIncluded']):
                raise ValueError('Training requires procedural-only sources')
            if side['splitPolicy'] != parent['splitPolicy'] or parent['splitPolicy']['topologyDisjoint'] is not False:
                raise ValueError('Changed or overstated split policy')
            views = {v['id']: v for v in parent['views']}; designs = {d['id']: d for d in parent['baseDesigns']}
            ids = [v['id'] for v in side['views']]
            if len(designs) != len(parent['baseDesigns']) or len(views) != len(parent['views']) or len(ids) != len(set(ids)) or set(ids) != set(views):
                raise ValueError('Missing or duplicate source views')
            self.sources.append({'dataset': str(root), 'foreground': str(extra), 'parentManifestSha256': identity, 'foregroundManifestSha256': digest(side_raw)})
            for row in side['views']:
                view = views[row['id']]; design = designs[view['designId']]
                if design['split'] not in ['train', 'validation', 'test'] or parent['splitPolicy']['familySplits'][design['familyId']] != design['split']:
                    raise ValueError('Unrecognized or changed family split')
                for key in ['designId', 'familyId', 'groupId', 'split', 'sourceId']:
                    if row[key] != view[key] or key != 'designId' and view[key] != design[key]:
                        raise ValueError('Changed view identity or split')
                for key, filename in [('photo', 'photo.jpg'), ('labels', 'labels.json')]:
                    if row[key] != view['assets'][filename]: raise ValueError('Changed foreground source assets')
                if not design['validation']['passed'] or not design['validation']['geometry']['passed'] or design['validation']['paper']['status'] != 'pass':
                    raise ValueError('Rejected procedural design')
                role = geometry_roles.setdefault(design['geometrySha256'], design['split'])
                if role != design['split']: raise ValueError('Identical geometry crosses parent splits')
                self.rows.append({**row, 'key': identity[:12]+':'+row['id'], 'geometrySha256': design['geometrySha256'], 'parentRoot': root, 'foregroundRoot': extra})
        # Global geometry grouping keeps variants/reposts together across both
        # parents. The recipe holdouts are never used to choose this split.
        train = sorted(g for g, role in geometry_roles.items() if role == 'train')
        if len(train) < 8: raise ValueError('Require at least eight training geometries')
        development = set(train[::5])
        for row in self.rows:
            row['experimentalSplit'] = ('development' if row['geometrySha256'] in development else 'train') if row['split'] == 'train' else 'recipe-'+row['split']

    def load(self, row):
        labels = json.loads(checked_asset(row['parentRoot'], row['labels']).read_text())
        photo = Image.open(checked_asset(row['parentRoot'], row['photo'])).convert('RGB')
        foreground = Image.open(checked_asset(row['foregroundRoot'], row['foreground'])).convert('RGBA')
        n = labels['resolution']
        rgba = np.asarray(foreground)
        original = rgba[..., 0]
        if photo.size != (n, n) or foreground.size != (n, n) or row['resolution'] != n:
            raise ValueError('Source dimensions disagree')
        if not np.all(rgba[..., 3] == 255) or not np.all(rgba[..., :3] == original[..., None]) or not np.array_equal(original, physical_foreground(labels).astype(np.uint8)*255) or int((original > 0).sum()) != row['foregroundPixels']:
            raise ValueError('Foreground is not the saved physical geometry')
        return {'id': row['key'], 'viewId': row['id'], 'split': row['experimentalSplit'], 'geometrySha256': row['geometrySha256'],
                'familyId': row['familyId'], 'rgb': np.asarray(photo.resize((self.resolution, self.resolution), Image.Resampling.BILINEAR)).copy(),
                'target': physical_foreground(labels, self.resolution).astype(np.float32), 'labels': labels,
                'photo': str(row['parentRoot']/row['photo']['path']), 'photoSha256': row['photo']['sha256']}


def tensors(items, device):
    rgb = torch.from_numpy(np.ascontiguousarray(np.stack([i['rgb'].transpose(2, 0, 1) for i in items]))).to(device, dtype=torch.float32)/255
    target = torch.from_numpy(np.stack([i['target'][None] for i in items])).to(device)
    return rgb, target


def foreground_metrics(predictions, items, threshold=.5):
    if not items or len(predictions) != len(items) or not np.isfinite(threshold) or not 0 < threshold < 1:
        raise ValueError('Require one prediction per item and a finite probability threshold')
    rows = []
    for probability, item in zip(predictions, items):
        probability = np.asarray(probability)
        if probability.shape != item['target'].shape or not np.isfinite(probability).all() or probability.min() < 0 or probability.max() > 1:
            raise ValueError('Invalid foreground probability image')
        predicted, target = np.asarray(probability) >= threshold, item['target'] > .5
        intersection, union = int((predicted & target).sum()), int((predicted | target).sum())
        bp, bt = predicted ^ binary_erosion(predicted), target ^ binary_erosion(target)
        tp = int((bp & (distance_transform_edt(~bt) <= 2)).sum()) if bt.any() else 0
        tt = int((bt & (distance_transform_edt(~bp) <= 2)).sum()) if bp.any() else 0
        precision = tp/int(bp.sum()) if bp.any() else float(not bt.any())
        recall = tt/int(bt.sum()) if bt.any() else float(not bp.any())
        rows.append({'id': item['id'], 'iou': intersection/union if union else 1., 'pixelError': float((predicted != target).mean()),
                     'boundaryF1': 2*precision*recall/(precision+recall) if precision+recall else 0.,
                     'backgroundFalsePositive': float(predicted[~target].mean()) if (~target).any() else 0.,
                     'paperFalseNegative': float((~predicted[target]).mean()) if target.any() else 0.})
    return {'threshold': threshold, 'boundaryTolerancePixels': 2, 'views': len(rows),
            **{key: float(np.mean([r[key] for r in rows])) for key in ['iou', 'pixelError', 'boundaryF1', 'backgroundFalsePositive', 'paperFalseNegative']}, 'rows': rows}


def infer(model, items, device, batch_size=8):
    model.eval(); predictions = []; total = 0.
    with torch.no_grad():
        for start in range(0, len(items), batch_size):
            batch = items[start:start+batch_size]; rgb, target = tensors(batch, device)
            logits = model(rgb); total += float(foreground_loss(logits, target).cpu())*len(batch)
            predictions.extend(logits.sigmoid()[:, 0].cpu().numpy())
    return total/max(1, len(items)), predictions


def load_foreground_run(directory, device='cpu'):
    root = Path(directory); report = json.loads((root/'report.json').read_text())
    if not report.get('selectedEpoch') or digest((root/'model.pt').read_bytes()) != report.get('checkpointSha256'):
        raise ValueError('Unverified foreground checkpoint')
    for name in ['foreground.py', 'model.py']:
        if digest((Path(__file__).parent/name).read_bytes()) != report['sourceHashes'][name]: raise ValueError('Model implementation differs from checkpoint')
    model = ForegroundNet().to(device)
    model.load_state_dict(torch.load(root/'model.pt', map_location=device, weights_only=True)); model.eval()
    return model, report
