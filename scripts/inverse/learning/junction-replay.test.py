import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import numpy as np

spec = importlib.util.spec_from_file_location('junction_replay', Path(__file__).with_name('junction-replay.py'))
replay = importlib.util.module_from_spec(spec); spec.loader.exec_module(replay)


class RefinementTests(unittest.TestCase):
    def test_outside_observed_moves_revert_and_duplicate_proposals_remain_counted(self):
        nodes = np.array([[2.5, 2.5], [7.5, 7.5], [9.5, 9.5]], np.float32)
        moved = np.array([[1.5, 1.5], [8.5, 8.5], [8.5, 8.5]], np.float32)
        valid = np.ones((12, 12), bool); valid[1, 1] = False
        with patch.object(replay, 'refine_corners', return_value=moved.copy()):
            result = replay.bounded_refinement(valid.astype(float), nodes, valid, 5)
        np.testing.assert_array_equal(result, [[2.5, 2.5], [8.5, 8.5], [8.5, 8.5]])
        self.assertEqual(replay.point_counts(result, [[2.5, 2.5], [8.5, 8.5]]), [2, 3, 2])

    def test_empty_proposal_set_remains_empty(self):
        valid = np.ones((12, 12), bool)
        result = replay.bounded_refinement(valid.astype(float), np.empty((0, 2)), valid, 5)
        self.assertEqual(result.shape, (0, 2))


if __name__ == '__main__':
    unittest.main()
