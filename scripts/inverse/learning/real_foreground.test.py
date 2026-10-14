"""Real annotations must not turn unknown edges into negative supervision."""
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image
import torch

from foreground import foreground_loss
from real_foreground import known_region_metrics, load_real_labels, masked_foreground_loss
from real_annotations import build, checked_annotations, digest, photo_tensor, rasterize, validate_polygon, verify
from real_probe import export_real_probe


def fixture(root):
    photo = Image.new('RGB', (80, 40), '#ac3344'); photo.save(root/'photo.png')
    source = {'id': 'source', 'sha256': digest((root/'photo.png').read_bytes()), 'width': 80, 'height': 40,
              'localPath': 'photo.png', 'kind': 'photo', 'splitStatus': 'unassigned', 'nearDuplicateGroup': 'duplicate-a',
              'splitGroupId': 'source-a', 'trainingRightsStatus': 'not-cleared'}
    row = {'id': 'body', 'assetId': 'source', 'imageSha256': source['sha256'], 'sourceSize': [80, 40],
           'review': {'status': 'initial-reviewed', 'note': 'Test fixture, not a source photograph.'},
           'motif': {'candidateFamily': 'fixture', 'crossCorpusReview': 'pending'}, 'allocation': 'unassigned',
           'foregroundPolygons': [[[20, 10], [60, 10], [60, 30], [20, 30]]],
           'unknownPolygons': [[[25, 15], [35, 15], [35, 25], [25, 25]]],
           'boundaryUncertaintyPixels': 1, 'overlapCorners': None}
    manifest = {'assets': [source]}
    annotations = {'schema': 'woven-heart-real-annotations-1', 'instances': [row]}
    mp, ap = root/'sources.json', root/'annotations.json'
    mp.write_text(json.dumps(manifest)); ap.write_text(json.dumps(annotations))
    return row, source, manifest, annotations, mp, ap


