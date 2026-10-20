import unittest

import numpy as np
import torch

from material_pair_loss import material_pair_consistency
from material_pairing import material_pairs, paired_draws, synthetic_draw_counts


class PairedMaterialTests(unittest.TestCase):
    def setUp(self):
        torch.set_num_threads(1)
        self.labels = torch.zeros(2, 16, 16, dtype=torch.float64)
        self.labels[:, 5:11, 5:11] = 1

    def test_global_phase_exchange_is_free_but_local_print_is_not(self):
        clean = (self.labels[0]*2-1)*4
        self.assertEqual(float(material_pair_consistency(torch.stack([clean, clean]), self.labels)), 0)
        self.assertLess(float(material_pair_consistency(torch.stack([clean, -clean]), self.labels)), 1e-30)
        decorated = clean.clone(); decorated[1:4, 1:4] *= -1
        logits = torch.stack([clean, decorated]).requires_grad_()
        loss = material_pair_consistency(logits, self.labels)
        self.assertGreater(float(loss.detach()), 0)
        loss.backward()
        self.assertGreater(float(logits.grad[1, 2, 2]), 0)
        self.assertLess(float(logits.grad[0, 2, 2]), 0)

    def test_unknown_differences_have_no_loss_or_gradient(self):
        labels = self.labels.clone(); labels[:, :4] = 255
        logits = torch.ones_like(labels); logits[1, :4] = -5
        logits.requires_grad_()
        loss = material_pair_consistency(logits, labels)
        loss.backward()
        self.assertEqual(float(loss.detach()), 0)
        self.assertEqual(float(logits.grad.abs().sum()), 0)
        self.assertEqual(float(material_pair_consistency(logits, torch.full_like(labels, 255)).detach()), 0)

    def test_fractional_target_symmetry_and_independent_weighted_cost(self):
        torch.manual_seed(4)
        labels = self.labels.clone(); labels[:, 5, 5:11] = .5
        logits = torch.randn_like(labels)
        loss = material_pair_consistency(logits, labels)
        self.assertAlmostEqual(float(loss), float(material_pair_consistency(-logits, labels)), places=12)
        self.assertAlmostEqual(float(loss), float(material_pair_consistency(logits, 1-labels)), places=12)
        self.assertAlmostEqual(float(loss), float(material_pair_consistency(logits.flip(-1), labels.flip(-1))), places=12)
        # Unweighted phase/cost calculated independently over all pixels.
        p = logits.sigmoid()
        costs = -labels*torch.log(p)-(1-labels)*torch.log1p(-p)
        flipped = -labels*torch.log1p(-p)-(1-labels)*torch.log(p)
        aligned = torch.stack([1-p[i] if flipped[i].mean() < costs[i].mean() else p[i] for i in range(2)])
        expected = (aligned[0]-aligned[1]).square().mean()
        self.assertAlmostEqual(float(material_pair_consistency(logits, labels, factor=1)), float(expected), places=12)

    def test_reject_misalignment_and_invalid_values(self):
        wrong = self.labels.clone(); wrong[1, 2, 2] = 1
        for logits, labels in [(torch.zeros_like(wrong), wrong),
                               (torch.full_like(wrong, float('nan')), self.labels),
                               (torch.zeros(1, 16, 16), self.labels)]:
            with self.assertRaises(ValueError):
                material_pair_consistency(logits, labels)

    def test_complete_paired_schedule_and_historical_counts(self):
        items = []
        for geometry in range(4):
            for kind in ['original', 'printed', 'scene']:
                items.append({'id': f'g{geometry}'+('' if kind == 'original' else '--'+kind),
                              'evidence': {'kind': 'synthetic-'+kind},
                              'body': np.ones((4, 4)), 'materials': np.zeros((4, 4))})
        pairs = material_pairs(items)
        draws = paired_draws(2, pairs, 3, 17)
        self.assertEqual(draws, paired_draws(2, pairs, 3, 17))
        self.assertEqual(len(draws), 24)
        counts = synthetic_draw_counts(draws)
        for index, item in enumerate(items):
            self.assertEqual(counts[index], 6 if item['evidence']['kind'] == 'synthetic-original' else 3)
        self.assertEqual([sum(d['real'] == i for d in draws) for i in range(2)], [12, 12])
        self.assertEqual(dict(synthetic_draw_counts([{'synthetic': 2}, {'synthetic': 2}, {'synthetic': 1}])), {2: 2, 1: 1})
        items[-1]['materials'][0, 0] = 1
        with self.assertRaises(ValueError):
            material_pairs(items)


if __name__ == '__main__':
    unittest.main()
