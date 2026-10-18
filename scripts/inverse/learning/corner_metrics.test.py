"""Analytic checks for crop-reference scoring, independent of the locator."""
import unittest
import numpy as np
from corner_metrics import corner_error


class CornerMetricTests(unittest.TestCase):
    def setUp(self):
        self.reference = np.array([[0, 0], [100, 0], [100, 100], [0, 100]], float)

    def test_translation_and_reference_uncertainty(self):
        result = corner_error(self.reference+[3, 4], self.reference, 2)
        self.assertEqual(result['cornerErrorPixels'], [5]*4)
        self.assertEqual(result['maximumCornerErrorSideFraction'], .05)
        self.assertEqual(result['maximumExcessBeyondReferenceUncertaintySideFraction'], .03)

    def test_normalized_error_is_independent_of_image_scale_and_pose(self):
        angle = .37
        rotation = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
        truth = self.reference@rotation.T*3+[400, 230]
        prediction = (self.reference+[3, 4])@rotation.T*3+[400, 230]
        result = corner_error(prediction, truth, 6)
        self.assertAlmostEqual(result['maximumCornerErrorSideFraction'], .05)
        self.assertAlmostEqual(result['maximumExcessBeyondReferenceUncertaintySideFraction'], .03)

    def test_physical_corner_correspondence_is_not_optimized_away(self):
        result = corner_error(np.roll(self.reference, 1, axis=0), self.reference)
        self.assertEqual(result['maximumCornerErrorSideFraction'], 1)

    def test_missing_crop_is_not_zero_error(self):
        self.assertIsNone(corner_error(None, self.reference, 2))

    def test_uncertainty_does_not_erase_raw_error(self):
        result = corner_error(self.reference+[3, 4], self.reference, 10)
        self.assertEqual(result['maximumCornerErrorSideFraction'], .05)
        self.assertEqual(result['maximumExcessBeyondReferenceUncertaintySideFraction'], 0)

    def test_invalid_geometry_and_uncertainty_are_rejected(self):
        for quad in [self.reference[[0, 2, 1, 3]], np.zeros((4, 2)), np.full((4, 2), np.nan), self.reference[:3]]:
            with self.assertRaises(ValueError):
                corner_error(quad, self.reference)
            with self.assertRaises(ValueError):
                corner_error(self.reference, quad)
        for uncertainty in [-1, float('nan'), float('inf')]:
            with self.assertRaises(ValueError):
                corner_error(self.reference, self.reference, uncertainty)


if __name__ == '__main__':
    unittest.main()