class RealForegroundTests(unittest.TestCase):
    def test_full_photo_probe_preserves_pixels_field_and_letterbox_without_geometry_hints(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); _, source, _, _, mp, ap = fixture(root)
            labels = root/'labels'; build(mp, ap, labels, 80, root)
            yy, xx = np.mgrid[:80, :80]
            probability = ((xx+2*yy)/237).astype(np.float32)
            probe = export_real_probe(root/'probe', {'body': probability}, labels, ap, 'checkpoint', mp, root)
            row = probe['rows'][0]
            self.assertEqual(row['window'], [0., -20., 80., 60.])
            self.assertEqual(row['dimensions'], [80, 40])
            self.assertIsNone(row['roi']); self.assertIsNone(row['inferenceSeconds'])
            self.assertFalse({'quad', 'labels', 'canonical', 'target', 'foregroundPolygons'} & set(row))
            self.assertEqual(row['originalPhotoSha256'], source['sha256'])
            np.testing.assert_array_equal(np.asarray(Image.open(row['file'])), np.asarray(Image.open(root/'photo.png')))
            asset = row['assets']['probability.f32']; raw = (root/'probe'/asset['path']).read_bytes()
            self.assertEqual(digest(raw), asset['sha256'])
            np.testing.assert_array_equal(np.frombuffer(raw, dtype='<f4').reshape(80, 80), probability)
            self.assertEqual(probe['labelsAudit'], verify(mp, ap, labels, root))
            with self.assertRaises(FileExistsError):
                export_real_probe(root/'probe', {'body': probability}, labels, ap, 'checkpoint', mp, root)
            with self.assertRaisesRegex(ValueError, 'identities'):
                export_real_probe(root/'bad-id', {'another-body': probability}, labels, ap, 'checkpoint', mp, root)
            probability[0, 0] = float('nan')
            with self.assertRaisesRegex(ValueError, 'probability'):
                export_real_probe(root/'bad-field', {'body': probability}, labels, ap, 'checkpoint', mp, root)
            self.assertFalse((root/'bad-field').exists())

    def test_pixel_centres_letterbox_and_unknown_regions(self):
        with tempfile.TemporaryDirectory() as tmp:
            row, *_ = fixture(Path(tmp))
            labels, transform = rasterize(row, 80)
            self.assertEqual(transform, {'scale': 1., 'offset': [0., 20.], 'resolution': 80})
            # Analytic axis-aligned fixture, independent of polygon rendering.
            yy, xx = np.mgrid[:80, :80]; x, y = xx+.5, yy+.5-20
            self.assertTrue(np.all(labels[(y < 0) | (y >= 40)] == 255))
            self.assertTrue(np.all(labels[(x > 37) & (x < 59) & (y > 11) & (y < 29)] == 1))
            self.assertTrue(np.all(labels[(x > 25) & (x < 35) & (y > 15) & (y < 25)] == 255))
            self.assertTrue(np.all(labels[(x < 18) & (y >= 0) & (y < 40)] == 0))
            photo = Image.fromarray(np.stack(np.meshgrid(np.arange(80, dtype=np.uint8), np.arange(40, dtype=np.uint8))+[np.zeros((40, 80), np.uint8)], axis=-1))
            # Exact one-to-one observed sampling despite padding.
            np.testing.assert_array_equal(np.asarray(photo_tensor(photo, transform))[20:60], np.asarray(photo))

    def test_geometry_and_qa_contamination_are_rejected(self):
        for polygon in [[[0, 0], [10, 10], [0, 10], [10, 0]], [[0, 0], [0, 0], [1, 2]], [[0, 0], [2, 0], [3, float('nan')]], [[0, 0], [21, 0], [1, 2]]]:
            with self.assertRaises(ValueError): validate_polygon(polygon, [20, 20])
        with tempfile.TemporaryDirectory() as tmp:
            row, source, manifest, annotations, *_ = fixture(Path(tmp))
            self.assertEqual(len(list(checked_annotations(manifest, annotations))), 1)
            for kind in ['photo-multiple', 'mixed-photo-template', 'photo-collage']:
                source['kind'] = kind
                self.assertEqual(len(list(checked_annotations(manifest, annotations))), 1)
            for kind in ['template-render', 'photo-other-material', 'unknown']:
                source['kind'] = kind
                with self.assertRaisesRegex(ValueError, 'reviewed photograph'):
                    list(checked_annotations(manifest, annotations))
            source['kind'] = 'photo'
            source['splitStatus'] = 'qa-reserved'
            with self.assertRaisesRegex(ValueError, 'reserved'): list(checked_annotations(manifest, annotations))
            source['splitStatus'] = 'unassigned'; row['allocation'] = 'train'
            with self.assertRaisesRegex(ValueError, 'allocation'): list(checked_annotations(manifest, annotations))

    def test_downsampling_filters_printed_texture_before_affine_sampling(self):
        rgb = np.zeros((256, 256, 3), np.uint8); rgb[:, ::8] = 255
        transform = {'scale': .125, 'offset': [0, 0], 'resolution': 32}
        resized = np.asarray(photo_tensor(Image.fromarray(rgb), transform))
        # One white stripe per eight source pixels: interior output pixels
        # should integrate to ~1/8 white. A four-sample affine resize misses
        # every stripe and falsely produces pure black on this exact fixture.
        self.assertTrue(np.all(abs(resized[4:-4, 4:-4].astype(float)-255/8) < 1))

    def test_export_preserves_source_groups_and_detects_semantic_tampering(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); row, source, manifest, annotations, mp, ap = fixture(root)
            output = root/'labels'; audit = build(mp, ap, output, 80, root)
            self.assertTrue(audit['passed'])
            items, _ = load_real_labels(output, mp, ap, root)
            self.assertEqual(items[0]['splitGroupId'], source['splitGroupId'])
            self.assertTrue(np.any(items[0]['weight'] == 0))
            with self.assertRaises(FileExistsError): build(mp, ap, output, 80, root)
            # A malicious/accidental mask rewrite must fail even with a new hash.
            result = json.loads((output/'manifest.json').read_text())
            asset = result['instances'][0]['assets']['labels']
            Image.new('L', (80, 80), 0).save(output/asset['path'])
            asset['sha256'] = digest((output/asset['path']).read_bytes())
            (output/'manifest.json').write_text(json.dumps(result))
            with self.assertRaisesRegex(ValueError, 'reviewed polygons'): verify(mp, ap, output, root)

    def test_unknown_pixels_have_zero_gradient_and_cannot_change_scores(self):
        logits = torch.zeros(2, 1, 8, 8, requires_grad=True)
        target = torch.zeros_like(logits); target[..., :4] = 1
        weight = torch.ones_like(logits); weight[..., 2:6, 2:6] = 0
        loss = masked_foreground_loss(logits, target, weight); loss.backward()
        self.assertTrue((logits.grad[weight == 0] == 0).all())
        self.assertTrue((logits.grad[(weight == 1) & (target == 1)] < 0).all())
        self.assertTrue((logits.grad[(weight == 1) & (target == 0)] > 0).all())
        changed = logits.detach().clone(); changed[weight == 0] = 50
        changed_target = torch.where(weight == 0, 1-target, target)
        self.assertEqual(loss.item(), masked_foreground_loss(changed, changed_target, weight).item())
        items = [{'id': 'a', 'target': target[0, 0].numpy(), 'weight': weight[0, 0].numpy()}]
        prediction = items[0]['target'].copy()
        original = known_region_metrics([prediction], items)
        prediction[items[0]['weight'] == 0] = 1-prediction[items[0]['weight'] == 0]
        self.assertEqual(original, known_region_metrics([prediction], items))
        self.assertEqual(original['macroMean']['knownRegionIoU'], 1)
        with self.assertRaisesRegex(ValueError, 'all-unknown'):
            masked_foreground_loss(logits, target, weight*0)

    def test_fully_known_loss_matches_existing_synthetic_objective(self):
        torch.manual_seed(17)
        logits = torch.randn(2, 1, 8, 8); target = (torch.rand_like(logits) > .5).float()
        self.assertAlmostEqual(masked_foreground_loss(logits, target, torch.ones_like(logits)).item(), foreground_loss(logits, target).item(), places=6)

    def test_scores_reject_malformed_weights_and_detect_known_pixel_errors(self):
        target = np.zeros((8, 8), np.float32); target[:4] = 1
        item = {'id': 'a', 'target': target, 'weight': np.ones_like(target)}
        imperfect = target.copy(); imperfect[0] = 0
        metric = known_region_metrics([imperfect], [item])['macroMean']
        self.assertEqual(metric['knownRegionIoU'], .75)
        self.assertEqual(metric['knownPaperFalseNegative'], .25)
        for weight in [np.ones((2, 2)), target+.5, target*np.nan]:
            with self.assertRaises(ValueError): known_region_metrics([target], [{**item, 'weight': weight}])


if __name__ == '__main__':
    torch.set_num_threads(2)
    unittest.main()
