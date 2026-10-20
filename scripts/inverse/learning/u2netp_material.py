"""Learn paper identity from frozen U2NETP features without changing its body.

This is an offline experimental head. Its two outputs are raw body/material
logits; inference must retain the saliency parent's normalization for channel 0.
Paper A/B is local to each image, using the existing whole-image exchange loss.
"""
import copy

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

from u2netp_adaptation import stretched_body_labels
from real_annotations import polygon_fields


class U2NetPaperIdentity(nn.Module):
    def __init__(self, body):
        super().__init__()
        self.body = copy.deepcopy(body).eval()
        for name in ['stage1d', 'stage2d', 'stage3d', 'outconv']:
            if not isinstance(getattr(self.body, name, None), nn.Module):
                raise ValueError('Require the original U2NETP decoder and fused head')
        for parameter in self.body.parameters():
            parameter.requires_grad_(False)
        self.projections = nn.ModuleList([nn.Conv2d(64, 16, 1) for _ in range(3)])
        self.identity = nn.Sequential(nn.Conv2d(20, 32, 3, padding=1), nn.ReLU(),
                                      nn.Conv2d(32, 32, 3, padding=1), nn.ReLU(),
                                      nn.Conv2d(32, 1, 1))
        nn.init.zeros_(self.identity[-1].weight)
        nn.init.zeros_(self.identity[-1].bias)

    def train(self, mode=True):
        super().train(mode)
        self.body.eval()
        return self

    def forward(self, inputs):
        # Hooks reuse the actual publisher forward, including its interpolation
        # convention. They do not fork the body architecture or run it twice.
        captured = {}
        def capture(name):
            return lambda _module, _inputs, output: captured.__setitem__(name, output)
        handles = [getattr(self.body, name).register_forward_hook(capture(name))
                   for name in ['stage1d', 'stage2d', 'stage3d', 'outconv']]
        try:
            with torch.no_grad():
                self.body(inputs)
        finally:
            for handle in handles:
                handle.remove()
        body = captured['outconv']
        size = captured['stage2d'].shape[-2:]
        features = sum(F.interpolate(project(captured[name]), size=size,
                                     mode='bilinear', align_corners=False)
                       for project, name in zip(self.projections, ['stage1d', 'stage2d', 'stage3d']))/3
        rgb = F.interpolate(inputs, size=size, mode='bilinear', align_corners=False)
        saliency = F.interpolate(body.sigmoid(), size=size, mode='bilinear', align_corners=False)
        material = self.identity(torch.cat([features, rgb, saliency], dim=1))
        material = F.interpolate(material, size=inputs.shape[-2:], mode='bilinear', align_corners=False)
        return torch.cat([body, material], dim=1)


def stretched_material_labels(item, body_row, resolution=320):
    """Rasterize original paper polygons in the saliency parent's image frame.

    Unknown material is 255, including known body without an identity label.
    Source-pixel uncertainty is retained through anisotropic image resizing.
    """
    body = stretched_body_labels(body_row, resolution)
    band = item['boundaryUncertaintyPixels']
    if not np.isfinite(band) or band <= 0:
        raise ValueError('Require positive material uncertainty')
    if set(item['papers']) != {'paperA', 'paperB'}:
        raise ValueError('Require two paper identities')
    width, height = body_row['sourceSize']
    yy, xx = np.mgrid[:resolution, :resolution]
    x, y = (xx+.5)*width/resolution, (yy+.5)*height/resolution
    materials = np.full(body.shape, 255, dtype=np.uint8)
    for value, name in enumerate(['paperA', 'paperB']):
        known = np.zeros(body.shape, dtype=bool)
        for polygon in item['papers'][name]['polygons']:
            inside, distance = polygon_fields(polygon, x, y)
            known |= inside & (distance > band**2)
        if np.any(known & (body == 0)):
            raise ValueError('Material annotation conflicts with known background')
        known &= body == 1
        if np.any(known & (materials != 255)):
            raise ValueError('Paper identities overlap')
        if not known.any():
            raise ValueError('Each paper requires known pixels')
        materials[known] = value
    return body, materials
