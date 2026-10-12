import unittest
import numpy as np
from classical import corner_response
from data import detect_nodes, point_counts


class ClassicalTests(unittest.TestCase):
    def test_flat_and_straight_edges_do_not_create_corners(self):
        flat = np.ones((64, 64), np.float32)
        straight = flat.copy(); straight[:, :32] = 0
        self.assertEqual(float(corner_response(flat).max()), 0)
        self.assertEqual(float(corner_response(straight).max()), 0)

    def test_right_angle_and_checker_junction_are_localized(self):
        angle = np.zeros((64, 64), np.float32); angle[32:, 32:] = 1
        checker = angle.copy(); checker[:32, :32] = 1
        for mask in [angle, checker, 1-angle, 1-checker]:
            response = corner_response(mask)
            nodes = detect_nodes(response, threshold=1e-5)
            self.assertEqual(point_counts(nodes, [[32, 32]]), [1, 1, 1])


if __name__ == '__main__':
    unittest.main()
