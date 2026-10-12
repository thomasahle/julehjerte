import unittest
import numpy as np
from coverage import junction_types


def edge(a, b, visible=True):
    a, b = np.array(a), np.array(b)
    return {'visible': visible, 'cubic': [a.tolist(), ((2*a+b)/3).tolist(), ((a+2*b)/3).tolist(), b.tolist()]}


class CoverageTests(unittest.TestCase):
    def test_hidden_shared_edges_do_not_change_visible_corner_type(self):
        graph = {'edges': [edge([0, 10], [0, 0]), edge([0, 0], [10, 0]), edge([0, 0], [10, 10], False)]}
        self.assertEqual(junction_types(graph), {'right': 1})

    def test_smooth_knots_are_excluded_and_branches_are_separate(self):
        self.assertEqual(junction_types({'edges': [edge([-10, 0], [0, 0]), edge([0, 0], [10, 0])]}), {})
        self.assertEqual(junction_types({'edges': [edge([0, 0], p) for p in [[-10, 0], [10, 0], [0, 10], [0, -10]]]}), {'branch': 1})


if __name__ == '__main__':
    unittest.main()
