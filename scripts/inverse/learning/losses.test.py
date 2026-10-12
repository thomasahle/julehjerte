import unittest
import torch

from losses import balanced_heatmap_loss, LOSSES
from model import heatmap_loss


class LossTests(unittest.TestCase):
    def test_legacy_objective_remains_identical(self):
        self.assertIs(LOSSES['weighted-mse'], heatmap_loss)

    def test_sparse_foreground_has_equal_weight_to_dense_foreground(self):
        valid = torch.ones((1, 1, 16, 16))
        sparse = torch.zeros((1, 2, 16, 16)); sparse[:, :, 8, 8] = 1
        dense = sparse.clone(); dense[:, :, 4:12, 4:12] = 1
        gradients = []
        for target in [sparse, dense]:
            logits = torch.zeros_like(target, requires_grad=True)
            loss = balanced_heatmap_loss(logits, target, valid)
            loss.backward()
            self.assertAlmostEqual(float(loss.detach()), .25)
            gradients.append(float((logits.grad*target).sum()))
        self.assertAlmostEqual(*gradients)

    def test_invalid_pixels_have_zero_loss_and_gradient(self):
        logits = torch.ones((1, 2, 16, 16), requires_grad=True)
        loss = balanced_heatmap_loss(logits, torch.ones_like(logits), torch.zeros((1, 1, 16, 16)))
        loss.backward()
        self.assertEqual(float(loss.detach()), 0)
        self.assertEqual(float(logits.grad.abs().sum()), 0)

    def test_empty_target_still_suppresses_false_proposals(self):
        logits = torch.zeros((1, 2, 8, 8), requires_grad=True)
        loss = balanced_heatmap_loss(logits, torch.zeros_like(logits), torch.ones((1, 1, 8, 8)))
        loss.backward()
        self.assertGreater(float(loss.detach()), 0)
        self.assertTrue((logits.grad > 0).all())

    def test_soft_targets_support_finite_gradients(self):
        logits = torch.zeros((1, 2, 8, 8), requires_grad=True)
        targets = torch.linspace(0, 1, logits.numel()).reshape_as(logits)
        loss = balanced_heatmap_loss(logits, targets, torch.ones((1, 1, 8, 8)))
        loss.backward()
        self.assertTrue(torch.isfinite(loss))
        self.assertTrue(torch.isfinite(logits.grad).all())


if __name__ == '__main__':
    unittest.main()
