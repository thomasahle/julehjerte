import unittest
import torch

from material_context import context_detail_logits
from real_materials_learning import MaterialNet


class MaterialContextTest(unittest.TestCase):
    def setUp(self):
        torch.set_num_threads(1)
        torch.manual_seed(42)
        self.model = MaterialNet().eval()

    def test_equal_scale_is_exactly_the_original_forward_and_preserves_weights(self):
        rgb = torch.rand(2,3,64,64)
        before = {k:v.clone() for k,v in self.model.state_dict().items()}
        with torch.inference_mode():
            actual = context_detail_logits(self.model,rgb,rgb)
            expected = self.model(rgb)
        self.assertTrue(torch.equal(actual,expected))
        for name, tensor in self.model.state_dict().items():
            self.assertTrue(torch.equal(tensor,before[name]),name)

    def test_encoder_keeps_whole_photo_scale_and_detail_sees_the_finer_pixels(self):
        seen = {}
        encoder = self.model.encoder[0].register_forward_pre_hook(lambda _, args: seen.update(context=tuple(args[0].shape)))
        detail = self.model.detail.register_forward_pre_hook(lambda _, args: seen.update(detail=tuple(args[0].shape)))
        context = torch.rand(1,3,64,64); fine = torch.rand(1,3,128,128)
        try:
            with torch.inference_mode():
                actual = context_detail_logits(self.model,context,fine)
                changed = context_detail_logits(self.model,context,1-fine)
            self.assertEqual(actual.shape,(1,2,128,128))
            self.assertEqual(seen,{'context':(1,3,64,64),'detail':(1,4,128,128)})
            self.assertGreater(float((actual-changed).abs().max()),0)
        finally:
            encoder.remove();detail.remove()

    def test_training_mode_and_misaligned_batches_are_rejected(self):
        rgb = torch.rand(1,3,64,64)
        with self.assertRaisesRegex(ValueError,'evaluation'):
            context_detail_logits(self.model.train(),rgb,rgb)
        self.model.eval()
        for fine in [torch.rand(2,3,128,128),torch.rand(1,3,128,64),torch.rand(1,3,120,120),rgb.double()]:
            with self.assertRaisesRegex(ValueError,'matching'):
                context_detail_logits(self.model,rgb,fine)


if __name__ == '__main__': unittest.main()
