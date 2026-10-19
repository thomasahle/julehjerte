import importlib.util
from pathlib import Path
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location('audit_u2netp', Path(__file__).with_name('audit-u2netp-body.py'))
audit = importlib.util.module_from_spec(spec); spec.loader.exec_module(audit)


class ReplayTests(unittest.TestCase):
    def test_unit_interval_float32_roundoff_is_reported_without_claiming_exactness(self):
        before = np.array([.2, .7], np.float32); after = before+np.finfo(np.float32).eps
        result = audit.prediction_agreement(after, before)
        self.assertTrue(result['passed']); self.assertFalse(result['exact'])

    def test_one_threshold_change_fails_even_with_sub_epsilon_difference(self):
        before = np.array([.5], np.float32); after = np.nextafter(before, np.float32(0))
        result = audit.prediction_agreement(after, before)
        self.assertFalse(result['passed']); self.assertEqual(result['changedHalfThresholdPixels'], 1)

    def test_larger_float_drift_fails_even_when_thresholds_stay_equal(self):
        before = np.array([.1], np.float32)
        self.assertFalse(audit.prediction_agreement(before+1e-6, before)['passed'])


if __name__ == '__main__': unittest.main()
