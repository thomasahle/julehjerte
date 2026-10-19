"""Explicit decoder/encoder-tail policy with frozen BatchNorm statistics."""
import hashlib


def configure_material_training(model, *, tail_blocks=0, decoder_lr=1e-3, encoder_lr=None):
    if type(tail_blocks) is not int or not 0 <= tail_blocks < len(model.encoder):
        raise ValueError('Require a proper encoder tail or zero frozen-encoder blocks')
    if not 0 < decoder_lr < 1 or tail_blocks and (encoder_lr is None or not 0 < encoder_lr <= decoder_lr):
        raise ValueError('Require positive learning rates and an encoder rate no larger than the decoder rate')
    model.eval()  # Train affine weights if selected, but never update running statistics.
    start = len(model.encoder)-tail_blocks
    decoder, encoder = [], []
    names = []
    for name, parameter in model.named_parameters():
        is_encoder = name.startswith('encoder.')
        trainable = not is_encoder or int(name.split('.')[1]) >= start
        parameter.requires_grad_(trainable)
        if trainable:
            names.append(name)
            (encoder if is_encoder else decoder).append(parameter)
    groups = [{'params': decoder, 'lr': decoder_lr}]
    if encoder: groups.append({'params': encoder, 'lr': encoder_lr})
    return groups, {'tailBlocks':tail_blocks,'firstTrainableEncoderBlock':start,
                    'decoderLearningRate':decoder_lr,'encoderLearningRate':encoder_lr if tail_blocks else None,
                    'trainableNames':names,'trainableParameters':sum(p.numel() for group in groups for p in group['params'])}


def frozen_state_hash(model):
    """Hash all buffers and nontrainable parameters, including every BN statistic."""
    trainable = {name for name,p in model.named_parameters() if p.requires_grad}
    state = model.state_dict()
    return hashlib.sha256(b''.join(name.encode()+value.detach().cpu().contiguous().numpy().tobytes()
                                  for name,value in sorted(state.items()) if name not in trainable)).hexdigest()
