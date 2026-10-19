import copy
import unittest
import torch

from real_materials_learning import MaterialNet, joint_material_loss
from real_finetune import freeze_encoder
from material_training_policy import configure_material_training, frozen_state_hash


class TrainingPolicyTest(unittest.TestCase):
    def setUp(self):
        torch.set_num_threads(1); torch.manual_seed(3)

    def test_default_is_the_existing_decoder_only_update(self):
        model=MaterialNet(); control=copy.deepcopy(model)
        groups,record=configure_material_training(model)
        self.assertEqual(record['trainableParameters'],freeze_encoder(control))
        self.assertEqual(record['trainableParameters'],9906)
        inputs=torch.rand(2,3,32,32);body=torch.ones(2,32,32);material=torch.zeros_like(body);material[:,:,16:]=1
        for current,params in [(model,groups),(control,[p for p in control.parameters() if p.requires_grad])]:
            optimizer=torch.optim.AdamW(params,lr=1e-3,weight_decay=1e-4)
            joint_material_loss(current(inputs),body,material).backward();optimizer.step()
        for name,value in model.state_dict().items():self.assertTrue(torch.equal(value,control.state_dict()[name]),name)

    def test_tail_updates_but_early_encoder_and_all_buffers_stay_fixed(self):
        model=MaterialNet();groups,record=configure_material_training(model,tail_blocks=3,encoder_lr=1e-4)
        frozen=frozen_state_hash(model);before={k:v.clone() for k,v in model.state_dict().items()}
        self.assertEqual(record['firstTrainableEncoderBlock'],9)
        self.assertTrue(all(not m.training for m in model.modules()))
        optimizer=torch.optim.AdamW(groups,weight_decay=1e-4)
        inputs=torch.rand(2,3,64,64);body=torch.ones(2,64,64);material=torch.zeros_like(body);material[:,:,32:]=1
        joint_material_loss(model(inputs),body,material).backward();optimizer.step()
        self.assertEqual(frozen_state_hash(model),frozen)
        state=model.state_dict()
        self.assertTrue(any(not torch.equal(before[name],state[name]) for name in record['trainableNames'] if name.startswith('encoder.')))
        for name,_ in model.named_buffers():self.assertTrue(torch.equal(before[name],state[name]),name)
        self.assertTrue(all(not p.requires_grad for name,p in model.named_parameters() if name.startswith('encoder.0.')))

    def test_changed_frozen_weights_are_detected_and_invalid_policies_rejected(self):
        model=MaterialNet();configure_material_training(model,tail_blocks=3,encoder_lr=1e-4)
        before=frozen_state_hash(model)
        with torch.no_grad():next(model.encoder[0].parameters()).add_(.01)
        self.assertNotEqual(frozen_state_hash(model),before)
        for tail,rate in [(-1,1e-4),(12,1e-4),(3,None),(3,.1)]:
            with self.assertRaises(ValueError):configure_material_training(model,tail_blocks=tail,encoder_lr=rate)


if __name__=='__main__':unittest.main()
