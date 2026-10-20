import unittest

import numpy as np
import torch

from paper_exemplars import canonical_grid, fit_exemplars, lobe_samples, overlap_region, quad_transform


class PaperExemplarTests(unittest.TestCase):
    def test_projective_quad_roundtrip_and_lobes_exclude_overlap(self):
        matrix = np.array([[120., 35., 80.], [-20., 115., 110.], [.12, -.06, 1.]])
        corners = np.array([[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]])@matrix.T
        recovered = quad_transform(corners[:, :2]/corners[:, 2:])
        np.testing.assert_allclose(recovered, matrix, atol=1e-12)
        samples = lobe_samples(matrix, 160, (320, 320))
        overlap = overlap_region(matrix, 160, (320, 320))
        self.assertGreater(samples.sum((1, 2)).min(), 32)
        self.assertFalse((samples[0] & samples[1]).any())
        self.assertFalse((samples & overlap).any())

    def test_pixel_centres_and_camera_scale(self):
        matrix = np.array([[100., 0., 50.], [0., 100., 50.], [0., 0., 1.]])
        x, y = canonical_grid(matrix, 100, (200, 200))
        self.assertAlmostEqual(x[0, 0], -.49)
        self.assertAlmostEqual(y[-1, 0], 1.49)
        scaled = matrix.copy(); scaled[:2] *= 2
        for a, b in zip(canonical_grid(matrix, 100, (200, 200)), canonical_grid(scaled, 100, (400, 400))):
            np.testing.assert_array_equal(a, b)

    def test_labels_exchange_globally_and_equal_size_samples_are_balanced(self):
        features = np.zeros((20, 20, 2), np.float32)
        features[:, 10:, 0] = 1
        features[..., 1] = np.indices((20, 20))[0]/20
        support = np.zeros((2, 20, 20), bool)
        support[0, :8, :8] = True
        support[1, :4, 12:] = True
        score, record = fit_exemplars(features, support)
        exchanged, other = fit_exemplars(features, support[::-1])
        np.testing.assert_allclose(exchanged, -score, atol=1e-6)
        self.assertEqual(record['samplesPerPaper'], 32)
        self.assertEqual(other['samplesPerPaper'], 32)
        self.assertTrue((score[:, :10] < 0).all())
        self.assertTrue((score[:, 10:] > 0).all())

    def test_missing_lobe_and_invalid_quads_are_failures(self):
        with self.assertRaisesRegex(ValueError, 'Too few'):
            fit_exemplars(np.zeros((10, 10, 3)), np.zeros((2, 10, 10), bool))
        with self.assertRaises(ValueError):
            quad_transform([[0, 0], [1, 1], [0, 1], [1, 0]])
        with self.assertRaises(ValueError):
            quad_transform(np.zeros((4, 2)))

    def test_query_pixels_do_not_affect_fitted_normalization(self):
        rng = np.random.default_rng(4)
        features = rng.normal(size=(20, 20, 4)).astype(np.float32)
        support = np.zeros((2, 20, 20), bool)
        support[0, :4, :] = True; support[1, -4:, :] = True
        changed = features.copy(); changed[8:12] = 1000
        original, _ = fit_exemplars(features, support)
        proposal, _ = fit_exemplars(changed, support)
        np.testing.assert_array_equal(original[:8], proposal[:8])
        np.testing.assert_array_equal(original[12:], proposal[12:])


if __name__ == '__main__':
    torch.set_num_threads(1)
    unittest.main()
