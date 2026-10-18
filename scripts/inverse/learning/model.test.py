import unittest
import numpy as np
import torch
from model import ProposalNet, heatmap_loss
from train import tensors


class ModelTests(unittest.TestCase):
    def test_hwc_photo_batch_supports_backward(self):
        torch.set_num_threads(2)
        device = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
        n = 64
        item = {'rgb': np.zeros((n, n, 3), np.uint8), 'mask': np.zeros((n, n), np.float32),
                'target': np.zeros((2, n, n), np.float32), 'valid': np.ones((n, n), bool)}
        rgb, mask, target, valid = tensors([item, item], device)
        self.assertTrue(rgb.is_contiguous())
        model = ProposalNet().to(device)
        logits = model(rgb, mask)
        self.assertEqual(tuple(logits.shape), (2, 2, n, n))
        loss = heatmap_loss(logits, target, valid)
        loss.backward()
        self.assertTrue(all(p.grad is None or torch.isfinite(p.grad).all() for p in model.parameters()))

    def test_invalid_pixels_do_not_contribute_to_loss(self):
        logits = torch.ones((1, 2, 4, 4), requires_grad=True)
        loss = heatmap_loss(logits, torch.zeros_like(logits), torch.zeros((1, 1, 4, 4)))
        loss.backward()
        self.assertEqual(float(loss.detach()), 0)
        self.assertEqual(float(logits.grad.abs().sum()), 0)


if __name__ == '__main__':
    unittest.main()
