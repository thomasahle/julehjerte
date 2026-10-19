"""Offline inference with whole-photo context and a separate RGB detail scale.

No weights are changed. At equal input sizes this is the original MaterialNet
forward pass; at different sizes only the shallow RGB branch and final decoder
run on the finer grid. Source-window alignment belongs to the caller.
"""
import torch
from torch.nn import functional as F


def context_detail_logits(model, context_rgb, detail_rgb):
    if any(module.training for module in model.modules()):
        raise ValueError('Frozen context/detail inference requires evaluation mode')
    if (context_rgb.ndim != 4 or detail_rgb.ndim != 4
            or context_rgb.shape[:2] != detail_rgb.shape[:2] or context_rgb.shape[1] != 3
            or context_rgb.dtype != detail_rgb.dtype or context_rgb.device != detail_rgb.device
            or not context_rgb.is_floating_point()
            or any(n < 32 or n % 32 for n in [*context_rgb.shape[-2:], *detail_rgb.shape[-2:]])
            or context_rgb.shape[-2]*detail_rgb.shape[-1] != context_rgb.shape[-1]*detail_rgb.shape[-2]):
        raise ValueError('Require matching floating-point RGB batches and proportional spatial grids')
    x = (context_rgb-model.mean)/model.std
    features = []
    for index, layer in enumerate(model.encoder):
        x = layer(x)
        if index in model.feature_indices:
            features.append(x)
    shape = features[1].shape[-2:]
    combined = sum(F.interpolate(layer(value), size=shape, mode='bilinear', align_corners=False)
                   for layer, value in zip(model.lateral, features))/len(features)
    combined = F.interpolate(combined, size=detail_rgb.shape[-2:], mode='bilinear', align_corners=False)
    detail = model.detail(torch.cat([detail_rgb, torch.zeros_like(detail_rgb[:, :1])], dim=1))
    return model.head(torch.cat([combined, detail], dim=1))
