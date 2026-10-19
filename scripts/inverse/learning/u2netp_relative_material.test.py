import unittest

import torch
from torch import nn

from u2netp_relative_material import relative_material_features, identity_model


class RelativeMaterialTests(unittest.TestCase):
    def setUp(self):
        torch.set_num_threads(1); torch.manual_seed(7)

    def test_common_exposure_and_per_channel_offsets_cancel(self):
        features = torch.randn(2, 20, 12, 14)
        features[:, 19:20] = torch.rand(2, 1, 12, 14)
        changed = features.clone()
        changed[:, 16:19] = features[:, 16:19]*.35+torch.tensor([.3, -.5, .8])[None, :, None, None]
        actual = relative_material_features(features)
        self.assertTrue(torch.allclose(actual, relative_material_features(changed), atol=2e-6, rtol=1e-6))
        self.assertTrue(torch.equal(actual[:, :16], features[:, :16]))
        self.assertTrue(torch.equal(actual[:, 19:], features[:, 19:]))
        separate = torch.cat([relative_material_features(features[i:i+1]) for i in range(2)])
        self.assertTrue(torch.equal(actual, separate))

    def test_background_does_not_change_foreground_colour_statistics(self):
        features = torch.randn(1, 20, 10, 10); features[:, 19] = 0; features[:, 19, 2:8, 2:8] = 1
        changed = features.clone(); changed[:, 16:19, :2] = 50
        expected, actual = relative_material_features(features), relative_material_features(changed)
        self.assertTrue(torch.equal(expected[:, :, 2:8, 2:8], actual[:, :, 2:8, 2:8]))

    def test_constant_body_and_colour_are_finite(self):
        features = torch.ones(2, 20, 8, 8)
        features[0, 19] = 0; features[1, 19] = .5
        actual = relative_material_features(features)
        self.assertTrue(torch.isfinite(actual).all())
        self.assertEqual(float(actual[:, 16:19].abs().sum()), 0)

    def test_model_preserves_body_and_head_parameterization(self):
        class Body(nn.Module):
            def __init__(self):
                super().__init__()
                self.stage1d = nn.Conv2d(3, 64, 1); self.stage2d = nn.Conv2d(64, 64, 1)
                self.stage3d = nn.Conv2d(64, 64, 1); self.outconv = nn.Conv2d(64, 1, 1)
            def forward(self, inputs):
                return (self.outconv(self.stage3d(self.stage2d(self.stage1d(inputs)))).sigmoid(),)
        body = Body(); raw = identity_model(body)
        relative = identity_model(body, 'body-relative-rgb'); relative.load_state_dict(raw.state_dict(), strict=True)
        rgb = torch.rand(1, 3, 16, 16)
        self.assertTrue(torch.equal(raw(rgb)[:, :1], relative(rgb)[:, :1]))
        self.assertEqual(list(raw.state_dict()), list(relative.state_dict()))
        self.assertFalse(relative.identity._forward_pre_hooks)
        with self.assertRaisesRegex(ValueError, 'Unknown'):
            identity_model(body, 'other')


if __name__ == '__main__': unittest.main()
