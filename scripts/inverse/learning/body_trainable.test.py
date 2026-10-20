import copy
import unittest

import torch
from torch import nn

from body_trainable import configure_trainable, encoder_options, optimizer_parameters
from u2netp_adaptation import freeze_encoder, frozen_hash


class TinyBody(nn.Module):
    def __init__(self):
        super().__init__()
        for i in range(1, 7):
            setattr(self, 'stage'+str(i), nn.Sequential(nn.Conv2d(3, 3, 1), nn.BatchNorm2d(3)))
        self.stage1d = nn.Conv2d(3, 3, 1)
        self.outconv = nn.Conv2d(3, 1, 1)

    def forward(self, x):
        for i in range(1, 7): x = getattr(self, 'stage'+str(i))(x)
        return self.outconv(self.stage1d(x))


class TrainableTests(unittest.TestCase):
    def setUp(self):
        torch.set_num_threads(1); torch.manual_seed(31)

    def test_default_keeps_original_optimizer_update_bitwise(self):
        old = TinyBody(); new = copy.deepcopy(old); protocol = {'learningRate': .001}
        freeze_encoder(old); configure_trainable(new, protocol)
        a = torch.optim.AdamW([p for p in old.parameters() if p.requires_grad], lr=.001)
        b = torch.optim.AdamW(optimizer_parameters(new, protocol), lr=.001)
        x = torch.rand(2, 3, 5, 5)
        for model, opt in [(old, a), (new, b)]:
            model(x).square().mean().backward(); opt.step()
        self.assertEqual(len(b.param_groups), 1)
        for name, tensor in old.state_dict().items(): self.assertTrue(torch.equal(tensor, new.state_dict()[name]), name)

    def test_only_selected_encoder_weights_change_with_statistics_frozen(self):
        model = TinyBody(); protocol = {'learningRate': .001, 'encoderAdaptation': {'stages': [4, 5, 6], 'learningRateMultiplier': .25}}
        configure_trainable(model, protocol); before = copy.deepcopy(model.state_dict()); frozen = frozen_hash(model)
        optimizer = torch.optim.AdamW(optimizer_parameters(model, protocol), lr=protocol['learningRate'])
        model(torch.rand(2, 3, 5, 5)).square().mean().backward(); optimizer.step()
        self.assertEqual([g['lr'] for g in optimizer.param_groups], [.001, .00025])
        self.assertEqual(frozen_hash(model), frozen)
        for name, value in model.named_buffers(): self.assertTrue(torch.equal(value, before[name]), name)
        for stage in range(1, 7):
            changed = any(not torch.equal(v, before[n]) for n, v in model.named_parameters() if n.startswith('stage'+str(stage)+'.'))
            self.assertEqual(changed, stage >= 4)
        self.assertTrue(all(p.grad is None for p in model.stage1.parameters()))

    def test_rejects_ambiguous_or_unbounded_encoder_configuration(self):
        for stages, multiplier in [([], .25), ([4, 4], .25), ([6, 4], .25), ([True], .25), ([7], .25), ([4], 0), ([4], float('nan')), ([4], True), ([4], 2)]:
            with self.assertRaises(ValueError):
                encoder_options({'encoderAdaptation': {'stages': stages, 'learningRateMultiplier': multiplier}})


if __name__ == '__main__': unittest.main()
