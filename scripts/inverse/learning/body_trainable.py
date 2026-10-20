"""Explicit encoder adaptation without changing historical decoder-only helpers."""
import math

from u2netp_adaptation import freeze_encoder


def encoder_options(protocol):
    options = protocol.get('encoderAdaptation')
    if options is None:
        return [], 1.
    if set(options) != {'stages', 'learningRateMultiplier'}:
        raise ValueError('Require encoder stages and learning-rate multiplier')
    stages, multiplier = options['stages'], options['learningRateMultiplier']
    if (not isinstance(stages, list) or not stages or
            any(type(s) is not int or not 1 <= s <= 6 for s in stages) or
            stages != sorted(set(stages))):
        raise ValueError('Require distinct ordered encoder stages 1 through 6')
    if type(multiplier) not in (int, float) or not math.isfinite(multiplier) or not 0 < multiplier <= 1:
        raise ValueError('Require finite encoder learning-rate multiplier in (0, 1]')
    return stages, multiplier


def configure_trainable(model, protocol):
    stages, _ = encoder_options(protocol)
    freeze_encoder(model)  # Includes eval mode: all BatchNorm statistics stay fixed.
    roots = {'stage'+str(s) for s in stages}
    present = {name.split('.')[0] for name, _ in model.named_parameters()}
    if not roots <= present:
        raise ValueError('Requested encoder stages absent from model')
    for name, parameter in model.named_parameters():
        if name.split('.')[0] in roots:
            parameter.requires_grad_(True)
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


def optimizer_parameters(model, protocol):
    stages, multiplier = encoder_options(protocol)
    # Preserve both order and the original optimizer's single group by default.
    if not stages:
        return [p for p in model.parameters() if p.requires_grad]
    roots = {'stage'+str(s) for s in stages}
    encoder, decoder = [], []
    for name, parameter in model.named_parameters():
        if parameter.requires_grad:
            (encoder if name.split('.')[0] in roots else decoder).append(parameter)
    if not encoder or not decoder:
        raise ValueError('Require trainable encoder and decoder groups')
    return [{'params': decoder}, {'params': encoder, 'lr': protocol['learningRate']*multiplier}]
