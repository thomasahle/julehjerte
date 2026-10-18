"""Analytic visibility, projection and split contracts for occlusion labels."""
import copy
from types import SimpleNamespace
import unittest

import numpy as np

from occlusion import composite, ribbon_coverage, ribbon_polygon, ribbon_spec, training_rows, visibility_labels


def camera(matrix=None):
    return {'schema': 'woven-heart-synthetic-view-1', 'resolution': 32,
            'canonicalToPhoto': matrix or [1, 0, 16, 0, 1, 16, 0, 0, 1]}


class OcclusionTests(unittest.TestCase):
    def test_axis_aligned_fractional_area_matches_exact_rectangle_intersection(self):
        spec = {'angle': 0., 'start': -6., 'end': 8.25, 'width': 4.25}
        actual = ribbon_coverage(camera(), spec, 8)
        x, y = np.arange(32), np.arange(32)
        horizontal = np.clip(np.minimum(x+1, 24.25)-np.maximum(x, 10), 0, 1)
        vertical = np.clip(np.minimum(y+1, 18.125)-np.maximum(y, 13.875), 0, 1)
        np.testing.assert_array_equal(actual, vertical[:, None]*horizontal)
        self.assertGreater(int(((actual > 0) & (actual < 1)).sum()), 0)

    def test_projective_sampling_matches_independent_polygon_halfplanes(self):
        labels = camera([.8, -.3, 16, .2, .7, 16, .001, -.002, 1])
        spec = {'angle': .6, 'start': -20., 'end': 10., 'width': 4.8}
        points = np.column_stack([ribbon_polygon(spec), np.ones(4)]) @ np.array(labels['canonicalToPhoto']).reshape(3, 3).T
        polygon = points[:, :2]/points[:, 2:]
        yy, xx = np.mgrid[:32*8, :32*8]
        samples = np.stack([(xx+.5)/8, (yy+.5)/8], axis=-1)
        signs = []
        for a, b in zip(polygon, np.roll(polygon, -1, axis=0)):
            d, q = b-a, samples-a
            signs.append(d[0]*q[..., 1]-d[1]*q[..., 0])
        signs = np.stack(signs)
        inside = (signs >= 0).all(axis=0) | (signs <= 0).all(axis=0)
        expected = inside.reshape(32, 8, 32, 8).mean((1, 3))
        np.testing.assert_array_equal(ribbon_coverage(labels, spec, 8), expected)

    def test_visible_and_hidden_partition_paper_but_occluders_can_cover_background(self):
        body = np.array([[1, 1, 0], [1, 0, 0]], dtype=np.float32)
        support = np.array([[1, 1, 0], [0, 0, 0]], dtype=np.float32)
        coverage = np.array([[0, 1, 1], [.25, .5, 0]], dtype=np.float32)
        fields = visibility_labels(body, support, coverage)
        np.testing.assert_array_equal(fields['visibleBody']+fields['occludedBody'], body)
        self.assertEqual(fields['occludedBody'][0, 2], 0)
        self.assertEqual(fields['occluderCoverage'][0, 2], 1)
        self.assertEqual(fields['materialObservation'][0, 1], 0)
        self.assertEqual(fields['materialObservation'][1, 0], 0)
        fields['amodalBody'][:] = 0
        self.assertEqual(body.sum(), 3)

    def test_composition_preserves_uncovered_pixels_and_removes_hidden_rgb(self):
        rgb = np.full((2, 3, 3), [100, 80, 60], dtype=np.uint8)
        coverage = np.array([[0, .5, 1], [1, .25, 0]], dtype=np.float32)
        result = composite(rgb, coverage, [20, 40, 60])
        np.testing.assert_array_equal(result[0], [[100, 80, 60], [60, 60, 60], [20, 40, 60]])
        np.testing.assert_array_equal(rgb, np.full((2, 3, 3), [100, 80, 60], dtype=np.uint8))

    def test_selection_uses_experimental_training_groups_not_parent_train(self):
        rows = [{'geometrySha256': g, 'key': g+v, 'split': 'train', 'experimentalSplit': role}
                for g, role in [('a', 'development'), ('b', 'train'), ('c', 'train'), ('d', 'recipe-test')]
                for v in ['1', '0']]
        corpus = SimpleNamespace(rows=list(reversed(rows)))
        self.assertEqual([r['key'] for r in training_rows(corpus, 2)], ['b0', 'c0'])
        with self.assertRaisesRegex(ValueError, 'Not enough'):
            training_rows(corpus, 3)
        corpus.rows.append({**rows[2], 'experimentalSplit': 'development'})
        with self.assertRaisesRegex(ValueError, 'crosses experimental'):
            training_rows(corpus, 2)

    def test_spec_is_stable_and_projection_does_not_change_labels(self):
        self.assertEqual(ribbon_spec('a'), ribbon_spec('a'))
        self.assertNotEqual(ribbon_spec('a'), ribbon_spec('b'))
        labels = camera(); old = copy.deepcopy(labels)
        coverage = ribbon_coverage(labels, ribbon_spec('a'))
        self.assertGreaterEqual(coverage[16, 16], .9)
        self.assertEqual(labels, old)

    def test_invalid_coverage_and_projective_horizon_are_rejected(self):
        ones = np.ones((2, 2))
        for bad in [ones*np.nan, ones*1.1, ones[:1]]:
            with self.assertRaises(ValueError): visibility_labels(ones, ones, bad)
        labels = camera([1, 0, 16, 0, 1, 16, .1, 0, 1])
        with self.assertRaisesRegex(ValueError, 'horizon'):
            ribbon_coverage(labels, ribbon_spec('a'))
        with self.assertRaises(ValueError): composite(np.zeros((2, 2, 3), np.uint8), ones, [np.nan, 0, 0])


if __name__ == '__main__': unittest.main()
