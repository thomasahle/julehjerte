import unittest

import numpy as np
import torch
from torch.nn import functional as F

from material_boundary_loss import boundary_material_loss, material_boundary_weights
from real_foreground import masked_foreground_loss
from real_materials_learning import joint_material_loss
from u2netp_material_candidate import module
from pathlib import Path


class BoundaryLossTests(unittest.TestCase):
    def setUp(self):
        torch.set_num_threads(1); torch.manual_seed(5)
        self.labels = torch.zeros(2, 12, 12); self.labels[:, :, 6:] = 1
        self.body = torch.ones_like(self.labels)

    def test_band_and_unknown_gap(self):
        weights = material_boundary_weights(self.labels)
        expected = torch.ones_like(weights); expected[:, :, 3:9] = 4
        self.assertTrue(torch.equal(weights, expected))
        labels = self.labels.clone(); labels[:, :, 5:7] = 255
        self.assertTrue(torch.equal(material_boundary_weights(labels), (labels != 255).float()))

    def test_fractional_half_coverage_phase_and_reflection(self):
        self.labels[:, :, 5] = .5; self.labels[:, 0] = 255
        reversed_labels = torch.where(self.labels == 255, 255, 1-self.labels)
        weights = material_boundary_weights(self.labels)
        self.assertTrue(torch.equal(weights, material_boundary_weights(reversed_labels)))
        self.assertTrue(torch.equal(weights.flip(-1), material_boundary_weights(self.labels.flip(-1))))
        logits = torch.randn(2, 2, 12, 12, requires_grad=True)
        loss = boundary_material_loss(logits, self.body, self.labels)
        other = boundary_material_loss(logits, self.body, reversed_labels)
        self.assertTrue(torch.allclose(loss, other, atol=1e-6))
        loss.backward(); self.assertTrue(torch.isfinite(logits.grad).all())
        self.assertEqual(float(logits.grad[:, 1, 0].abs().sum()), 0.)

    def test_matches_independent_weighted_global_assignment(self):
        logits = torch.randn(2, 2, 12, 12, dtype=torch.float64, requires_grad=True)
        labels = self.labels.double(); labels[:, 3:5, 4] = .3
        weights = material_boundary_weights(labels).double()
        expected = masked_foreground_loss(logits[:, :1], self.body[:, None].double(), torch.ones_like(logits[:, :1]))
        phases = []
        for index in range(2):
            costs = [(F.binary_cross_entropy_with_logits(logits[index, 1], target, reduction='none')*weights[index]).sum()/weights[index].sum()
                     for target in [labels[index], 1-labels[index]]]
            phases.append(costs[0] if costs[0] <= costs[1] else costs[1])
        expected = expected+torch.stack(phases).mean()
        actual = boundary_material_loss(logits, self.body, labels)
        self.assertTrue(torch.allclose(actual, expected, atol=1e-12, rtol=0))
        actual_gradient, = torch.autograd.grad(actual, logits, retain_graph=True)
        expected_gradient, = torch.autograd.grad(expected, logits)
        self.assertTrue(torch.allclose(actual_gradient, expected_gradient, atol=1e-12, rtol=0))

    def test_uniform_control_exact_and_wrong_edges_receive_larger_gradient(self):
        logits = torch.zeros(2, 2, 12, 12, requires_grad=True)
        self.assertTrue(torch.equal(boundary_material_loss(logits, self.body, self.labels, factor=1), joint_material_loss(logits, self.body, self.labels)))
        boundary_material_loss(logits, self.body, self.labels).backward()
        self.assertAlmostEqual(float(logits.grad[0, 1, 6, 5]/logits.grad[0, 1, 6, 0]), 4., places=6)
        self.assertNotEqual(float(logits.grad[:, 1].abs().sum()), 0.)

    def test_empty_known_labels_have_no_material_gradient(self):
        logits = torch.randn(2, 2, 12, 12, requires_grad=True)
        loss = boundary_material_loss(logits, self.body, torch.full_like(self.labels, 255))
        loss.backward(); self.assertEqual(float(logits.grad[:, 1].abs().sum()), 0.)
        with self.assertRaises(ValueError): material_boundary_weights(self.labels, factor=float('nan'))

    def test_independent_boundary_probe(self):
        probe = module(Path(__file__).with_name('probe-material-synthetic.py'), 'boundary_probe_test')
        target = self.labels[0].numpy(); guess = target.copy(); guess[:, 5] = 1
        prediction = np.stack([np.ones_like(target), guess])[None]
        items = [{'id': 'half', 'materials': target}]
        metrics = {'rows': [{'materialPhaseExchanged': False, 'materialPixelError': 1/12}]}
        result = probe.boundary_diagnostics(prediction, items, metrics)['rows'][0]
        self.assertEqual(result['boundaryPixels'], 72)
        self.assertEqual(result['interiorPixels'], 72)
        self.assertEqual(result['boundaryError'], 1/6)
        self.assertEqual(result['interiorError'], 0)
        prediction[:, 1] = 1-prediction[:, 1]; metrics['rows'][0]['materialPhaseExchanged'] = True
        self.assertEqual(probe.boundary_diagnostics(prediction, items, metrics)['rows'][0], result)


if __name__ == '__main__': unittest.main()
