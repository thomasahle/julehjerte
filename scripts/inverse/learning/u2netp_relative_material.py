"""Image-relative colour input for the unchanged experimental identity head."""
import torch

from u2netp_material import U2NetPaperIdentity
from u2netp_adaptation import normalize_scores


def relative_material_features(features):
    """Replace only RGB with body-weighted centred, common-scale colour.

    Features contain 16 projected decoder channels, three publisher-normalized
    RGB channels, and one frozen saliency channel. A single scale preserves
    differences between colour channels. No binary foreground threshold or
    learned paper identity enters the statistics. A constant saliency field
    falls back to whole-image statistics; constant colour remains finite.
    """
    rgb = features[:, 16:19]
    weights = normalize_scores(features[:, 19:20]).pow(8)
    mass = weights.sum((-2, -1), keepdim=True)
    weights = torch.where(mass > 0, weights, torch.ones_like(weights))
    mass = weights.sum((-2, -1), keepdim=True)
    mean = (rgb*weights).sum((-2, -1), keepdim=True)/mass
    centred = rgb-mean
    variance = (centred.square()*weights).sum((1, 2, 3), keepdim=True)/(3*mass)
    relative = centred/variance.clamp_min(1e-8).sqrt()
    return torch.cat([features[:, :16], relative, features[:, 19:20]], dim=1)


class U2NetRelativePaperIdentity(U2NetPaperIdentity):
    def forward(self, inputs):
        # Reuse the original forward and identical head architecture/state keys.
        # Only the colour channels entering the material head are transformed.
        hook = self.identity.register_forward_pre_hook(
            lambda _module, args: (relative_material_features(args[0]),))
        try:
            return super().forward(inputs)
        finally:
            hook.remove()


def identity_model(body, mode='raw'):
    if mode == 'raw':
        return U2NetPaperIdentity(body)
    if mode == 'body-relative-rgb':
        return U2NetRelativePaperIdentity(body)
    raise ValueError('Unknown material colour input')
