"""Load a completed fixed-head experiment with its immutable body parent."""
import importlib.util
import json
from pathlib import Path

import torch

from u2netp_relative_material import identity_model
from u2netp_adaptation import frozen_hash
from preserved_candidate import pinned
from data import digest


def module(file, name):
    spec = importlib.util.spec_from_file_location(name, file)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value


def load_material_candidate(directory):
    directory = Path(directory); raw = (directory/'report.json').read_bytes(); report = json.loads(raw)
    if report['schema'] != 'u2netp-material-training-1' or report['status'] != 'complete' or not report['frozenBodyExact']:
        raise ValueError('Require completed frozen-body material training')
    plan = json.loads(pinned(report['plan']).read_bytes())
    for file, sha in report['sourceHashes'].items(): pinned({'path': file, 'sha256': sha})
    source_file = pinned(plan['source']); source = json.loads(source_file.read_bytes()); root = source_file.parent
    for row in source['files']: pinned({'path': str(root/row['path']), 'sha256': row['sha256']})
    architecture = module(root/'model/u2net.py', 'u2netp_candidate_architecture')
    parent = architecture.U2NETP(3, 1).eval()
    parent.load_state_dict(torch.load(pinned(plan['checkpoint']), map_location='cpu', weights_only=True), strict=True)
    model = identity_model(parent, plan['protocol'].get('materialInput', 'raw')).eval()
    state = model.state_dict()
    head = torch.load(pinned({'path': str(directory/'identity.pt'), 'sha256': report['checkpointSha256']}), map_location='cpu', weights_only=True)
    if set(head) != {k for k in state if not k.startswith('body.')}:
        raise ValueError('Head checkpoint keys differ')
    state.update(head); model.load_state_dict(state, strict=True)
    if frozen_hash(model) != report['initialFrozenStateSha256']: raise ValueError('Immutable body changed')
    return model, plan, report, {'path': str(directory/'report.json'), 'sha256': digest(raw)}
