"""Pinned inputs and loading for one foreground-preserving material candidate."""
import copy
import json
from pathlib import Path

import torch

from data import digest
from foreground import load_foreground_run
from material_transfer import material_from_foreground
from material_training_policy import frozen_state_hash
from preserved_material import PreservedForegroundMaterialNet


def pinned(asset):
    path = Path(asset['path'])
    if digest(path.read_bytes()) != asset['sha256']:
        raise ValueError('Pinned candidate input changed: '+str(path))
    return path


def source_separation(training, evaluation, catalog):
    """Check source/duplicate separation, not just distinct instance names."""
    assets = {row['id']: row for row in catalog['assets']}
    if len(assets) != len(catalog['assets']) or not training or not evaluation:
        raise ValueError('Require distinct catalog assets and nonempty train/evaluation sets')
    train = [assets[row['assetId']] for row in training]
    held = [assets[row['assetId']] for row in evaluation]
    if len({r['assetId'] for r in training}) != len(training) or len({r['assetId'] for r in evaluation}) != len(evaluation):
        raise ValueError('Repeated photo in candidate protocol')
    reserved = {r['splitGroupId'] for r in assets.values() if r['splitStatus'] == 'qa-reserved'}
    for row, asset in zip(training, train):
        if asset['splitStatus'] != 'unassigned' or asset['splitGroupId'] in reserved:
            raise ValueError('Reserved source group entered candidate training')
        if row['imageSha256'] != asset['sha256']:
            raise ValueError('Training photo identity changed')
    for row, asset in zip(evaluation, held):
        if asset['splitStatus'] != 'qa-reserved' or row['imageSha256'] != asset['sha256']:
            raise ValueError('Evaluation photo is changed or not reserved')
    for field in ['id', 'sha256', 'nearDuplicateGroup', 'splitGroupId']:
        if any(not r.get(field) for r in train+held):
            raise ValueError('Missing source identity: '+field)
        if {r[field] for r in train} & {r[field] for r in held}:
            raise ValueError('Training/evaluation overlap: '+field)
    if {g for r in train for g in r['sourceGroups']} & {g for r in held for g in r['sourceGroups']}:
        raise ValueError('Training/evaluation overlap: sourceGroups')
    return {'trainPhotos': len(train), 'evaluationPhotos': len(held),
            'trainSourceGroups': len({r['splitGroupId'] for r in train}),
            'evaluationSourceGroups': len({r['splitGroupId'] for r in held}),
            'sourceAndDuplicateSeparationPassed': True}


def initial_candidate(plan):
    parent = pinned(plan['foregroundReport']).parent
    pinned(plan['foregroundCheckpoint'])
    foreground, report = load_foreground_run(parent)
    if report['checkpointSha256'] != plan['foregroundCheckpoint']['sha256']:
        raise ValueError('Foreground parent checkpoint differs')
    foreground.initialization = copy.deepcopy(report['initialization'])
    material = material_from_foreground(foreground)
    model = PreservedForegroundMaterialNet(foreground, material, split=9).eval()
    return model, foreground, report


def load_candidate(directory):
    directory = Path(directory)
    report = json.loads((directory/'report.json').read_bytes())
    if report.get('schema') != 'preserved-material-candidate-1' or report['status'] != 'complete':
        raise ValueError('Require a completed candidate')
    plan_path = pinned(report['plan'])
    plan = json.loads(plan_path.read_bytes())
    for file, expected in report['sourceHashes'].items():
        pinned({'path': file, 'sha256': expected})
    model, foreground, _ = initial_candidate(plan)
    if frozen_state_hash(model) != report['initialFrozenStateSha256']:
        raise ValueError('Initial immutable state changed')
    checkpoint = pinned({'path': str(directory/'model.pt'), 'sha256': report['checkpointSha256']})
    model.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True), strict=True)
    if frozen_state_hash(model) != report['initialFrozenStateSha256']:
        raise ValueError('Candidate checkpoint changed immutable foreground or buffers')
    return model.eval(), foreground.eval(), report
