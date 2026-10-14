"""Partial identities must not invent boundaries or bypass source reservations."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image
import torch

from real_foreground import masked_foreground_loss
from real_annotations import build as build_body, digest
from real_materials import build, checked_materials, rasterize_materials, verify
from real_materials_learning import MaterialNet, joint_material_loss, load_material_labels


def fixture(root):
    Image.new('RGB', (80, 40), '#98a1c2').save(root/'photo.png')
    source = {'id': 'source', 'sha256': digest((root/'photo.png').read_bytes()), 'width': 80, 'height': 40,
              'localPath': 'photo.png', 'kind': 'photo', 'splitStatus': 'unassigned', 'sourceGroups': ['publisher'],
              'nearDuplicateGroup': 'duplicate', 'splitGroupId': 'group', 'trainingRightsStatus': 'not-cleared'}
    body = {'id': 'body', 'assetId': 'source', 'imageSha256': source['sha256'], 'sourceSize': [80, 40],
            'review': {'status': 'initial-reviewed', 'note': 'Analytic fixture.'},
            'motif': {'candidateFamily': 'fixture', 'crossCorpusReview': 'pending'}, 'allocation': 'unassigned',
            'foregroundPolygons': [[[10, 5], [70, 5], [70, 35], [10, 35]]],
            'unknownPolygons': [[[17, 17], [23, 17], [23, 23], [17, 23]]],
            'boundaryUncertaintyPixels': 1}
    parent = {'schema': 'woven-heart-real-annotations-1', 'instances': [body]}
    body_path = root/'body.json'; body_path.write_text(json.dumps(parent))
    item = {'id': 'body', 'boundaryUncertaintyPixels': 1,
            'review': {'status': 'initial-reviewed', 'note': 'Two conservative interiors; all other paper is unknown.'},
            'papers': {'paperA': {'description': 'Material A', 'polygons': [[[15, 10], [30, 10], [30, 30], [15, 30]]]},
                       'paperB': {'description': 'Material B', 'polygons': [[[50, 10], [65, 10], [65, 30], [50, 30]]]}}}
    annotations = {'schema': 'woven-heart-real-material-annotations-1',
                   'bodyAnnotations': [{'path': 'body.json', 'sha256': digest(body_path.read_bytes())}], 'instances': [item]}
    catalog = {'assets': [source]}; mp, ap = root/'sources.json', root/'materials.json'
    mp.write_text(json.dumps(catalog)); ap.write_text(json.dumps(annotations))
    current = root/'docs/inverse/datasets/real-manifest.json'
    current.parent.mkdir(parents=True); current.write_text(json.dumps(catalog))
    return body, item, catalog, annotations, mp, ap


class MaterialLabelTests(unittest.TestCase):
    def test_analytic_regions_keep_unpainted_body_background_and_contact_unknown(self):
        with tempfile.TemporaryDirectory() as tmp:
            body, item, *_ = fixture(Path(tmp))
            labels, materials, transform = rasterize_materials(item, body, 80)
            yy, xx = np.mgrid[:80, :80]; x, y = xx+.5, yy+.5-20
            expected = np.full((80, 80), 255, np.uint8)
            expected[(x > 16) & (x < 29) & (y > 11) & (y < 29)] = 0
            expected[(x > 51) & (x < 64) & (y > 11) & (y < 29)] = 1
            expected[labels != 1] = 255
            np.testing.assert_array_equal(materials, expected)
            self.assertEqual(transform, {'scale': 1., 'offset': [0., 20.], 'resolution': 80})
            self.assertEqual(labels[40, 40], 1); self.assertEqual(materials[40, 40], 255)
            self.assertEqual(labels[40, 5], 0); self.assertEqual(materials[40, 5], 255)
            self.assertEqual(labels[40, 20], 255); self.assertEqual(materials[40, 20], 255)

    def test_conflicting_materials_and_background_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            body, item, *_ = fixture(Path(tmp))
            changed = copy.deepcopy(item)
            changed['papers']['paperB']['polygons'] = item['papers']['paperA']['polygons']
            with self.assertRaisesRegex(ValueError, 'identities overlap'):
                rasterize_materials(changed, body, 80)
            changed['papers']['paperB']['polygons'] = [[[1, 10], [20, 10], [20, 20], [1, 20]]]
            with self.assertRaisesRegex(ValueError, 'known background'):
                rasterize_materials(changed, body, 80)
            changed['papers']['paperB']['polygons'] = [[[50, 10], [51, 10], [51, 11], [50, 11]]]
            with self.assertRaisesRegex(ValueError, 'needs known pixels'):
                rasterize_materials(changed, body, 80)

    def test_build_preserves_existing_body_and_rgb_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); *_, mp, ap = fixture(root)
            audit = build(mp, ap, root/'materials', 80, root)
            build_body(mp, root/'body.json', root/'original', 80, root)
            self.assertEqual(audit, verify(mp, ap, root/'materials', root))
            self.assertEqual((root/'materials/body-body.png').read_bytes(), (root/'original/body-labels.png').read_bytes())
            self.assertEqual((root/'materials/body-rgb.png').read_bytes(), (root/'original/body-rgb.png').read_bytes())
            items, _ = load_material_labels(root/'materials', mp, ap, root)
            self.assertEqual(items[0]['materials'].shape, (80, 80))
            with self.assertRaises(FileExistsError): build(mp, ap, root/'materials', 80, root)

    def test_forged_asset_is_rejected_even_with_a_matching_checksum(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); *_, mp, ap = fixture(root); output = root/'labels'
            build(mp, ap, output, 80, root)
            manifest_path = output/'manifest.json'; manifest = json.loads(manifest_path.read_text())
            asset = manifest['instances'][0]['assets']['materials']; path = output/asset['path']
            pixels = np.asarray(Image.open(path)).copy(); pixels[40, 40] = 1
            Image.fromarray(pixels).save(path); asset['sha256'] = digest(path.read_bytes())
            manifest_path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'pixels disagree'):
                verify(mp, ap, output, root)

    def test_body_reference_and_source_grouping_cannot_be_silently_changed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); *_, mp, ap = fixture(root); output = root/'labels'
            build(mp, ap, output, 80, root)
            manifest_path = output/'manifest.json'; manifest = json.loads(manifest_path.read_text())
            manifest['instances'][0]['splitGroupId'] = 'different'; manifest_path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'source grouping'): verify(mp, ap, output, root)
            (root/'body.json').write_text((root/'body.json').read_text()+' ')
            with self.assertRaisesRegex(ValueError, 'body annotation reference'): verify(mp, ap, output, root)

    def test_material_metadata_validation_and_escaping_references(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); _, item, catalog, annotations, *_ = fixture(root)
            for value in [0, -1, float('nan'), True]:
                item['boundaryUncertaintyPixels'] = value
                with self.assertRaisesRegex(ValueError, 'positive uncertainty'):
                    list(checked_materials(catalog, annotations, root))
            item['boundaryUncertaintyPixels'] = 1
            annotations['bodyAnnotations'][0]['path'] = '../outside.json'
            with self.assertRaisesRegex(ValueError, 'escaping body'):
                list(checked_materials(catalog, annotations, root))

    def test_current_qa_reservation_blocks_historical_material_training(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); _, _, catalog, _, mp, ap = fixture(root)
            output = root/'labels'; build(mp, ap, output, 80, root)
            catalog['assets'][0]['splitStatus'] = 'qa-reserved'
            (root/'docs/inverse/datasets/real-manifest.json').write_text(json.dumps(catalog))
            with self.assertRaisesRegex(ValueError, 'Current QA'):
                load_material_labels(output, mp, ap, root)
            self.assertEqual(len(load_material_labels(output, mp, ap, root, purpose='diagnostic')[0]), 1)

    def test_diagnostic_artifacts_cannot_be_promoted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); *_, mp, ap = fixture(root)
            output = root/'labels'; build(mp, ap, output, 80, root, purpose='diagnostic')
            with self.assertRaisesRegex(ValueError, 'Diagnostic material'):
                load_material_labels(output, mp, ap, root)
            with self.assertRaisesRegex(ValueError, 'purpose'):
                load_material_labels(output, mp, ap, root, purpose='bypass')


class MaterialLossTests(unittest.TestCase):
    def test_fractional_synthetic_coverage_preserves_the_boundary_gradient(self):
        body = torch.ones((1, 1, 1))
        materials = torch.full_like(body, .25)
        logits = torch.zeros((1, 2, 1, 1), requires_grad=True)
        joint_material_loss(logits, body, materials).backward()
        # d BCE / d logit = sigmoid(logit) - coverage = .5 - .25.
        # Thresholding the target would produce .5; ignoring it gives zero.
        self.assertEqual(float(logits.grad[0, 1, 0, 0]), .25)
        chosen = torch.tensor([[[[2.]], [[2.]]]])
        torch.testing.assert_close(joint_material_loss(chosen, body, materials),
                                   joint_material_loss(chosen, body, 1-materials))

    def test_swapping_whole_sheet_labels_is_equivalent_but_local_swaps_are_not(self):
        body = torch.ones((1, 2, 4), dtype=torch.uint8)
        materials = torch.tensor([[[0, 0, 1, 1], [1, 1, 0, 0]]], dtype=torch.uint8)
        logits = torch.stack([torch.full_like(body, 4, dtype=torch.float), (materials.float()*2-1)*4], dim=1)
        original = joint_material_loss(logits, body, materials)
        torch.testing.assert_close(original, joint_material_loss(logits, body, 1-materials))
        local = materials.clone(); local[:, 1] = 1-local[:, 1]
        self.assertGreater(float(joint_material_loss(logits, body, local)-original), 1.)
        # Each sample in a batch can use its own consistent identity assignment.
        mixed = torch.cat([materials, 1-materials])
        torch.testing.assert_close(original, joint_material_loss(logits.repeat(2, 1, 1, 1), body.repeat(2, 1, 1), mixed))

    def test_unknown_material_pixels_have_zero_gradient_and_do_not_erase_body(self):
        body = torch.tensor([[[1, 1], [0, 255]]], dtype=torch.uint8)
        materials = torch.tensor([[[0, 255], [255, 255]]], dtype=torch.uint8)
        logits = torch.zeros((1, 2, 2, 2), requires_grad=True)
        joint_material_loss(logits, body, materials).backward()
        self.assertLess(float(logits.grad[0, 0, 0, 1]), 0)  # Unpainted body still teaches occupancy.
        self.assertGreater(float(logits.grad[0, 0, 1, 0]), 0)
        self.assertEqual(float(logits.grad[0, 0, 1, 1]), 0)
        self.assertGreater(float(logits.grad[0, 1, 0, 0]), 0)  # Tie must not cancel the material gradient.
        self.assertTrue(torch.all(logits.grad[0, 1][materials[0] == 255] == 0))
        changed = logits.detach().clone(); changed[:, 1][materials == 255] = 100
        torch.testing.assert_close(joint_material_loss(logits, body, materials), joint_material_loss(changed, body, materials))

    def test_foreground_only_labels_keep_the_existing_loss(self):
        body = torch.tensor([[[1, 1], [0, 255]]], dtype=torch.uint8)
        logits = torch.randn((1, 2, 2, 2), generator=torch.Generator().manual_seed(1), requires_grad=True)
        unknown = torch.full_like(body, 255)
        expected = masked_foreground_loss(logits[:, :1], (body == 1)[:, None].float(), (body != 255)[:, None].float())
        actual = joint_material_loss(logits, body, unknown)
        torch.testing.assert_close(actual, expected)
        actual.backward(); self.assertTrue(torch.all(logits.grad[:, 1] == 0))

    def test_invalid_material_supervision_is_rejected(self):
        body = torch.zeros((1, 2, 2)); materials = torch.full_like(body, 255)
        logits = torch.zeros((1, 2, 2, 2))
        materials[0, 0, 0] = 1
        with self.assertRaisesRegex(ValueError, 'known selected paper'): joint_material_loss(logits, body, materials)
        materials[0, 0, 0] = 3
        with self.assertRaisesRegex(ValueError, 'label semantics'): joint_material_loss(logits, body, materials)
        materials.fill_(255); logits[0, 1, 0, 0] = float('nan')
        with self.assertRaisesRegex(ValueError, 'finite logits'): joint_material_loss(logits, body, materials)

    def test_rgb_model_has_separate_body_and_conditional_paper_heads(self):
        torch.set_num_threads(1)
        model = MaterialNet().eval()
        with torch.no_grad(): logits = model(torch.zeros((1, 3, 64, 64)))
        self.assertEqual(logits.shape, (1, 2, 64, 64))
        self.assertTrue(torch.isfinite(logits).all())


if __name__ == '__main__': unittest.main()
