"""Augmentation cannot move geometry or cross the original training split."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from PIL import Image

from data import digest
from foreground_augments import training_variants


def fixture(root):
    root = Path(root); identity = 'a'*64; key = identity[:12]+':view'
    labels = {'canonicalToPhoto': [1, 0, 0, 0, 1, 0, 0, 0, 1], 'canonicalToCrop': [1, 0, 0, 0, 1, 0, 0, 0, 1],
              'actualQuad': [[0, 0], [32, 0], [32, 32], [0, 32]], 'proposedCropQuad': [[0, 0], [32, 0], [32, 32], [0, 32]],
              'nodesPhoto': [], 'nodesCrop': [], 'seed': 17, 'resolution': 32,
              'perturbations': {'background': [128, 110, 100], 'backgroundStyle': 'soft-cloth', 'exposure': 1.}}
    Image.new('RGB', (32, 32), '#876543').save(root/'baseline.png')
    Image.new('RGB', (32, 32), '#fefefe').save(root/'variant.png')
    photo_sha = digest((root/'baseline.png').read_bytes()); labels_sha = digest(json.dumps(labels).encode())
    item = {'id': key, 'split': 'train', 'target': np.ones((32, 32), np.float32), 'rgb': np.zeros((32, 32, 3), np.uint8), 'labels': labels, 'photoSha256': photo_sha}
    corpus = SimpleNamespace(sources=[{'parentManifestSha256': identity}], resolution=32,
                             rows=[{'id': 'view', 'key': key, 'designId': 'design', 'experimentalSplit': 'train', 'labels': {'sha256': labels_sha}}])
    variants = [{'name': 'baseline'}, {'name': 'white', 'interventions': {'background': [255, 255, 255]}}]
    manifest = {'schema': 'woven-heart-intervention-probe-1', 'status': 'complete', 'profile': 'background', 'sourceManifestSha256': identity, 'variants': variants, 'rows': []}
    augmented = {**copy.deepcopy(labels), 'baselinePerturbations': copy.deepcopy(labels['perturbations']), 'interventions': {'requested': variants[1]['interventions']}}
    augmented['perturbations']['background'] = [255, 255, 255]
    def save():
        manifest['rows'] = []
        for name, value, image in [('baseline', labels, 'baseline.png'), ('white', augmented, 'variant.png')]:
            file = root/(name+'.json'); file.write_text(json.dumps(value))
            manifest['rows'].append({'sourceViewId': 'view', 'sourceSplit': 'train', 'designId': 'design', 'sourceLabelsSha256': labels_sha, 'variant': name,
                                     'assets': {'labels.json': {'path': file.name, 'sha256': digest(file.read_bytes())},
                                                'photo.jpg': {'path': image, 'sha256': digest((root/image).read_bytes())}}})
        (root/'manifest.json').write_text(json.dumps(manifest))
    save()
    return corpus, item, manifest, augmented, save


class AugmentationTests(unittest.TestCase):
    def test_photographic_variants_reuse_original_target_and_geometry_group(self):
        with tempfile.TemporaryDirectory() as directory:
            corpus, item, _, _, _ = fixture(directory)
            variants, records = training_variants(corpus, [item], [directory])
            extra = variants[item['id']]
            self.assertEqual(len(extra), 1)
            self.assertIs(extra[0]['target'], item['target'])
            self.assertEqual(extra[0]['split'], 'train')
            self.assertFalse(np.array_equal(extra[0]['rgb'], item['rgb']))
            self.assertEqual(records[0]['importedVariantViews'], 1)
            with self.assertRaisesRegex(ValueError, 'Repeated source/variant'):
                training_variants(corpus, [item], [directory, directory])

    def test_development_and_holdouts_cannot_enter_training_as_variants(self):
        with tempfile.TemporaryDirectory() as directory:
            corpus, item, _, _, _ = fixture(directory)
            for split in ['development', 'recipe-validation', 'recipe-test']:
                item['split'] = split
                with self.assertRaisesRegex(ValueError, 'held-out'):
                    training_variants(corpus, [item], [directory])

    def test_changed_camera_and_unrequested_photometry_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            corpus, item, _, augmented, save = fixture(directory)
            augmented['canonicalToPhoto'][0] = 1.1; save()
            with self.assertRaisesRegex(ValueError, 'camera or geometry'):
                training_variants(corpus, [item], [directory])
            augmented['canonicalToPhoto'][0] = 1
            augmented['perturbations']['exposure'] = .5; save()
            with self.assertRaisesRegex(ValueError, 'Nonintervened'):
                training_variants(corpus, [item], [directory])
            augmented['perturbations']['exposure'] = 1.
            augmented['perturbations']['glare'] = .9; save()
            with self.assertRaisesRegex(ValueError, 'parameter set'):
                training_variants(corpus, [item], [directory])


if __name__ == '__main__': unittest.main()
