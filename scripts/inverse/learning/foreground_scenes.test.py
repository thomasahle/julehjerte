"""Scene learning preserves selected-body labels, backgrounds and split groups."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from PIL import Image

from data import digest
from foreground import physical_foreground
from foreground_scenes import training_scenes


def fixture(root):
    root = Path(root); identity = 'a'*64; key = identity[:12]+':view'
    labels = {'schema': 'woven-heart-synthetic-view-1', 'canonicalToPhoto': [.1, 0, 12, 0, .1, 12, 0, 0, 1], 'canonicalToCrop': [1, 0, 0, 0, 1, 0, 0, 0, 1],
              'actualQuad': [[12, 12], [22, 12], [22, 22], [12, 22]], 'proposedCropQuad': [[12, 12], [22, 12], [22, 22], [12, 22]],
              'nodesPhoto': [], 'nodesCrop': [], 'seed': 17, 'resolution': 32,
              'perturbations': {'background': [120, 110, 100], 'backgroundStyle': 'soft-cloth', 'exposure': 1.}}
    Image.new('RGB', (32, 32), '#876543').save(root/'baseline.png')
    Image.new('RGB', (32, 32), '#efefef').save(root/'scene.png')
    mask = np.zeros((32, 32), np.uint8); mask[0, :5] = 255
    photo_sha = digest((root/'baseline.png').read_bytes()); labels_sha = digest(json.dumps(labels).encode())
    item = {'id': key, 'split': 'train', 'target': physical_foreground(labels).astype(np.float32), 'labels': labels, 'photoSha256': photo_sha}
    corpus = SimpleNamespace(sources=[{'parentManifestSha256': identity}], resolution=32,
                             rows=[{'id': 'view', 'key': key, 'designId': 'design', 'experimentalSplit': 'train', 'labels': {'sha256': labels_sha}}])
    definitions = [{'name': 'baseline'}, {'name': 'scene-baseline', 'pairedBackgroundVariant': 'baseline', 'interventions': {'scene': 'neighbors-handle'}}]
    extra = {**copy.deepcopy(labels), 'baselinePerturbations': copy.deepcopy(labels['perturbations']), 'interventions': {'requested': definitions[1]['interventions']},
             'scene': {'kind': 'neighbors-handle', 'visibleDistractorPixels': {'neighbor': 5, 'handle': 0}}}
    extra['perturbations']['scene'] = 'neighbors-handle'
    manifest = {'schema': 'woven-heart-intervention-probe-1', 'status': 'complete', 'profile': 'scene-training', 'sourceManifestSha256': identity, 'variants': definitions}
    def save():
        Image.fromarray(mask).save(root/'mask.png')
        manifest['rows'] = []
        for name, value, photo in [('baseline', labels, 'baseline.png'), ('scene-baseline', extra, 'scene.png')]:
            file = root/(name+'.json'); file.write_text(json.dumps(value))
            manifest['rows'].append({'sourceViewId': 'view', 'sourceSplit': 'train', 'designId': 'design', 'sourceLabelsSha256': labels_sha, 'variant': name,
                                     'assets': {key: {'path': f, 'sha256': digest((root/f).read_bytes())} for key, f in [('labels.json', file.name), ('photo.jpg', photo), ('photo-distractors.png', 'mask.png')]}})
        (root/'manifest.json').write_text(json.dumps(manifest))
    save()
    return corpus, item, extra, mask, save


class SceneTests(unittest.TestCase):
    def test_pair_retains_the_original_body_target(self):
        with tempfile.TemporaryDirectory() as directory:
            corpus, item, _, _, _ = fixture(directory)
            paired, records = training_scenes(corpus, [item], {}, [directory])
            self.assertIs(paired[item['id']]['target'], item['target'])
            self.assertEqual(paired[item['id']]['pairedBaseId'], item['id'])
            self.assertEqual(records[0]['pairedVariants'], 1)
            with self.assertRaisesRegex(ValueError, 'Repeated'):
                training_scenes(corpus, [item], {}, [directory, directory])

    def test_missing_background_counterpart_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            corpus, item, _, _, _ = fixture(directory)
            extra = {**item, 'id': item['id']+'--white'}
            with self.assertRaisesRegex(ValueError, 'Every training background'):
                training_scenes(corpus, [item], {item['id']: [extra]}, [directory])

    def test_held_out_geometries_and_changed_camera_cannot_enter_training(self):
        with tempfile.TemporaryDirectory() as directory:
            corpus, item, extra, _, save = fixture(directory)
            for role in ['development', 'recipe-validation', 'recipe-test']:
                item['split'] = role
                with self.assertRaisesRegex(ValueError, 'held-out'):
                    training_scenes(corpus, [item], {}, [directory])
            item['split'] = 'train'; extra['canonicalToPhoto'][0] = .11; save()
            with self.assertRaisesRegex(ValueError, 'geometry or camera'):
                training_scenes(corpus, [item], {}, [directory])

    def test_body_occlusion_and_unrequested_photo_changes_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            corpus, item, extra, mask, save = fixture(directory)
            mask[15, 15] = 255; extra['scene']['visibleDistractorPixels']['neighbor'] += 1; save()
            with self.assertRaisesRegex(ValueError, 'occlude'):
                training_scenes(corpus, [item], {}, [directory])
            mask[15, 15] = 0; extra['scene']['visibleDistractorPixels']['neighbor'] -= 1
            extra['perturbations']['exposure'] = .5; save()
            with self.assertRaisesRegex(ValueError, 'nonintervened'):
                training_scenes(corpus, [item], {}, [directory])


if __name__ == '__main__': unittest.main()
