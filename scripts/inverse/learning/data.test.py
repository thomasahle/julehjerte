import unittest
import numpy as np
from data import observable_nodes, projected_polyline, project, bezier, point_counts, node_heatmap, detect_nodes


def line(a, b):
    a, b = np.array(a), np.array(b)
    return [a, (2*a+b)/3, (a+2*b)/3, b]


class LabelTests(unittest.TestCase):
    def test_straight_subdivisions_are_not_junctions(self):
        matrix = np.eye(3)
        unsplit = observable_nodes([line([10, 10], [90, 10])], matrix)
        split = observable_nodes([line([10, 10], [50, 10]), line([50, 10], [90, 10])], matrix)
        np.testing.assert_allclose(unsplit, split)
        self.assertEqual(len(split), 0)

    def test_turn_and_crossing_are_observable(self):
        corner = observable_nodes([line([10, 10], [50, 10]), line([50, 10], [50, 90])], np.eye(3))
        self.assertTrue(any(np.allclose(p, [50, 10]) for p in corner))
        cross = observable_nodes([line([50, 50], p) for p in [[10, 50], [90, 50], [50, 10], [50, 90]]], np.eye(3))
        self.assertEqual(len(cross), 1)

    def test_projected_curve_is_not_transformed_control_polygon(self):
        controls = [[0, 0], [10, 90], [70, 20], [100, 100]]
        h = [1, 0, 0, 0, 1, 0, .01, 0, 1]
        true_mid = project(h, [bezier(controls, .5)])[0]
        naive = bezier(project(h, controls), .5)
        self.assertGreater(np.linalg.norm(true_mid-naive), 1)
        points = projected_polyline(controls, h, .02)
        self.assertLess(min(np.linalg.norm(p-true_mid) for p in points), 1e-6)

    def test_duplicate_predictions_cannot_inflate_recall(self):
        self.assertEqual(point_counts([[9, 10], [11, 10], [50, 50]], [[10, 10], [90, 90]]), [1, 3, 2])
        self.assertEqual(point_counts([], [[10, 10]]), [0, 0, 1])

    def test_half_pixel_coordinate_convention(self):
        points = np.array([[10.5, 20.5], [60.5, 50.5]])
        recovered = detect_nodes(node_heatmap(points, 80), .5)
        np.testing.assert_allclose(recovered, points)

    def test_half_precision_evaluation_predictions(self):
        points = np.array([[10.5, 20.5], [60.5, 50.5]])
        recovered = detect_nodes(node_heatmap(points, 80).astype(np.float16), .5)
        np.testing.assert_allclose(recovered, points)

    def test_tied_peak_is_one_detection(self):
        points = np.array([[10, 20], [60, 50]])
        for dtype in [np.float32, np.float16]:
            recovered = detect_nodes(node_heatmap(points, 80).astype(dtype), .5)
            self.assertEqual(point_counts(recovered, points), [2, 2, 2])


if __name__ == '__main__':
    unittest.main()
