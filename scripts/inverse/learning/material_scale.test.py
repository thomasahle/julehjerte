import copy
import unittest

import numpy as np

from material_scale import scaled_transform, at_label_centres


class MaterialScaleTest(unittest.TestCase):
    def test_fractional_padding_preserves_source_window_and_input(self):
        transform = {'scale': 256/1334, 'offset': [(256-1000*256/1334)/2, 0], 'resolution': 256}
        original = copy.deepcopy(transform)
        changed = scaled_transform(transform, 512)
        for axis in range(2):
            for edge in [0, 1]:
                before = (edge*256-transform['offset'][axis])/transform['scale']
                after = (edge*512-changed['offset'][axis])/changed['scale']
                self.assertAlmostEqual(before, after)
        self.assertEqual(transform, original)

    def test_linear_fields_sample_the_same_continuous_centres(self):
        yy, xx = np.mgrid[:64, :64]
        probability = np.stack([(xx+.5)/64, (yy+.5)/64]).astype(np.float32)
        result = at_label_centres(probability, 32)
        y, x = np.mgrid[:32, :32]
        np.testing.assert_array_equal(result, np.stack([(x+.5)/32, (y+.5)/32]))
        np.testing.assert_array_equal(at_label_centres(probability, 64), probability)

    def test_invalid_fields_and_transforms_are_rejected(self):
        transform = {'scale': 1, 'offset': [0, 0], 'resolution': 256}
        for resolution in [0, 31, 33, 64.5]:
            with self.assertRaises(ValueError): scaled_transform(transform, resolution)
        for value in [np.nan, np.inf, -1, 2]:
            values = np.zeros((2, 4, 4), np.float32); values[0, 0, 0] = value
            with self.assertRaises(ValueError): at_label_centres(values, 2)


if __name__ == '__main__':
    unittest.main()
