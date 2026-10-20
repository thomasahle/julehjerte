import unittest

import numpy as np

from material_pair_metrics import paired_identity_metrics


class PairMetricsTests(unittest.TestCase):
    def setUp(self):
        target = np.zeros((8, 8)); target[3:6, 3:6] = 1; target[0] = 255
        self.items = [{'id': 'geometry'+suffix, 'body': np.ones_like(target), 'materials': target,
                       'evidence': {'kind': 'synthetic-'+kind}}
                      for suffix, kind in [('', 'original'), ('--print', 'printed'), ('--scene', 'scene')]]
        self.predictions = np.zeros((3, 2, 8, 8))
        self.predictions[:, 1] = np.where(target == 1, .9, .1)
        self.metrics = {'rows': [{'id': item['id'], 'materialPhaseExchanged': False, 'materialPixelError': 0.}
                                 for item in self.items]}

    def test_phase_and_unknown_pixels_do_not_change_consistency(self):
        self.predictions[1, 1] = 1-self.predictions[1, 1]
        self.metrics['rows'][1]['materialPhaseExchanged'] = True
        self.predictions[2, 1, 0] = .8
        result = paired_identity_metrics(self.predictions, self.items, self.metrics)
        for row in result['rows']:
            self.assertLess(row['probabilityMSE'], 1e-30)
            self.assertEqual(row['hardDisagreement'], 0)
            self.assertEqual(row['knownPixels'], 56)

    def test_visible_change_is_counted_even_when_body_is_missing(self):
        self.predictions[:, 0] = 0
        self.predictions[1, 1, 1, 1] = .9
        self.metrics['rows'][1]['materialPixelError'] = 1/56
        result = paired_identity_metrics(self.predictions, self.items, self.metrics)
        printed = result['groups']['synthetic-printed']
        self.assertAlmostEqual(printed['hardDisagreement'], 1/56)
        self.assertAlmostEqual(printed['probabilityMSE'], .8**2/56)
        self.assertAlmostEqual(printed['materialErrorChange'], 1/56)

    def test_misaligned_records_are_rejected(self):
        self.metrics['rows'][1]['id'] = 'wrong'
        with self.assertRaises(ValueError):
            paired_identity_metrics(self.predictions, self.items, self.metrics)


if __name__ == '__main__':
    unittest.main()
