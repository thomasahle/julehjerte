"""Score body and material predictions without hiding missing paper.

A/B names may exchange once per image, using every known material pixel. Keep
that assignment when scoring the joint body/material output. Unknown material
is not background, and missed body never disappears from material denominators.
"""
import numpy as np


def material_metrics(predictions, items):
    if not items or len(predictions) != len(items):
        raise ValueError('Require one prediction per annotated instance')
    ids = [item['id'] for item in items]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate annotated instance')
    rows = []
    for probability, item in zip(predictions, items):
        probability = np.asarray(probability)
        body, material = np.asarray(item['body']), np.asarray(item['materials'])
        if body.ndim != 2 or material.shape != body.shape or not np.isin(body, [0, 1, 255]).all():
            raise ValueError('Require matching body/material labels and known body semantics')
        if not (((material >= 0) & (material <= 1)) | (material == 255)).all():
            raise ValueError('Require fractional material coverage or unknown 255')
        if probability.shape != (2, *body.shape) or not np.isfinite(probability).all() or ((probability < 0) | (probability > 1)).any():
            raise ValueError('Require finite body/material probabilities in [0, 1]')
        known, paper, background = body != 255, body == 1, body == 0
        observed = material != 255
        if not known.any() or (observed & ~paper).any():
            raise ValueError('Material labels require known body; at least one body pixel is needed')
        predicted_body, predicted_material = probability >= .5
        union = (predicted_body | paper) & known
        row = {'id': item['id'], 'knownBodyPixels': int(known.sum()),
               'knownMaterialPixels': int(observed.sum()),
               'knownBackgroundPixels': int(background.sum()),
               'knownBodyWithoutMaterialPixels': int((paper & ~observed).sum()),
               'unknownBodyPixels': int((~known).sum()),
               'bodyIoU': float((predicted_body & paper).sum()/union.sum()) if union.any() else 1.,
               'bodyPixelError': float((predicted_body[known] != paper[known]).mean()),
               'bodyFalseNegative': float((~predicted_body[paper]).mean()) if paper.any() else None,
               'backgroundFalsePositive': float(predicted_body[background].mean()) if background.any() else None,
               'materialPhaseExchanged': None, 'materialPixelError': None,
               'materialJointError': None, 'jointRegionPixelError': None}
        joint_sum = float(predicted_body[background].sum())
        joint_count = int(background.sum())
        if observed.any():
            target = material[observed].astype(float)
            # Expected hard-classification error preserves fractional coverage;
            # it does not round antialiased synthetic boundaries into new labels.
            direct = np.where(predicted_material[observed], 1-target, target)
            exchange = bool((1-direct).sum() < direct.sum())
            error = 1-direct if exchange else direct
            joint = np.where(predicted_body[observed], error, 1.)
            row.update(materialPhaseExchanged=exchange,
                       materialPixelError=float(error.mean()),
                       materialJointError=float(joint.mean()))
            joint_sum += float(joint.sum())
            joint_count += int(observed.sum())
        row['jointKnownPixels'] = joint_count
        if joint_count:
            row['jointRegionPixelError'] = joint_sum/joint_count
        rows.append(row)
    keys = ['bodyIoU', 'bodyPixelError', 'bodyFalseNegative',
            'backgroundFalsePositive', 'materialPixelError',
            'materialJointError', 'jointRegionPixelError']
    return {'instances': len(rows), 'threshold': .5,
            'phasePolicy': 'One A/B exchange per image, selected from all known material pixels independently of predicted body; retained for joint scoring.',
            'scope': 'Partial known regions only. Unlabelled material is excluded from joint class scoring but remains in the separate body score. Missing body counts as a material joint error. Fractional labels score expected hard-classification disagreement. No complete-boundary, crop or cutting-template accuracy claim.',
            'macroMean': {key: float(np.mean([r[key] for r in rows if r[key] is not None])) if any(r[key] is not None for r in rows) else None for key in keys},
            'contributingInstances': {key: sum(r[key] is not None for r in rows) for key in keys},
            'rows': rows}
