import math
import unittest

import numpy as np
import torch

from body_outline import outline_band, outline_bce, outline_options
from real_foreground import masked_foreground_loss


class OutlineTests(unittest.TestCase):
    def test_distances_match_exhaustive_known_opposite_pixel_search(self):
        labels = np.random.default_rng(31).choice([0, 1, 255], (8, 9)).astype(np.uint8)
        actual = outline_band(labels, 2)
        for y, x in np.ndindex(labels.shape):
            expected = labels[y, x] != 255 and any(
                labels[yy, xx] == 1-int(labels[y, x]) and (y-yy)**2+(x-xx)**2 <= 4
                for yy, xx in np.ndindex(labels.shape))
            self.assertEqual(actual[y, x], int(expected))

    def test_unknown_interior_hole_is_not_an_outline(self):
        labels = np.zeros((30, 30), np.uint8); labels[3:27, 3:27] = 1; labels[12:18, 12:18] = 255
        band = outline_band(labels, 3)
        self.assertEqual(int(band[9:21, 9:21].sum()), 0)
        self.assertGreater(int(band[2:6].sum()), 0)
        for axis in (0, 1):
            self.assertTrue(np.array_equal(outline_band(np.flip(labels, axis), 3), np.flip(band, axis)))

    def test_unknown_logits_cannot_change_loss_or_receive_gradient(self):
        target = torch.tensor([[[[0., 1., 0., 1.]]]])
        observed = torch.tensor([[[[1., 1., 0., 0.]]]])
        band = observed.clone(); logits = torch.zeros_like(target, requires_grad=True)
        loss = masked_foreground_loss(logits, target, observed)+.5*outline_bce(logits, target, observed, band)
        loss.backward()
        self.assertTrue(torch.equal(logits.grad[..., 2:], torch.zeros_like(logits.grad[..., 2:])))
        changed = logits.detach().clone(); changed[..., 2:] = torch.tensor([100., -100.])
        self.assertEqual(float(loss.detach()), float(masked_foreground_loss(changed, target, observed)+.5*outline_bce(changed, target, observed, band)))
        with self.assertRaises(ValueError): outline_bce(logits, target, observed, torch.ones_like(band))

    def test_equal_inner_outer_weight_and_zero_empty_band(self):
        target = torch.tensor([[[[0., 0., 0., 1.]]], [[[0., 1., 0., 1.]]]])
        observed = torch.ones_like(target); band = observed.clone(); band[1] = 0
        logits = torch.zeros_like(target)
        self.assertAlmostEqual(float(outline_bce(logits, target, observed, band)), math.log(2)/2, places=6)
        self.assertEqual(float(outline_bce(logits, target, observed, torch.zeros_like(band))), 0.)
        for value in (0, 1, 255): self.assertFalse(outline_band(np.full((5, 5), value), 2).any())

    def test_auxiliary_term_penalizes_edge_error_more_than_interior_error(self):
        labels = np.zeros((24, 24), np.uint8); labels[4:20, 4:20] = 1
        target = torch.tensor(labels[None, None], dtype=torch.float32)
        observed = torch.ones_like(target); band = torch.tensor(outline_band(labels, 2)[None, None], dtype=torch.float32)
        edge = target*8-4; interior = edge.clone(); edge[0, 0, 4, 10] = -4; interior[0, 0, 10, 10] = -4
        self.assertAlmostEqual(float(masked_foreground_loss(edge, target, observed)), float(masked_foreground_loss(interior, target, observed)), places=6)
        self.assertGreater(float(outline_bce(edge, target, observed, band)), float(outline_bce(interior, target, observed, band)))

    def test_invalid_options_fail_closed(self):
        self.assertIsNone(outline_options({}))
        for radius, weight in [(0, .5), (33, .5), (True, .5), (8, 0), (8, float('nan')), (8, True)]:
            with self.assertRaises(ValueError): outline_options({'outlineLoss': {'radiusPixels': radius, 'weight': weight}})


if __name__ == '__main__': unittest.main()
