import unittest

import torch

from exemplar_projection import context_residual_score, fit_ridge, score_ridge


class ContextResidualTest(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(31)
        self.rgb = torch.rand(3, 8, 8, dtype=torch.float64)
        self.indices = torch.arange(64)

    def test_uninformative_context_preserves_rgb_exactly(self):
        context = torch.zeros(2, 8, 8, dtype=torch.float64)
        expected = score_ridge(self.rgb, fit_ridge(self.rgb, self.indices, 32))
        actual = context_residual_score(self.rgb, context, self.indices, 32)
        torch.testing.assert_close(actual, expected, rtol=0, atol=0)

    def test_context_can_recover_paper_identity_when_printing_confuses_rgb(self):
        paper = torch.cat([-torch.ones(4, 8), torch.ones(4, 8)]).double()
        colour = paper.clone()
        colour[:, ::4] *= -1  # The same ink colours appear on both materials.
        rgb = colour[None].repeat(3, 1, 1)
        context = paper[None]
        base = score_ridge(rgb, fit_ridge(rgb, self.indices, 32))
        actual = context_residual_score(rgb, context, self.indices, 32)
        self.assertGreater(int(((base >= 0) != (paper >= 0)).sum()), 0)
        self.assertEqual(int(((actual >= 0) != (paper >= 0)).sum()), 0)

    def test_gradient_through_residual_fit_matches_finite_differences(self):
        context = torch.randn(2, 8, 8, dtype=torch.float64, requires_grad=True)
        target = torch.rand(8, 8, dtype=torch.float64)

        def loss(value):
            return (context_residual_score(self.rgb, value, self.indices, 32)-target).square().mean()

        analytical = torch.autograd.grad(loss(context), context)[0]
        for index in [(0, 2, 3), (1, 5, 7), (1, 0, 0)]:
            plus, minus = context.detach().clone(), context.detach().clone()
            plus[index] += 1e-5
            minus[index] -= 1e-5
            numerical = (loss(plus)-loss(minus))/2e-5
            torch.testing.assert_close(analytical[index], numerical, rtol=1e-5, atol=1e-8)

    def test_invalid_residual_targets_are_rejected(self):
        for target in [torch.zeros(63), torch.full((64,), float('nan'))]:
            with self.assertRaises(ValueError):
                fit_ridge(self.rgb, self.indices, 32, target=target)


if __name__ == '__main__':
    unittest.main()
