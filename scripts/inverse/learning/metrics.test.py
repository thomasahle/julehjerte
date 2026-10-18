import unittest
import json
from pathlib import Path
import numpy as np
from scipy.ndimage import label, binary_dilation
from data import point_counts, scores
from metrics import thin_boundary, pixel_matching_counts, thin_matching_counts


class BoundaryMetricTests(unittest.TestCase):
    def test_almost_coincident_photographic_contours(self):
        fixture = json.loads(Path(__file__).with_name('matching-fixture.json').read_text())
        prediction, target = [np.zeros(fixture['shape'], bool) for _ in range(2)]
        prediction.flat[fixture['prediction']] = True
        target.flat[fixture['target']] = True
        for radius, expected in fixture['expectedCounts'].items():
            self.assertEqual(pixel_matching_counts(prediction, target, int(radius)), expected)

    def test_sparse_matching_agrees_with_dense_assignment(self):
        rng = np.random.default_rng(132)
        for _ in range(40):
            a, b = rng.random((8, 8)) < .1, rng.random((8, 8)) < .1
            for radius in [0, 1, 2.5, 3]:
                self.assertEqual(pixel_matching_counts(a, b, radius),
                                 point_counts(np.argwhere(a), np.argwhere(b), radius))

    def test_duplicate_parallel_lines_do_not_inflate_precision(self):
        truth = np.zeros((30, 60), bool); truth[15, 5:55] = True
        doubled = truth.copy(); doubled[17, 5:55] = True
        self.assertEqual(pixel_matching_counts(doubled, truth, 3), [50, 100, 50])
        self.assertEqual(thin_matching_counts(doubled, truth, np.ones_like(truth))['3'], [50, 100, 50])

    def test_shared_thinning_removes_ribbon_advantage(self):
        truth = np.zeros((40, 80), bool); truth[20, 5:75] = True
        ribbon = binary_dilation(truth, iterations=3)
        raw = scores(pixel_matching_counts(ribbon, truth, 3))
        thinned = scores(thin_matching_counts(ribbon, truth, np.ones_like(truth))['3'])
        self.assertLess(raw['precision'], .2)
        self.assertGreater(thinned['f1'], .95)
        self.assertLessEqual(thinned['predicted'], thinned['target']+2)

    def test_translation_outside_tolerance_is_not_matched(self):
        truth = np.zeros((30, 60), bool); truth[15, 5:55] = True
        shifted = np.roll(truth, 4, axis=0)
        self.assertEqual(pixel_matching_counts(shifted, truth, 3), [0, 50, 50])
        self.assertEqual(pixel_matching_counts(shifted, truth, 4), [50, 50, 50])

    def test_thinning_preserves_components_and_holes(self):
        fixtures = []
        square = np.zeros((50, 50), bool); square[10:40, 10:40] = True; square[15:35, 15:35] = False
        fixtures.append(square)
        cross = np.zeros((50, 50), bool); cross[22:28, 5:45] = True; cross[5:45, 22:28] = True
        fixtures.append(cross)
        diagonal = binary_dilation(np.eye(50, dtype=bool), iterations=2); fixtures.append(diagonal)
        for mask in fixtures:
            thin = thin_boundary(mask)
            self.assertLess(thin.sum(), mask.sum())
            self.assertEqual(label(thin, np.ones((3, 3)))[1], label(mask, np.ones((3, 3)))[1])
            self.assertEqual(label(~np.pad(thin, 1))[1], label(~np.pad(mask, 1))[1])
            np.testing.assert_array_equal(thin_boundary(thin), thin)
            self.assertTrue((~thin | mask).all())

    def test_empty_and_tiny_components(self):
        empty = np.zeros((10, 10), bool)
        self.assertFalse(thin_boundary(empty).any())
        self.assertEqual(pixel_matching_counts(empty, empty), [0, 0, 0])
        tiny = empty.copy(); tiny[4:6, 4:6] = True
        self.assertEqual(thin_boundary(tiny).sum(), 1)
        self.assertEqual(pixel_matching_counts(tiny, empty), [0, 4, 0])

    def test_invalid_area_cannot_supply_matches(self):
        target = np.zeros((10, 10), bool); target[5, 5] = True
        prediction = np.zeros_like(target); prediction[5, 4] = True
        valid = np.ones_like(target); valid[5, 4] = False
        self.assertEqual(thin_matching_counts(prediction, target, valid)['3'], [0, 0, 1])


if __name__ == '__main__':
    unittest.main()
