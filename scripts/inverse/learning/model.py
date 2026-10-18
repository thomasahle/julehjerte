"""Small offline proposal model. Its outputs are suggestions, never valid templates."""
import hashlib
from pathlib import Path

import torch
from torch import nn
from torch.nn import functional as F
import torchvision
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights


class ProposalNet(nn.Module):
    def __init__(self, initialization='random', checkpoint_directory=None):
        super().__init__()
        encoder = mobilenet_v3_small(weights=None)
        self.initialization = {'name': initialization, 'torchvision': torchvision.__version__}
        if initialization == 'imagenet':
            directory = Path(checkpoint_directory)
            directory.mkdir(parents=True, exist_ok=True)
            url = MobileNet_V3_Small_Weights.IMAGENET1K_V1.url
            state = torch.hub.load_state_dict_from_url(url, model_dir=str(directory), check_hash=True, weights_only=True, map_location='cpu')
            encoder.load_state_dict(state, strict=True)
            file = directory/url.rsplit('/', 1)[-1]
            self.initialization.update({'url': url, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'bytes': file.stat().st_size,
                                        'weights': 'TorchVision MobileNet_V3_Small_Weights.IMAGENET1K_V1',
                                        'note': 'Different checkpoint from the researched timm LAMB weights; TorchVision is already installed.'})
        elif initialization != 'random':
            raise ValueError('Initialization must be random or imagenet')
        # Retain the pretrained three-channel RGB stem. The classifier and final
        # expansion are unused; early spatial detail feeds the dense decoder.
        self.encoder = nn.Sequential(*list(encoder.features.children())[:12])
        self.feature_indices = [0, 1, 3, 8, 11]
        self.lateral = nn.ModuleList(nn.Conv2d(channels, 24, 1) for channels in [16, 16, 24, 48, 96])
        self.detail = nn.Sequential(nn.Conv2d(4, 8, 3, padding=1), nn.ReLU())
        self.head = nn.Sequential(nn.Conv2d(32, 16, 3, padding=1), nn.GroupNorm(4, 16), nn.ReLU(), nn.Conv2d(16, 2, 1))
        nn.init.constant_(self.head[-1].bias, -2)
        self.register_buffer('mean', torch.tensor([.485, .456, .406]).view(1, 3, 1, 1))
        self.register_buffer('std', torch.tensor([.229, .224, .225]).view(1, 3, 1, 1))

    def forward(self, rgb, mask):
        x = (rgb-self.mean)/self.std
        features = []
        for index, layer in enumerate(self.encoder):
            x = layer(x)
            if index in self.feature_indices:
                features.append(x)
        shape = features[1].shape[-2:]
        combined = sum(F.interpolate(layer(value), size=shape, mode='bilinear', align_corners=False) for layer, value in zip(self.lateral, features))/len(features)
        combined = F.interpolate(combined, size=rgb.shape[-2:], mode='bilinear', align_corners=False)
        return self.head(torch.cat([combined, self.detail(torch.cat([rgb, mask], dim=1))], dim=1))


def heatmap_loss(logits, targets, valid):
    # Separate heads retain equal total weight. Smooth targets tolerate pixel
    # quantization; the positive weight prevents rare junctions disappearing.
    positive = torch.tensor([12., 40.], device=logits.device).view(1, 2, 1, 1)
    loss = (torch.sigmoid(logits)-targets)**2 * (1+positive*targets) * valid
    return loss.sum()/(2*valid.sum().clamp(min=1))
