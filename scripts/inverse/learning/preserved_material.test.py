import copy
import unittest

import torch

from foreground import ForegroundNet
from material_transfer import material_from_foreground
from material_training_policy import frozen_state_hash
from preserved_material import PreservedForegroundMaterialNet
from real_materials_learning import joint_material_loss


class PreservedMaterialTest(unittest.TestCase):
    def setUp(self):
        torch.set_num_threads(1);torch.manual_seed(9)
        self.body=ForegroundNet().eval()
        self.material=material_from_foreground(self.body).eval()
        with torch.no_grad():
            for layer in self.material.encoder[9:]:
                for p in layer.parameters():p.add_(.01*torch.randn_like(p))
            self.material.head[-1].weight[1].normal_(0,.1)

    def test_same_outputs_with_each_shared_block_executed_once(self):
        model=PreservedForegroundMaterialNet(self.body,self.material)
        calls=[0]*9;handles=[]
        for i,layer in enumerate(model.shared_encoder):
            def record(_layer,_inputs,_output,i=i):calls[i]+=1
            handles.append(layer.register_forward_hook(record))
        for shape in [(2,3,64,96),(1,3,256,256)]:
            rgb=torch.rand(shape)
            with torch.no_grad():
                expected=torch.cat([self.body(rgb),self.material(rgb)[:,1:2]],dim=1)
                actual=model(rgb)
            self.assertTrue(torch.equal(actual,expected))
        self.assertEqual(calls,[2]*9)
        for handle in handles:handle.remove()
        parents=sum(p.numel() for m in [self.body,self.material] for p in m.parameters())
        self.assertLess(sum(p.numel() for p in model.parameters()),parents)

    def test_training_changes_paper_without_changing_foreground_or_parent(self):
        before={k:v.clone() for k,v in self.material.state_dict().items()}
        model=PreservedForegroundMaterialNet(self.body,self.material).train()
        self.assertFalse(any(m.training for m in model.modules() if isinstance(m,torch.nn.BatchNorm2d)))
        frozen=frozen_state_hash(model);rgb=torch.rand(2,3,64,64)
        with torch.no_grad():initial=model(rgb).clone();expected=self.body(rgb)
        body=torch.ones(2,64,64);paper=torch.zeros_like(body);paper[:,:,32:]=1
        optimizer=torch.optim.AdamW(model.optimizer_groups())
        for _ in range(3):
            optimizer.zero_grad();joint_material_loss(model(rgb),body,paper).backward();optimizer.step()
        with torch.no_grad():final=model(rgb)
        self.assertTrue(torch.equal(final[:,:1],expected))
        self.assertFalse(torch.equal(final[:,1:],initial[:,1:]))
        self.assertEqual(frozen_state_hash(model),frozen)
        for k,v in self.material.state_dict().items():self.assertTrue(torch.equal(v,before[k]),k)
        self.assertTrue(all(not p.requires_grad for n,p in model.named_parameters() if n.startswith(('shared_encoder.','body_'))))
        restored=PreservedForegroundMaterialNet(self.body,self.material)
        restored.load_state_dict(model.state_dict())
        with torch.no_grad():self.assertTrue(torch.equal(restored(rgb),final))

    def test_constructor_preserves_rng_and_rejects_incompatible_sharing(self):
        rng=torch.get_rng_state().clone();PreservedForegroundMaterialNet(self.body,self.material)
        self.assertTrue(torch.equal(rng,torch.get_rng_state()))
        bad=copy.deepcopy(self.material)
        with torch.no_grad():next(bad.encoder[0].parameters()).add_(.01)
        with self.assertRaisesRegex(ValueError,'match exactly'):PreservedForegroundMaterialNet(self.body,bad)
        for split in [True,1,12]:
            with self.assertRaises(ValueError):PreservedForegroundMaterialNet(self.body,self.material,split)
        with self.assertRaises(ValueError):PreservedForegroundMaterialNet(self.material,self.material)


if __name__=='__main__':unittest.main()
