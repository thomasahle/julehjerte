import unittest

import numpy as np
import torch

from material_grid_reference import fit_grid_reference


class MaterialGridReferenceTests(unittest.TestCase):
    def setUp(self):
        torch.set_num_threads(1)

    def test_straight_transition_and_constant_paper(self):
        labels = np.zeros((32, 32), np.float32)
        labels[:, 16:] = 1
        probability, report, grid = fit_grid_reference(labels, 16, steps=40)
        self.assertTrue(np.array_equal(probability >= .5, labels.astype(bool)))
        self.assertLess(report['finalBCE'], report['initialBCE'])
        decoded = torch.nn.functional.interpolate(torch.from_numpy(grid)[None, None], size=labels.shape, mode='bilinear', align_corners=False).sigmoid().numpy()[0, 0]
        self.assertTrue(np.array_equal(decoded, probability))
        for label in [0, 1]:
            probability, _, _ = fit_grid_reference(np.full_like(labels, label), 4, steps=10)
            self.assertTrue(np.all((probability >= .5) == bool(label)))

    def test_phase_exchange_and_unknown_pixels(self):
        labels = np.zeros((24, 24), np.float32)
        labels[5:18, 7:19] = 1
        labels[0:3] = 255
        opposite = np.where(labels == 255, 255, 1-labels)
        probability, report, grid = fit_grid_reference(labels, 12, steps=30)
        other, swapped, _ = fit_grid_reference(opposite, 12, steps=30)
        np.testing.assert_allclose(probability, 1-other, atol=2e-6, rtol=0)
        self.assertAlmostEqual(report['finalBCE'], swapped['finalBCE'], places=6)
        self.assertLess(probability[4, 4], .5)

    def test_fractional_labels_and_replay(self):
        labels = np.full((16, 16), .25, np.float32)
        a, first, _ = fit_grid_reference(labels, 8, steps=0)
        b, second, _ = fit_grid_reference(labels, 8, steps=0)
        np.testing.assert_allclose(a, .25, atol=1e-7)
        self.assertTrue(np.array_equal(a, b))
        self.assertEqual(first, second)

    def test_invalid_or_unknown_only_targets(self):
        for labels in [np.full((8, 8), 255), np.full((8, 8), np.nan),
                       np.full((8, 8), 2), np.zeros(8)]:
            with self.assertRaises(ValueError):
                fit_grid_reference(labels, 4)
        with self.assertRaises(ValueError):
            fit_grid_reference(np.zeros((8, 8)), 9)


if __name__ == '__main__':
    unittest.main()
