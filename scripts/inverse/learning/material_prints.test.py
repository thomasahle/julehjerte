"""Decorative appearance must not alter labels or real-image sampling."""
import unittest
import json
from pathlib import Path
import tempfile
import numpy as np
from PIL import Image
from material_prints import print_schedule, printed_batch, load_printed_replay
from material_pilot import conditional_material_labels
from data import digest
from real_finetune import schedule


class PrintedTest(unittest.TestCase):
    def test_paired_rgb_change_keeps_coverage_and_real_samples(self):
        target = np.array([[.25, 0, 1]], np.float32)
        items = [{'id': name, 'materials': target, 'rgb': index} for index, name in enumerate(['a', 'scene', 'real1', 'real2'])]
        variants = {'a': [{**items[0], 'id': 'print-'+str(i), 'rgb': 10+i} for i in range(3)]}
        before = schedule(20, 1234, 64)
        changed = printed_batch(items, [2, 1, 0, -1], variants)
        self.assertEqual(changed[0]['rgb'], 12)
        self.assertIs(changed[0]['materials'], target)
        for index in [1, 2, 3]: self.assertIs(changed[index], items[index])
        self.assertEqual(before, schedule(20, 1234, 64))
        self.assertEqual(items[0]['rgb'], 0)
        self.assertIs(printed_batch(items, [-1]*4, variants)[0], items[0])

    def test_print_decisions_are_reproducible_and_balanced_without_mutating_other_rng(self):
        first = print_schedule(240, 20261015)
        self.assertEqual(first, print_schedule(240, 20261015))
        self.assertNotEqual(first, print_schedule(240, 20261016))
        counts = {i: int((np.asarray(first) == i).sum()) for i in [-1, 0, 1, 2]}
        self.assertTrue(400 < counts[-1] < 560)
        self.assertTrue(all(110 < counts[i] < 210 for i in range(3)))
        for invalid in [[3]*4, [0.0]*4, [0]*3]:
            with self.assertRaises(ValueError): printed_batch([{'id': 'a'}]*4, invalid, {})

    def test_replay_loader_refuses_evaluation_and_unpaired_inputs(self):
        for items in [[{'id': 'a', 'split': 'test'}], [{'id': 'a', 'split': 'train'}]]:
            with self.assertRaises(ValueError): load_printed_replay(items, [])

    def test_saved_prints_keep_fractional_labels_and_reject_relabelled_ink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); parent = 'a'*64; identity = parent[:12]+':view'
            labels = {k: v for k, v in [('resolution', 16), ('seed', 3), ('actualQuad', []), ('nodesPhoto', []), ('canonicalToPhoto', list(range(9))), ('canonicalToCrop', list(range(9))), ('perturbations', {'palette': [[10]*3, [220]*3]})]}
            coverage = np.full((16, 16), 64, np.uint8); body = np.ones((16, 16), np.uint8)
            original = {'id': identity, 'split': 'train', 'rgb': np.zeros((16, 16, 3), np.uint8), 'photoSha256': 'original', 'body': body, 'materials': conditional_material_labels(coverage.astype(np.float32)/255, body), 'labels': labels}
            items = [original, {**original, 'id': identity+'--scene'}]; assets = {}
            for name in ['photo.jpg', 'photo-paper-a.png', 'photo-overlap-valid.png', 'crop-paper-a.png', 'crop-overlap-valid.png']:
                Image.fromarray(coverage).save(root/name); assets[name] = {'path': name, 'sha256': digest((root/name).read_bytes())}
            printed_labels = {**labels, 'baselinePerturbations': labels['perturbations'], 'interventions': {'requested': {'paperPrints': [None, None]}}}
            (root/'labels.json').write_text(json.dumps(printed_labels)); assets['labels.json'] = {'path': 'labels.json', 'sha256': digest((root/'labels.json').read_bytes())}
            names = ['print-flowers', 'print-stripes-dots', 'print-flowers-stripes']
            manifest = {'schema': 'woven-heart-intervention-probe-1', 'status': 'complete', 'profile': 'printed', 'sourceManifestSha256': parent,
                        'baselineIdentities': [{'sourceViewId': 'view', 'imageHashes': {k: v['sha256'] for k, v in assets.items()}}],
                        'rows': [{'sourceViewId': 'view', 'sourceSplit': 'train', 'variant': name, 'assets': assets} for name in names]}
            def source():
                (root/'manifest.json').write_text(json.dumps(manifest))
                return [{'directory': directory, 'manifestSha256': digest((root/'manifest.json').read_bytes()), 'parentManifestSha256': parent}]
            variants, record = load_printed_replay(items, source())
            self.assertEqual(len(record), 3)
            for variant in variants[identity]:
                self.assertIs(variant['body'], original['body']); self.assertIs(variant['materials'], original['materials'])
            # A self-consistent changed manifest/PNG still cannot silently teach
            # that decorative ink is a third paper or flip the material labels.
            Image.fromarray(255-coverage).save(root/'photo-paper-a.png')
            assets['photo-paper-a.png']['sha256'] = digest((root/'photo-paper-a.png').read_bytes())
            manifest['baselineIdentities'][0]['imageHashes']['photo-paper-a.png'] = assets['photo-paper-a.png']['sha256']
            with self.assertRaisesRegex(ValueError, 'paper identity'):
                load_printed_replay(items, source())


if __name__ == '__main__': unittest.main()
