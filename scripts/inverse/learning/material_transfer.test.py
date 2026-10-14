"""Expanding the decoder must retain the trained foreground and frozen encoder."""
import sys
from pathlib import Path
import unittest
import torch

root=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(root/'scripts/inverse/datasets'))
sys.path.insert(0,str(root/'scripts/inverse/learning'))
from foreground import ForegroundNet
from material_transfer import material_from_foreground
from real_materials_learning import MaterialNet, joint_material_loss


class TransferTest(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(4321)
        self.source=ForegroundNet('random').eval()
        self.source.head.train()
        with torch.no_grad():
            self.source.head[-1].weight.fill_(.37)
            self.source.head[-1].bias.fill_(-.19)
            for name, tensor in self.source.encoder.state_dict().items():
                if name.endswith('running_mean'):tensor.fill_(.07)
                if name.endswith('running_var'):tensor.fill_(1.31)
        for p in self.source.encoder.parameters():p.requires_grad_(False)

    def test_learned_body_survives_and_material_starts_neutral(self):
        before={k:v.clone() for k,v in self.source.state_dict().items()}
        rng=torch.random.get_rng_state().clone()
        model=material_from_foreground(self.source)
        self.assertIsInstance(model,MaterialNet)
        self.assertTrue(torch.equal(rng,torch.random.get_rng_state()))
        rgb=torch.rand(2,3,64,64)
        with torch.no_grad():
            old=self.source(rgb);new=model(rgb)
        torch.testing.assert_close(new[:,:1],old,rtol=1e-6,atol=1e-7)
        self.assertTrue(torch.equal(new[:,1],torch.zeros_like(new[:,1])))
        self.assertFalse(any(p.requires_grad for p in model.encoder.parameters()))
        for key,value in self.source.state_dict().items():
            self.assertTrue(torch.equal(value,before[key]),key)
            self.assertNotEqual(value.data_ptr(),model.state_dict()[key].data_ptr(),key)
        for key,value in model.state_dict().items():
            if not key.startswith(f'head.{len(model.head)-1}.'):
                self.assertTrue(torch.equal(value,before[key]),key)
        self.assertEqual(dict((n,m.training) for n,m in self.source.named_modules()),dict((n,m.training) for n,m in model.named_modules()))

    def test_new_head_can_learn_without_mutating_parent_or_frozen_encoder(self):
        model=material_from_foreground(self.source)
        encoder={k:v.clone() for k,v in model.encoder.state_dict().items()}
        parent={k:v.clone() for k,v in self.source.state_dict().items()}
        rgb=torch.rand(2,3,64,64)
        body=torch.ones(2,64,64,dtype=torch.uint8)
        material=torch.zeros(2,64,64,dtype=torch.uint8);material[:,:,:16]=1
        optimizer=torch.optim.AdamW([p for p in model.parameters() if p.requires_grad],lr=.001)
        loss=joint_material_loss(model(rgb),body,material);loss.backward()
        self.assertGreater(model.head[-1].weight.grad[1].abs().sum().item(),0)
        optimizer.step()
        self.assertGreater(model.head[-1].weight[1].abs().sum().item(),0)
        for key,value in model.encoder.state_dict().items():self.assertTrue(torch.equal(value,encoder[key]),key)
        for key,value in self.source.state_dict().items():self.assertTrue(torch.equal(value,parent[key]),key)

    def test_double_precision_and_initialization_provenance_survive(self):
        self.source.double()
        self.source.initialization['transfer-test'] = {'nested': ['parent']}
        model = material_from_foreground(self.source)
        self.assertEqual(model.head[-1].weight.dtype, torch.float64)
        self.assertEqual(model.initialization, self.source.initialization)
        model.initialization['transfer-test']['nested'].append('child')
        self.assertEqual(self.source.initialization['transfer-test']['nested'], ['parent'])
        rgb = torch.rand(2, 3, 48, 64, dtype=torch.float64)
        with torch.no_grad():
            torch.testing.assert_close(model(rgb)[:, :1], self.source(rgb))

    def test_rejects_an_already_expanded_model(self):
        with self.assertRaisesRegex(ValueError,'one-output'):
            material_from_foreground(material_from_foreground(self.source))


if __name__=='__main__':
    torch.set_num_threads(2);torch.set_num_interop_threads(1)
    unittest.main()
