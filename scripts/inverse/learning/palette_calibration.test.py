import unittest
import numpy as np
from palette_calibration import mixture, calibrate


class CalibrationTest(unittest.TestCase):
    def test_scalar_illumination_preserves_material_fraction(self):
        colors = np.array([[.7, .06, .05], [.8, .8, .75]])
        p = np.linspace(0, 1, 101).reshape(1, -1)
        light = np.linspace(.3, 1, 101).reshape(-1, 1)
        rgb = light[..., None]*((1-p[..., None])*colors[0]+p[..., None]*colors[1])
        actual, evidence = mixture(rgb, colors)
        self.assertEqual(evidence['model'], 'nonnegative-color-mixture')
        np.testing.assert_allclose(actual, np.broadcast_to(p, actual.shape), atol=1e-12)
        exchanged, _ = mixture(rgb, colors[::-1])
        np.testing.assert_allclose(exchanged, 1-actual, atol=1e-12)

    def test_collinear_gray_papers_use_affine_not_illumination_inference(self):
        colors = np.array([[.1, .1, .1], [.9, .9, .9]])
        rgb = np.array([[[.1, .1, .1], [.5, .5, .5], [.9, .9, .9]]])
        p, evidence = mixture(rgb, colors)
        self.assertEqual(evidence['model'], 'affine-color-segment')
        np.testing.assert_allclose(p, [[0, .5, 1]], atol=1e-12)

    def test_source_padding_cannot_supply_paper_samples(self):
        rgb = np.zeros((20, 20, 3), np.uint8)
        rgb[5:15, 5:10] = [180, 15, 15]
        rgb[5:15, 10:15] = [230, 230, 220]
        body = np.ones((20, 20), np.float32)
        material = np.zeros_like(body)+.05; material[:, 10:] = .95
        valid = np.zeros_like(body, bool); valid[5:15, 5:15] = True
        before, evidence = calibrate(rgb, body, material, valid)
        self.assertTrue(evidence['applied']); self.assertEqual(evidence['seedCounts'], [50, 50])
        rgb[~valid] = [0, 255, 0]
        after, other = calibrate(rgb, body, material, valid)
        np.testing.assert_array_equal(before, after); self.assertEqual(evidence, other)
        np.testing.assert_array_equal(after[~valid], material[~valid])
        exchanged, _ = calibrate(rgb, body, 1-material, valid)
        np.testing.assert_allclose(exchanged[valid], 1-after[valid], atol=1e-6)

    def test_rgb_palette_does_not_depend_on_network_material_guesses(self):
        rgb = np.empty((20, 20, 3), np.uint8)
        rgb[:, :10] = [180, 15, 15]; rgb[:, 10:] = [230, 230, 220]
        body = np.ones((20, 20), np.float32); valid = np.ones_like(body, bool)
        a = np.zeros_like(body); b = np.random.default_rng(7).random(body.shape).astype(np.float32)
        saved = [v.copy() for v in (rgb, body, a, b, valid)]
        first, evidence = calibrate(rgb, body, a, valid, palette='rgb')
        second, other = calibrate(rgb, body, b, valid, palette='rgb')
        self.assertTrue(evidence['applied']); self.assertEqual(evidence, other)
        np.testing.assert_array_equal(first, second)
        np.testing.assert_allclose(first[:, :10], 0, atol=1e-6)
        np.testing.assert_allclose(first[:, 10:], 1, atol=1e-6)
        for value, original in zip((rgb, body, a, b, valid), saved):
            np.testing.assert_array_equal(value, original)

    def test_rgb_palette_rejects_indistinguishable_papers_without_losing_prediction(self):
        rgb = np.full((20, 20, 3), 120, np.uint8)
        material = np.random.default_rng(7).random((20, 20)).astype(np.float32)
        actual, evidence = calibrate(rgb, np.ones_like(material), material, np.ones_like(material, bool), palette='rgb')
        self.assertFalse(evidence['applied'])
        np.testing.assert_array_equal(actual, material)
        self.assertFalse(np.shares_memory(actual, material))

    def test_invalid_probabilities_are_not_silently_converted_to_a_fallback(self):
        rgb = np.zeros((20, 20, 3), np.uint8)
        body = np.ones((20, 20), np.float32); material = np.zeros_like(body); valid = np.ones_like(body, bool)
        for bad in [np.nan, np.inf, -0.1, 1.1]:
            material[0, 0] = bad
            with self.assertRaises(ValueError):
                calibrate(rgb, body, material, valid, palette='rgb')

    def test_insufficient_evidence_preserves_network_prediction(self):
        p = np.full((12, 12), .5, np.float32)
        out, evidence = calibrate(np.full((12, 12, 3), 120, np.uint8), np.ones_like(p), p, np.ones_like(p, bool))
        self.assertFalse(evidence['applied']); np.testing.assert_array_equal(out, p)


if __name__ == '__main__':
    unittest.main()
