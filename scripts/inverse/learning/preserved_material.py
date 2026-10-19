"""One shared-prefix network with an immutable foreground branch.

Material adaptation may change its private encoder tail and decoder. The
foreground path and all BatchNorm statistics remain fixed, including when a
training caller invokes train(). No inference thresholds or geometry live here.
"""
import copy

import torch
from torch import nn
from torch.nn import functional as F

from foreground import ForegroundNet
from real_materials_learning import MaterialNet


class _Decoder(nn.Module):
    def __init__(self, model):
        super().__init__()
        self.lateral=copy.deepcopy(model.lateral)
        self.detail=copy.deepcopy(model.detail)
        self.head=copy.deepcopy(model.head)

    def forward(self, rgb, features):
        shape=features[1].shape[-2:]
        combined=sum(F.interpolate(layer(value),size=shape,mode='bilinear',align_corners=False)
                     for layer,value in zip(self.lateral,features))/len(features)
        combined=F.interpolate(combined,size=rgb.shape[-2:],mode='bilinear',align_corners=False)
        detail=self.detail(torch.cat([rgb,torch.zeros_like(rgb[:,:1])],dim=1))
        return self.head(torch.cat([combined,detail],dim=1))


class PreservedForegroundMaterialNet(nn.Module):
    def __init__(self, foreground, material, split=9):
        super().__init__()
        if not isinstance(foreground,ForegroundNet) or isinstance(foreground,MaterialNet) or not isinstance(material,MaterialNet):
            raise ValueError('Require an original foreground model and a material model')
        if (type(split) is not int or not 2<=split<len(foreground.encoder)
                or len(foreground.encoder)!=len(material.encoder)
                or foreground.feature_indices!=material.feature_indices):
            raise ValueError('Require matching architectures and a shared prefix with two feature levels')
        self.split=split;self.feature_indices=list(foreground.feature_indices)
        for name in ['mean','std']:
            a,b=getattr(foreground,name),getattr(material,name)
            if a.dtype!=b.dtype or a.device!=b.device or not torch.equal(a,b):
                raise ValueError('Input normalization, dtype and device must match')
            self.register_buffer(name,a.detach().clone())
        for index in range(split):
            a,b=foreground.encoder[index].state_dict(),material.encoder[index].state_dict()
            if a.keys()!=b.keys() or any(a[k].dtype!=b[k].dtype or a[k].device!=b[k].device or not torch.equal(a[k],b[k]) for k in a):
                raise ValueError('Shared encoder parameters and buffers must match exactly')
        self.shared_encoder=copy.deepcopy(foreground.encoder[:split])
        self.body_tail=copy.deepcopy(foreground.encoder[split:])
        self.material_tail=copy.deepcopy(material.encoder[split:])
        self.body_decoder=_Decoder(foreground)
        self.material_decoder=_Decoder(material)
        self.initialization={'foreground':copy.deepcopy(foreground.initialization),
                             'material':copy.deepcopy(material.initialization),'sharedPrefixBlocks':split}
        for name,parameter in self.named_parameters():
            parameter.requires_grad_(name.startswith(('material_tail.','material_decoder.')))
        self.train(False)

    def train(self, mode=True):
        super().train(mode)
        self.shared_encoder.eval();self.body_tail.eval();self.body_decoder.eval()
        # Affine parameters can adapt, running moments cannot drift on tiny folds.
        for module in self.modules():
            if isinstance(module,nn.modules.batchnorm._BatchNorm):module.eval()
        return self

    def _features(self, value, prefix_features, tail):
        features=list(prefix_features)
        for index,layer in enumerate(tail,self.split):
            value=layer(value)
            if index in self.feature_indices:features.append(value)
        return features

    def forward(self, rgb):
        value=(rgb-self.mean)/self.std;features=[]
        for index,layer in enumerate(self.shared_encoder):
            value=layer(value)
            if index in self.feature_indices:features.append(value)
        body=self.body_decoder(rgb,self._features(value,features,self.body_tail))
        paper=self.material_decoder(rgb,self._features(value,features,self.material_tail))[:,1:2]
        return torch.cat([body,paper],dim=1)

    def optimizer_groups(self, decoder_lr=1e-3, encoder_lr=1e-4):
        if not 0<encoder_lr<=decoder_lr<1:raise ValueError('Require positive rates with a slower encoder')
        return [{'params':list(self.material_decoder.parameters()),'lr':decoder_lr},
                {'params':list(self.material_tail.parameters()),'lr':encoder_lr}]
