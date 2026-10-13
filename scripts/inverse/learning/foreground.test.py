"""Offline contracts for foreground geometry, split isolation and model input."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image
import torch

from data import digest
from foreground import ForegroundCorpus, ForegroundNet, foreground_loss, foreground_metrics, physical_foreground


def fixture(directory):
    root, side = Path(directory)/'parent', Path(directory)/'foreground'
    root.mkdir(); side.mkdir()
    labels = {'schema': 'woven-heart-synthetic-view-1', 'resolution': 64,
              'canonicalToPhoto': [.3, 0, 20, 0, .3, 20, 0, 0, 1]}
    (root/'labels.json').write_text(json.dumps(labels))
    Image.new('RGB', (64, 64), '#be1234').save(root/'photo.png')
    mask = physical_foreground(labels).astype(np.uint8)*255
    Image.fromarray(mask).save(side/'mask.png')
    def asset(base, name): return {'path': name, 'sha256': digest((base/name).read_bytes())}
    assets = {'labels.json': asset(root, 'labels.json'), 'photo.jpg': asset(root, 'photo.png')}
    policy = {'external': False, 'existingPhotoQAIncluded': False, 'existingHunodanQAIncluded': False,
              'existingGalleryIncluded': False, 'topologyDisjoint': False,
              'familySplits': {'lattice': 'train', 'channel': 'validation', 'frame': 'test'}}
    parent = {'schema': 'woven-heart-synthetic-dataset-1', 'status': 'complete', 'sourceProvenance': {'externalAssets': []},
              'splitPolicy': policy, 'baseDesigns': [], 'views': []}
    extra = {'schema': 'woven-heart-foreground-dataset-1', 'status': 'complete', 'splitPolicy': copy.deepcopy(policy), 'views': []}
    for number in range(10):
        split, family = ('train', 'lattice') if number < 8 else ('validation', 'channel') if number == 8 else ('test', 'frame')
        identity = {'familyId': family, 'groupId': family, 'split': split, 'sourceId': str(number)}
        parent['baseDesigns'].append({'id': str(number), **identity, 'geometrySha256': str(number),
                                     'validation': {'passed': True, 'geometry': {'passed': True}, 'paper': {'status': 'pass'}}})
        for view in range(2):
            base = {'id': f'{number}-v{view}', 'designId': str(number), **identity}
            parent['views'].append({**base, 'assets': assets})
            extra['views'].append({**base, 'photo': assets['photo.jpg'], 'labels': assets['labels.json'],
                                   'foreground': asset(side, 'mask.png'), 'resolution': 64, 'foregroundPixels': int((mask > 0).sum())})
    def save():
        (root/'manifest.json').write_text(json.dumps(parent))
        extra['parentManifestSha256'] = digest((root/'manifest.json').read_bytes())
        (side/'manifest.json').write_text(json.dumps(extra))
    save()
    return root, side, parent, extra, save


class ForegroundTests(unittest.TestCase):
    def test_geometry_includes_both_lobes_and_rescales_pixel_centres(self):
        labels = {'schema': 'woven-heart-synthetic-view-1', 'resolution': 200,
                  'canonicalToPhoto': [1, 0, 50, 0, 1, 50, 0, 0, 1]}
        mask = physical_foreground(labels)
        self.assertTrue(mask[60, 60])
        self.assertTrue(mask[25, 100])
        self.assertTrue(mask[100, 25])
        self.assertFalse(mask[25, 25])
        # Pixel centres at the coarser scale are four subpixel positions away
        # from the circle boundary. Compare to independent supersampling.
        coarse = physical_foreground(labels, 100)
        blocks = mask.reshape(100, 2, 100, 2).mean((1, 3))
        certain = (blocks == 0) | (blocks == 1)
        np.testing.assert_array_equal(coarse[certain], blocks[certain] > .5)
        changed = {**labels, 'palette': ['#ffffff', '#000000'], 'proposedCropQuad': [[0, 0]]*4}
        np.testing.assert_array_equal(mask, physical_foreground(changed))

    def test_global_geometry_groups_and_verified_pixel_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            root, side, parent, extra, save = fixture(directory)
            corpus = ForegroundCorpus([root], [side], 32)
            self.assertEqual(len(corpus.rows), 20)
            roles = {}
            for row in corpus.rows:
                roles.setdefault(row['geometrySha256'], set()).add(row['experimentalSplit'])
                item = corpus.load(row)
                self.assertEqual(item['rgb'].shape, (32, 32, 3))
                self.assertEqual(item['target'].shape, (32, 32))
            self.assertTrue(all(len(v) == 1 for v in roles.values()))
            self.assertEqual(sum(r['experimentalSplit'] == 'development' for r in corpus.rows), 4)
            with self.assertRaisesRegex(ValueError, 'Duplicate parent'):
                ForegroundCorpus([root, root], [side, side])
            parent['baseDesigns'][8]['geometrySha256'] = '0'; save()
            with self.assertRaisesRegex(ValueError, 'crosses parent splits'):
                ForegroundCorpus([root], [side])

    def test_rejects_changed_identity_and_forged_mask_even_with_new_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            root, side, parent, extra, save = fixture(directory)
            extra['views'][0]['split'] = 'test'; save()
            with self.assertRaisesRegex(ValueError, 'Changed view identity'):
                ForegroundCorpus([root], [side])
            extra['views'][0]['split'] = 'train'
            Image.new('L', (64, 64), 0).save(side/'mask.png')
            for row in extra['views']: row['foreground']['sha256'] = digest((side/'mask.png').read_bytes())
            save(); corpus = ForegroundCorpus([root], [side])
            with self.assertRaisesRegex(ValueError, 'saved physical geometry'):
                corpus.load(corpus.rows[0])

    def test_metrics_reject_missing_predictions_and_detect_shift(self):
        target = np.zeros((32, 32), np.float32); target[8:24, 8:24] = 1
        items = [{'id': 'a', 'target': target}]
        perfect = foreground_metrics([target], items)
        self.assertEqual(perfect['iou'], 1)
        self.assertEqual(perfect['boundaryF1'], 1)
        shifted = foreground_metrics([np.roll(target, 5, axis=0)], items)
        self.assertLess(shifted['iou'], .8)
        self.assertLess(shifted['boundaryF1'], .8)
        for predictions in [[], [target, target], [target*np.nan], [target[:, :4]]]:
            with self.assertRaises(ValueError): foreground_metrics(predictions, items)
        empty = np.zeros((32, 32), np.float32)
        self.assertEqual(foreground_metrics([empty], [{'id': 'b', 'target': empty}])['boundaryF1'], 1)

    def test_rgb_only_model_and_both_loss_gradient_directions(self):
        torch.set_num_threads(2); torch.manual_seed(1)
        model = ForegroundNet().eval()
        with torch.no_grad(): result = model(torch.zeros(2, 3, 32, 32))
        self.assertEqual(tuple(result.shape), (2, 1, 32, 32))
        self.assertTrue(torch.isfinite(result).all())
        logits = torch.zeros(1, 1, 4, 4, requires_grad=True)
        target = torch.zeros_like(logits); target[..., :2] = 1
        foreground_loss(logits, target).backward()
        self.assertTrue((logits.grad[..., :2] < 0).all())
        self.assertTrue((logits.grad[..., 2:] > 0).all())


if __name__ == '__main__': unittest.main()
