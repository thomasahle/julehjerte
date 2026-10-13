"""Group isolation and encoder freezing are necessary for the pilot comparison."""
import copy
import unittest

import numpy as np
import torch

from foreground import ForegroundNet
from real_finetune import adaptation_loss, encoder_hash, freeze_encoder, grouped_folds, schedule, step_batch


def fixture():
    items = [{'id': str(i), 'splitGroupId': 'source-'+str(i), 'nearDuplicateGroup': 'duplicate-'+str(i)} for i in range(6)]
    audit = {'manifestSha256': 'labels', 'annotationsSha256': 'annotations'}
    plan = {'schema': 'woven-heart-real-pilot-folds-1', 'labelsManifestSha256': 'labels', 'annotationsSha256': 'annotations',
            'groups': [{'id': 'motif-'+str(i), 'members': [str(i)], 'reason': 'test fixture'} for i in range(6)]}
    return items, audit, plan


class RealFinetuneTests(unittest.TestCase):
    def test_transitive_source_duplicate_and_motif_groups_never_cross_folds(self):
        items, audit, plan = fixture()
        items[0]['splitGroupId'] = items[1]['splitGroupId']
        items[1]['nearDuplicateGroup'] = items[2]['nearDuplicateGroup']
        plan['groups'][2]['members'].append('3'); del plan['groups'][3]
        folds = grouped_folds(items, audit, plan)
        self.assertEqual(sorted(len(f['heldOut']) for f in folds), [1, 1, 4])
        self.assertEqual(sorted(i for f in folds for i in f['heldOut']), [str(i) for i in range(6)])
        for f in folds:
            self.assertFalse(set(f['heldOut']) & set(f['train']))
            self.assertEqual(set(f['heldOut']) | set(f['train']), {i['id'] for i in items})
        joined = next(f for f in folds if '0' in f['heldOut'])
        self.assertEqual(joined['heldOut'], ['0', '1', '2', '3'])

    def test_reject_changed_labels_or_incomplete_grouping(self):
        items, audit, plan = fixture()
        bad = copy.deepcopy(plan); bad['labelsManifestSha256'] = 'different'
        with self.assertRaises(ValueError): grouped_folds(items, audit, bad)
        bad = copy.deepcopy(plan); bad['groups'][0]['members'].append('1')
        with self.assertRaises(ValueError): grouped_folds(items, audit, bad)
        bad = copy.deepcopy(plan); bad['groups'].pop()
        with self.assertRaises(ValueError): grouped_folds(items, audit, bad)
        for i in items: i['splitGroupId'] = 'one-source'
        with self.assertRaisesRegex(ValueError, 'two independent'): grouped_folds(items, audit, plan)

    def test_fixed_draws_keep_shared_replay_and_real_membership(self):
        draws = schedule(12, 17, 8)
        self.assertEqual(draws, schedule(12, 17, 8))
        synthetic = [{'id': 's'+str(i)} for i in range(8)]
        real = [{'id': 'r'+str(i)} for i in range(3)]
        for draw in draws:
            control, mixed = step_batch(draw, synthetic, []), step_batch(draw, synthetic, real)
            self.assertEqual(control[:2], mixed[:2])
            self.assertEqual(len(control), len(mixed))
            self.assertTrue(all(i in real for i in mixed[2:]))
            self.assertTrue(all(i in synthetic for i in control))

    def test_decoder_updates_without_changing_encoder_or_batchnorm_statistics(self):
        torch.manual_seed(19); model = ForegroundNet()
        trainable = freeze_encoder(model); self.assertEqual(trainable, 9889)
        before = encoder_hash(model)
        head_before = model.head[-1].weight.detach().clone()
        optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=1e-3)
        rng = np.random.default_rng(5)
        item = {'rgb': rng.integers(0, 256, (32, 32, 3), dtype=np.uint8), 'target': np.zeros((32, 32), np.float32),
                'weight': np.ones((32, 32), np.float32)}
        item['target'][8:24, 8:24] = 1; item['weight'][:4] = 0
        loss = adaptation_loss(model, [item, item], (True, True)); loss.backward(); optimizer.step()
        self.assertEqual(encoder_hash(model), before)
        self.assertFalse(torch.equal(head_before, model.head[-1].weight))
        self.assertTrue(all(p.grad is None for p in model.encoder.parameters()))


if __name__ == '__main__':
    torch.set_num_threads(2)
    unittest.main()
