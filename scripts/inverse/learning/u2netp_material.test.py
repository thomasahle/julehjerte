import copy
import unittest

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

from u2netp_material import U2NetPaperIdentity, stretched_material_labels
from real_materials import rasterize_materials
from real_materials_learning import joint_material_loss
from u2netp_adaptation import fused_logits, frozen_hash


class TinyBody(nn.Module):
    def __init__(self):
        super().__init__()
        self.stage1d = nn.Sequential(nn.Conv2d(3, 64, 1), nn.BatchNorm2d(64))
        self.stage2d = nn.Conv2d(64, 64, 1)
        self.stage3d = nn.Conv2d(64, 64, 1)
        self.outconv = nn.Conv2d(64, 1, 1)

    def forward(self, inputs):
        first = self.stage1d(inputs)
        second = self.stage2d(F.avg_pool2d(first, 2))
        self.stage3d(F.avg_pool2d(second, 2))
        return (self.outconv(first).sigmoid(),)


class MaterialTests(unittest.TestCase):
    def test_learning_changes_identity_without_changing_parent_or_body(self):
        torch.set_num_threads(1); torch.manual_seed(42)
        parent = TinyBody().eval(); before = copy.deepcopy(parent.state_dict())
        model = U2NetPaperIdentity(parent).train(); frozen = frozen_hash(model)
        inputs = torch.rand(2, 3, 32, 32)
        expected = fused_logits(parent, inputs).detach()
        initial = model(inputs).detach()
        self.assertTrue(torch.equal(initial[:, :1], expected))
        self.assertFalse(initial[:, 1:].any())
        body = torch.ones(2, 32, 32, dtype=torch.uint8)
        material = torch.zeros_like(body).float(); material[:, :, 20:] = 1; material[:, :8] = 255
        optimizer = torch.optim.Adam([p for p in model.parameters() if p.requires_grad], lr=.01)
        for _ in range(3):
            optimizer.zero_grad(); logits = model(inputs); logits.retain_grad()
            joint_material_loss(logits, body, material).backward()
            self.assertEqual(float(logits.grad[:, 1, :8].abs().sum()), 0)
            optimizer.step()
        final = model(inputs).detach()
        self.assertTrue(torch.equal(final[:, :1], expected))
        self.assertFalse(torch.equal(final[:, 1:], initial[:, 1:]))
        self.assertEqual(frozen_hash(model), frozen)
        self.assertTrue(all(p.grad is None for p in model.body.parameters()))
        self.assertTrue(all(torch.equal(v, before[k]) for k, v in parent.state_dict().items()))
        self.assertTrue(all(not module._forward_hooks for module in model.body.modules()))
        self.assertTrue(all(not m.training for m in model.body.modules()))

    def test_capture_hooks_are_removed_if_parent_raises(self):
        class Broken(TinyBody):
            def forward(self, inputs):
                self.stage1d(inputs)
                raise RuntimeError('fixture failure')
        model = U2NetPaperIdentity(Broken())
        with self.assertRaisesRegex(RuntimeError, 'fixture failure'):
            model(torch.zeros(1, 3, 32, 32))
        self.assertTrue(all(not module._forward_hooks for module in model.body.modules()))

    def test_square_labels_match_independent_existing_compiler(self):
        body = {'sourceSize': [200, 200], 'foregroundPolygons': [[[20, 20], [180, 20], [180, 180], [20, 180]]],
                'unknownPolygons': [[[90, 75], [110, 75], [110, 125], [90, 125]]], 'boundaryUncertaintyPixels': 3}
        item = {'boundaryUncertaintyPixels': 2, 'papers': {
            'paperA': {'polygons': [[[25, 25], [95, 25], [95, 175], [25, 175]]]},
            'paperB': {'polygons': [[[105, 25], [175, 25], [175, 175], [105, 175]]]}}}
        for n in [64, 320]:
            a, b = stretched_material_labels(item, body, n)
            x, y, _ = rasterize_materials(item, body, n)
            self.assertTrue(np.array_equal(a, x)); self.assertTrue(np.array_equal(b, y))
            self.assertTrue(np.all(b[a != 1] == 255))
            self.assertTrue(np.any((a == 1) & (b == 255)))

    def test_anisotropic_labels_keep_source_pixel_uncertainty(self):
        body = {'sourceSize': [200, 100], 'foregroundPolygons': [[[10, 10], [190, 10], [190, 90], [10, 90]]],
                'unknownPolygons': [], 'boundaryUncertaintyPixels': 1}
        item = {'boundaryUncertaintyPixels': 3, 'papers': {
            'paperA': {'polygons': [[[20, 20], [90, 20], [90, 80], [20, 80]]]},
            'paperB': {'polygons': [[[110, 20], [180, 20], [180, 80], [110, 80]]]}}}
        _, actual = stretched_material_labels(item, body, 100)
        yy, xx = np.mgrid[:100, :100]; x, y = (xx+.5)*2, yy+.5
        expected = np.full((100, 100), 255, dtype=np.uint8)
        expected[(x > 23) & (x < 87) & (y > 23) & (y < 77)] = 0
        expected[(x > 113) & (x < 177) & (y > 23) & (y < 77)] = 1
        self.assertTrue(np.array_equal(actual, expected))
        item['papers']['paperB'] = copy.deepcopy(item['papers']['paperA'])
        with self.assertRaisesRegex(ValueError, 'overlap'):
            stretched_material_labels(item, body, 100)


if __name__ == '__main__': unittest.main()
