"""Explicit loss ablations for the offline proposal model."""
import torch

from model import heatmap_loss


def balanced_heatmap_loss(logits, targets, valid):
    """Give each image/head equal foreground and background error weight.

    Sparse junctions otherwise contribute in proportion to their pixel area.
    Soft target values weight foreground; a fourth-power complement excludes
    the uncertain Gaussian shoulder from the strongest background weighting.
    Empty targets retain background supervision; an empty valid region is zero.
    """
    error = (torch.sigmoid(logits)-targets)**2
    foreground = targets*valid
    background = (1-targets)**4*valid
    dimensions = (-2, -1)
    foreground_error = (error*foreground).sum(dimensions)/foreground.sum(dimensions).clamp(min=1)
    background_error = (error*background).sum(dimensions)/background.sum(dimensions).clamp(min=1)
    return (foreground_error+background_error).mean()/2


LOSSES = {'weighted-mse': heatmap_loss, 'balanced-mse': balanced_heatmap_loss}
