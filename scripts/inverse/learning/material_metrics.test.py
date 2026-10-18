"""Analytic failures that a two-paper evaluation must keep visible."""
import copy
import unittest
import numpy as np
from material_metrics import material_metrics


def case(body, material, predicted_body, predicted_material, identity='heart'):
    item = {'id': identity, 'body': np.array([body], dtype=np.uint8),
            'materials': np.array([material], dtype=float)}
    probability = np.array([[predicted_body], [predicted_material]], dtype=float)
    return item, probability


class MaterialMetricsTest(unittest.TestCase):
    def score(self, values):
        item, probability = values
        return material_metrics([probability], [item])['rows'][0]

    def test_global_exchange_is_equivalent_but_local_exchange_is_wrong(self):
        values = case([1]*4, [0, 0, 1, 1], [1]*4, [0, 0, 1, 1])
        self.assertEqual(self.score(values)['materialJointError'], 0.)
        values[1][1] = 1-values[1][1]
        self.assertTrue(self.score(values)['materialPhaseExchanged'])
        self.assertEqual(self.score(values)['materialJointError'], 0.)
        values[1][1, 0] = [0, 1, 1, 0]
        self.assertEqual(self.score(values)['materialPixelError'], .5)
        self.assertEqual(self.score(values)['materialJointError'], .5)

    def test_missing_paper_cannot_improve_joint_error_or_change_denominator(self):
        values = case([1]*4, [0, 0, 1, 1], [1]*4, [0, 1, 1, 1])
        before = self.score(values)
        values[1][0, 0, 1] = 0  # Hide exactly the wrong material prediction.
        after = self.score(values)
        self.assertEqual(before['materialPixelError'], .25)
        self.assertEqual(after['materialPixelError'], .25)
        self.assertEqual(after['materialJointError'], .25)
        self.assertEqual(after['jointKnownPixels'], 4)
        values[1][0] = 0  # Hide every paper pixel.
        self.assertEqual(self.score(values)['materialJointError'], 1.)
        self.assertEqual(self.score(values)['bodyIoU'], 0.)

    def test_unknown_labels_do_not_become_background_or_hide_known_body(self):
        values = case([1, 1, 0, 255], [0, 255, 255, 255], [1, 0, 1, 1], [0, 1, 1, 0])
        row = self.score(values)
        self.assertEqual(row['bodyPixelError'], 2/3)
        self.assertEqual(row['materialJointError'], 0.)
        self.assertEqual(row['jointRegionPixelError'], .5)
        self.assertEqual(row['jointKnownPixels'], 2)
        self.assertEqual(row['knownBodyWithoutMaterialPixels'], 1)
        values[1][:, 0, 3] = 1-values[1][:, 0, 3]
        self.assertEqual(row, self.score(values))

    def test_fractional_coverage_is_not_thresholded(self):
        row = self.score(case([1, 1], [.25, .75], [1, 1], [0, 1]))
        self.assertEqual(row['materialPixelError'], .25)
        self.assertEqual(row['materialJointError'], .25)
        self.assertFalse(row['materialPhaseExchanged'])

    def test_phase_uses_all_material_evidence_even_when_body_is_missed(self):
        row = self.score(case([1]*4, [0, 0, 1, 1], [1, 0, 0, 0], [1, 0, 1, 1]))
        self.assertFalse(row['materialPhaseExchanged'])
        self.assertEqual(row['materialPixelError'], .25)
        self.assertEqual(row['materialJointError'], 1.)

    def test_unlabelled_material_has_no_claimed_perfect_score(self):
        item, p = case([1, 0], [255, 255], [1, 0], [0, 1])
        result = material_metrics([p], [item])
        self.assertIsNone(result['macroMean']['materialPixelError'])
        self.assertEqual(result['contributingInstances']['materialPixelError'], 0)
        self.assertEqual(result['macroMean']['bodyPixelError'], 0.)
        self.assertEqual(result['rows'][0]['jointKnownPixels'], 1)

    def test_each_image_gets_one_assignment_and_inputs_stay_unchanged(self):
        a, pa = case([1, 1], [0, 1], [1, 1], [0, 1], 'a')
        b, pb = case([1, 1], [0, 1], [1, 1], [1, 0], 'b')
        items, ps = [a, b], [pa, pb]; old = copy.deepcopy((items, ps))
        result = material_metrics(ps, items)
        self.assertEqual([r['materialPhaseExchanged'] for r in result['rows']], [False, True])
        self.assertEqual(result['macroMean']['materialJointError'], 0.)
        for i, item in enumerate(items):
            for key in ['body', 'materials']: np.testing.assert_array_equal(item[key], old[0][i][key])
            np.testing.assert_array_equal(ps[i], old[1][i])
        with self.assertRaisesRegex(ValueError, 'Duplicate'): material_metrics([pa, pa], [a, a])

    def test_invalid_probabilities_and_labels_are_rejected(self):
        a, p = case([1, 0], [0, 255], [1, 0], [0, 1])
        for bad in [np.nan, np.inf, -1, 2]:
            q = p.copy(); q[1, 0, 0] = bad
            with self.assertRaisesRegex(ValueError, 'probabilities'): material_metrics([q], [a])
        for bad in [-1, 2, np.nan]:
            b = copy.deepcopy(a); b['materials'][0, 0] = bad
            with self.assertRaisesRegex(ValueError, 'fractional'): material_metrics([p], [b])
        b = copy.deepcopy(a); b['materials'][0, 1] = 1
        with self.assertRaisesRegex(ValueError, 'known body'): material_metrics([p], [b])
        b['body'][:] = 255; b['materials'][:] = 255
        with self.assertRaisesRegex(ValueError, 'known body'): material_metrics([p], [b])
        with self.assertRaisesRegex(ValueError, 'one prediction'): material_metrics([], [a])


if __name__ == '__main__': unittest.main()
