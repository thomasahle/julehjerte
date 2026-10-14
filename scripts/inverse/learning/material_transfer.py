"""Extend a learned foreground model without resetting its body prediction."""
import copy
import torch
from torch import nn

from foreground import ForegroundNet
from real_materials_learning import MaterialNet


def material_from_foreground(foreground):
    """Copy the body model and initialize the material logit to zero.

    Existing tensors, training modes and feature-parameter gradient flags are
    preserved. The new two-channel output layer is trainable. The parent is not
    modified or aliased, and this operation does not consume the CPU RNG stream.
    Supports the ordinary uniform-dtype, single-device floating-point model.
    """
    if not isinstance(foreground, ForegroundNet) or isinstance(foreground, MaterialNet):
        raise ValueError('Require a one-output ForegroundNet')
    head = foreground.head[-1]
    if not isinstance(head, nn.Conv2d) or head.in_channels != 16 or head.out_channels != 1 or head.kernel_size != (1, 1) or head.bias is None:
        raise ValueError('Unexpected foreground output architecture')
    state = foreground.state_dict()
    if any(t.device != head.weight.device or t.is_floating_point() and t.dtype != head.weight.dtype for t in state.values()):
        raise ValueError('Require one device and floating-point dtype')
    # Construction allocates the ordinary architecture. Copy all learned state
    # immediately; isolate its random initialization from the training schedule.
    with torch.random.fork_rng(devices=[]):
        model = MaterialNet('random').to(device=head.weight.device, dtype=head.weight.dtype)
    weight_key = f'head.{len(foreground.head)-1}.weight'
    bias_key = f'head.{len(foreground.head)-1}.bias'
    if set(state) != set(model.state_dict()):
        raise ValueError('Foreground and material architectures differ')
    expanded = dict(state)
    weight = head.weight.detach().new_zeros((2, *head.weight.shape[1:]))
    bias = head.bias.detach().new_zeros(2)
    weight[0].copy_(head.weight.detach()[0]); bias[0].copy_(head.bias.detach()[0])
    expanded[weight_key], expanded[bias_key] = weight, bias
    model.load_state_dict(expanded, strict=True)
    model.initialization = copy.deepcopy(foreground.initialization)
    old_parameters = dict(foreground.named_parameters())
    for name, parameter in model.named_parameters():
        if name not in [weight_key, bias_key]:
            parameter.requires_grad_(old_parameters[name].requires_grad)
    # Parent/child modules can have deliberately different BatchNorm modes.
    old_modules = dict(foreground.named_modules())
    for name, module in model.named_modules():
        module.train(old_modules[name].training)
    return model
