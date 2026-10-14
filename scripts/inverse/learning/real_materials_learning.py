"""Joint body/material supervision with image-wide exchangeable paper labels."""
import json
from pathlib import Path

import numpy as np
from PIL import Image
import torch
from torch import nn
from torch.nn import functional as F

from foreground import ForegroundNet
from real_foreground import ROOT, check_current_training_sources, masked_foreground_loss
from real_materials import verify


class MaterialNet(ForegroundNet):
    def __init__(self, initialization='random', checkpoint_directory=None):
        super().__init__(initialization, checkpoint_directory)
        # First channel: selected physical body. Second: B conditional on body.
        self.head[-1] = nn.Conv2d(16, 2, 1)
        nn.init.zeros_(self.head[-1].bias)


def joint_material_loss(logits, body, materials):
    if logits.ndim != 4 or logits.shape[1] != 2 or body.shape != logits[:, 0].shape or materials.shape != body.shape:
        raise ValueError('Require two logits and matching batch/height/width labels')
    if not torch.isfinite(logits).all() or not ((body == 0) | (body == 1) | (body == 255)).all() or not ((materials == 0) | (materials == 1) | (materials == 255)).all():
        raise ValueError('Require finite logits and known label semantics')
    known = materials != 255
    if (known & (body != 1)).any():
        raise ValueError('Material supervision requires known selected paper')
    body_loss = masked_foreground_loss(logits[:, :1], (body == 1)[:, None].to(logits.dtype), (body != 255)[:, None].to(logits.dtype))
    target = (materials == 1).to(logits.dtype)
    count = known.sum((1, 2)).clamp_min(1)
    direct = (F.binary_cross_entropy_with_logits(logits[:, 1], target, reduction='none')*known).sum((1, 2))/count
    exchanged = (F.binary_cross_entropy_with_logits(logits[:, 1], 1-target, reduction='none')*known).sum((1, 2))/count
    # One assignment for the whole photograph. A per-pixel minimum could learn
    # arbitrary islands with no consistent identity across the woven sheet.
    # At an exact tie, select one assignment instead of averaging opposite
    # gradients (which would leave a neutral material head unable to learn).
    return body_loss+torch.where(direct <= exchanged, direct, exchanged).mean()


def load_material_labels(directory, manifest=ROOT/'docs/inverse/datasets/real-manifest.json',
                         annotations=ROOT/'scripts/inverse/datasets/real-materials.json', root=ROOT,
                         *, purpose='training-candidate'):
    directory = Path(directory)
    audit = verify(Path(manifest), Path(annotations), directory, root, purpose=purpose)
    report = json.loads((directory/'manifest.json').read_bytes())
    if purpose == 'training-candidate':
        check_current_training_sources(report['instances'], manifest, root)
    items = []
    for row in report['instances']:
        arrays = {k: np.asarray(Image.open(directory/row['assets'][k]['path'])).copy() for k in ['rgb', 'body', 'materials']}
        items.append({**arrays, **{k: row[k] for k in ['id', 'allocation', 'splitGroupId', 'nearDuplicateGroup', 'motif']}})
    return items, audit
