"""Coordinate and prompt-selection regressions; no model download required."""
import unittest
import numpy as np
from prompted_foreground import automatic_prompts, probability_window


class PromptTests(unittest.TestCase):
    def test_largest_component_beats_confident_distractor(self):
        p = np.zeros((12, 12), np.float32)
        p[2:6, 3:7] = .7
        p[10:12, 10:12] = 1
        result = automatic_prompts(p, [0, 0, 120, 120], [120, 120], padding=0)
        self.assertEqual(result['componentPixels'], 16)
        self.assertEqual(result['componentCount'], 2)
        self.assertEqual(result['box'], [29.5, 19.5, 69.5, 59.5])
        self.assertEqual(result['point'], [44.5, 34.5])

    def test_letterbox_foreground_is_ignored(self):
        p = np.ones((10, 10), np.float32)
        p[3:7] = 0; p[4:6, 4:6] = 1
        result = automatic_prompts(p, [0, -3, 10, 7], [10, 4], padding=0)
        self.assertEqual(result['componentPixels'], 4)
        self.assertEqual(result['box'], [3.5, .5, 5.5, 2.5])
        self.assertEqual(result['point'], [4, 1])

    def test_padding_stops_at_source_bounds(self):
        result = automatic_prompts(np.ones((8, 8)), [0, 0, 80, 80], [80, 80])
        self.assertEqual(result['box'], [0, 0, 79, 79])
        self.assertEqual(result['point'], [34.5, 34.5])

    def test_empty_prediction_cannot_invent_a_prompt(self):
        self.assertIsNone(automatic_prompts(np.zeros((8, 8)), [0, 0, 8, 8], [8, 8]))

    def test_invalid_input_is_rejected(self):
        for p in [np.full((8, 8), np.nan), np.full((8, 8), 2), np.zeros(8)]:
            with self.assertRaises(ValueError):
                automatic_prompts(p, [0, 0, 8, 8], [8, 8])
        with self.assertRaises(ValueError):
            automatic_prompts(np.ones((8, 8)), [8, 0, 0, 8], [8, 8])

    def test_identity_and_shifted_source_centres(self):
        probability = np.tile([.1, .3, .6, .9], (4, 1))
        logits = np.log(probability/(1-probability))
        np.testing.assert_allclose(probability_window(logits, [0, 0, 4, 4], 4), probability, atol=1e-7)
        expected = np.tile([0, .1, .3, .6], (4, 1))
        np.testing.assert_allclose(probability_window(logits, [-1, 0, 3, 4], 4), expected, atol=1e-7)


if __name__ == '__main__':
    unittest.main()
