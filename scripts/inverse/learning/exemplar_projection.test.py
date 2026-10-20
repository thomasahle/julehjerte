import unittest

import numpy as np
import torch

from exemplar_projection import (
    ExemplarProjection, crop_context, fit_ridge, overlap_loss,
    sample_indices, score_ridge,
)
from paper_exemplars import fit_exemplar_classifier, score_exemplars


class ProjectionTest(unittest.TestCase):
    def test_ridge_matches_independent_numpy_and_frozen_query_statistics(self):
        rng = np.random.default_rng(14)
        features = rng.normal(size=(12, 10, 5)).astype(np.float32)
        support = np.zeros((2, 12, 10), bool)
        support[0, :4] = True
        support[1, -4:] = True
        indices, count = sample_indices(support)
        model = fit_ridge(torch.from_numpy(features.transpose(2, 0, 1)), indices, count)
        expected, _ = fit_exemplar_classifier(features, support)
        query = np.full((23, 27, 5), .7, np.float32)
        actual = score_ridge(torch.from_numpy(query.transpose(2, 0, 1)), model).numpy()
        np.testing.assert_allclose(actual, score_exemplars(query, expected), atol=2e-6, rtol=0)
        # Pixels outside lobe samples cannot alter fitted normalization/weights.
        changed = features.copy()
        changed[~support.any(0)] = 1000
        second = fit_ridge(torch.from_numpy(changed.transpose(2, 0, 1)), indices, count)
        for a, b in zip(model, second):
            torch.testing.assert_close(a, b, rtol=0, atol=0)

    def test_gradient_through_fit_matches_finite_differences(self):
        torch.manual_seed(4)
        features = torch.randn(3, 3, 4, dtype=torch.float64, requires_grad=True)
        indices = torch.tensor([0, 1, 2, 9, 10, 11])
        query = torch.randn(3, 2, 2, dtype=torch.float64)
        self.assertTrue(torch.autograd.gradcheck(
            lambda x: score_ridge(query, fit_ridge(x, indices, 3)),
            (features,), eps=1e-6, atol=1e-5, rtol=1e-4))

    def test_phase_exchange_unknown_pixels_and_single_image_assignment(self):
        score = torch.tensor([[2., -2., .1], [-1., 1., .2]], requires_grad=True)
        labels = torch.tensor([[1., 0., 255.], [0., 1., 255.]])
        first = overlap_loss(score, labels)
        exchanged = torch.where(labels == 255, labels, 1-labels)
        torch.testing.assert_close(first, overlap_loss(score, exchanged), rtol=0, atol=0)
        first.backward()
        torch.testing.assert_close(score.grad[:, -1], torch.zeros(2), rtol=0, atol=0)
        # Independent local phase selection would incorrectly make this equal.
        changed = labels.clone()
        changed[0, :2] = 1-changed[0, :2]
        self.assertGreater(float(overlap_loss(score, changed).detach()), float(first.detach()))

    def test_pixel_centres_preserve_linear_context_fields(self):
        size = 16
        yy, xx = torch.meshgrid(torch.arange(size), torch.arange(size), indexing='ij')
        context = torch.stack([(xx+.5)/size, (yy+.5)/size])
        identity = np.diag([100., 80., 1.])
        torch.testing.assert_close(crop_context(context, identity, (100, 80), size),
                                   context, rtol=0, atol=1e-7)
        inset = np.array([[50, 0, 25], [0, 40, 20], [0, 0, 1.]])
        torch.testing.assert_close(crop_context(context, inset, (100, 80), size),
                                   context*.5+.25, rtol=0, atol=1e-7)

    def test_projection_receives_finite_nonzero_training_gradients(self):
        torch.manual_seed(12)
        model = ExemplarProjection(channels=4, outputs=2)
        rgb, frozen = torch.rand(3, 16, 16), torch.rand(4, 8, 8)
        support = np.zeros((2, 8, 8), bool)
        support[0, :2] = True
        support[1, -2:] = True
        indices, count = sample_indices(support, minimum=8)
        labels = torch.full((16, 16), 255.)
        labels[4:12] = (rgb[0, 4:12] > .5).float()
        loss = overlap_loss(model(rgb, frozen, indices, count), labels)
        loss.backward()
        gradient = model.projection.weight.grad
        self.assertTrue(torch.isfinite(gradient).all())
        self.assertGreater(float(gradient.norm()), 1e-6)


if __name__ == '__main__':
    torch.set_num_threads(1)
    unittest.main()
