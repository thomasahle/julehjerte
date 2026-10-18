"""Material supervision must retain phase, uncertainty and rare-paper errors."""
import unittest
import numpy as np
from material_pilot import conditional_material_labels, material_tensors, evaluate_materials


class PilotTest(unittest.TestCase):
    def test_fractional_targets_and_original_body_survive(self):
        body = np.zeros((12, 12), np.uint8); body[1:11, 1:11] = 1
        before = body.copy(); coverage = np.full((12, 12), .25, np.float32)
        target = conditional_material_labels(coverage, body)
        np.testing.assert_array_equal(body, before)
        self.assertTrue(np.all(target[3:9, 3:9] == .75))
        self.assertTrue(np.all(target[body == 0] == 255))
        self.assertTrue(np.all(target[1:3] == 255))
        self.assertEqual(int((target != 255).sum()), 36)
        for bad in [-1, 2, np.nan]:
            coverage[5, 5] = bad
            with self.assertRaises(ValueError): conditional_material_labels(coverage, body)

    def test_reflections_move_rgb_body_and_materials_together(self):
        body = np.array([[0, 1, 255], [1, 1, 0]], np.uint8)
        materials = np.array([[255, 0, 255], [1, .25, 255]], np.float32)
        rgb = np.arange(18, dtype=np.uint8).reshape(2, 3, 3)
        item = {'rgb': rgb, 'body': body, 'materials': materials}
        image, actual_body, actual_materials = material_tensors([item], (True, True))
        np.testing.assert_array_equal(actual_body[0], body[::-1, ::-1])
        np.testing.assert_array_equal(actual_materials[0], materials[::-1, ::-1])
        np.testing.assert_allclose(image[0].numpy().transpose(1, 2, 0), rgb[::-1, ::-1]/255)
        np.testing.assert_array_equal(item['materials'], materials)

    def test_dominant_paper_cannot_hide_rare_paper_failure(self):
        material = np.array([[0]*9+[1]], np.float32)
        item = {'id': 'imbalanced', 'body': np.ones_like(material), 'materials': material}
        prediction = np.stack([np.ones_like(material), np.zeros_like(material)])
        result = evaluate_materials([prediction], [item]); row = result['rows'][0]
        self.assertAlmostEqual(row['materialPixelError'], .1)
        self.assertEqual(row['perMaterial']['A']['jointError'], 0.)
        self.assertEqual(row['perMaterial']['B']['jointError'], 1.)
        self.assertEqual(result['macroMean']['balancedMaterialJointError'], .5)
        prediction[0, 0, -1] = 0
        self.assertEqual(evaluate_materials([prediction], [item])['rows'][0]['perMaterial']['B']['jointError'], 1.)

    def test_global_exchange_and_fractional_class_mass_remain_consistent(self):
        material = np.array([[.25, .75]], np.float32)
        item = {'id': 'fractional', 'body': np.ones_like(material), 'materials': material}
        p = np.array([[[1., 1.]], [[0., 1.]]])
        a = evaluate_materials([p], [item]); p[1] = 1-p[1]
        b = evaluate_materials([p], [item])
        self.assertEqual(a['macroMean'], b['macroMean'])
        self.assertEqual(a['rows'][0]['perMaterial'], b['rows'][0]['perMaterial'])
        self.assertEqual(a['rows'][0]['perMaterial']['A']['observedMass'], 1.)
        self.assertEqual(a['macroMean']['balancedMaterialJointError'], .25)


if __name__ == '__main__': unittest.main()
