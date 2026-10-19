import copy
import unittest

import numpy as np
import torch
from torch import nn

from real_foreground import masked_foreground_loss
from real_annotations import rasterize
from u2netp_adaptation import stretched_body_labels, freeze_encoder, frozen_hash, fused_logits, normalize_scores


class TinySaliency(nn.Module):
    def __init__(self):
        super().__init__()
        self.stage1 = nn.Sequential(nn.Conv2d(3, 4, 1), nn.BatchNorm2d(4))
        self.stage1d = nn.Sequential(nn.Conv2d(4, 4, 1), nn.BatchNorm2d(4))
        self.outconv = nn.Conv2d(4, 1, 1)

    def forward(self, x):
        return (self.outconv(self.stage1d(self.stage1(x))).sigmoid(),)


class AdaptationTests(unittest.TestCase):
    def test_square_coordinates_match_existing_reviewed_rasterizer(self):
        row = {'sourceSize': [256, 256], 'foregroundPolygons': [[[20, 50], [180, 35], [210, 200], [40, 230]]],
               'unknownPolygons': [[[100, 100], [160, 110], [120, 170]]], 'boundaryUncertaintyPixels': 2.5}
        for n in [64, 320]:
            self.assertTrue(np.array_equal(stretched_body_labels(row, n), rasterize(row, n)[0]))

    def test_stretch_uncertainty_is_measured_in_original_source_pixels(self):
        row = {'sourceSize': [200, 100], 'foregroundPolygons': [[[40, 20], [160, 20], [160, 80], [40, 80]]],
               'unknownPolygons': [], 'boundaryUncertaintyPixels': 3}
        actual = stretched_body_labels(row, 100)
        for j in range(100):
            for i in range(100):
                x, y = (i+.5)*2, j+.5
                # Independent distance to the axis-aligned rectangle perimeter.
                distance = min(np.hypot(x-40, max(20-y, 0, y-80)), np.hypot(x-160, max(20-y, 0, y-80)),
                               np.hypot(max(40-x, 0, x-160), y-20), np.hypot(max(40-x, 0, x-160), y-80))
                expected = 255 if distance <= 3 else int(40 < x < 160 and 20 < y < 80)
                self.assertEqual(actual[j, i], expected)

    def test_update_changes_decoder_but_not_encoder_or_any_batchnorm_statistics(self):
        torch.set_num_threads(1); torch.manual_seed(17)
        model = TinySaliency(); freeze_encoder(model); before = copy.deepcopy(model.state_dict())
        frozen = frozen_hash(model); rgb = torch.rand(2, 3, 16, 16)
        with torch.no_grad(): self.assertTrue(torch.equal(fused_logits(model, rgb).sigmoid(), model(rgb)[0]))
        optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=.01)
        target = torch.zeros(2, 1, 16, 16); weight = torch.ones_like(target); weight[:, :, :5] = 0
        logits = fused_logits(model, rgb); logits.retain_grad()
        masked_foreground_loss(logits, target, weight).backward(); optimizer.step()
        self.assertEqual(float(logits.grad[:, :, :5].abs().sum()), 0)
        self.assertEqual(frozen_hash(model), frozen)
        self.assertTrue(all(p.grad is None for p in model.stage1.parameters()))
        self.assertFalse(torch.equal(model.outconv.weight, before['outconv.weight']))
        self.assertEqual(len(model.outconv._forward_hooks), 0)

    def test_publisher_normalization_is_per_image_and_handles_constant_fields(self):
        raw = torch.tensor([[[[.2, .4], [.6, 1.]]], [[[.9, .9], [.9, .9]]]])
        actual = normalize_scores(raw)
        self.assertTrue(torch.equal(actual[1], torch.zeros_like(actual[1])))
        self.assertTrue(torch.allclose(actual[0], torch.tensor([[[0., .25], [.5, 1.]]])))


if __name__ == '__main__': unittest.main()
