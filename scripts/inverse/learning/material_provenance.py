"""Verify historical producers without accepting changed numerical dependencies.

Training drivers and the checkpoint loader may evolve after an experiment.
Their recorded bytes must still exist at its exact Git commit. Model, label,
preprocessing and loss implementations continue to require current byte parity.
Historical code is inspected as bytes, never executed.
"""
from pathlib import Path
import re
import subprocess

from data import digest
from preserved_candidate import pinned


PRODUCERS = frozenset('scripts/inverse/learning/'+name for name in [
    'train-u2netp-material.py', 'continue-u2netp-material.py', 'u2netp_material_candidate.py'])


def verify_material_sources(report, root=Path(__file__).resolve().parents[3]):
    root = Path(root).resolve(); historical = []
    for file, expected in report['sourceHashes'].items():
        path = Path(file).resolve()
        if path.is_file() and digest(path.read_bytes()) == expected:
            continue
        relative = str(path.relative_to(root))
        if relative not in PRODUCERS:
            pinned({'path': str(path), 'sha256': expected})
        commit = report['sourceCommit']
        if not re.fullmatch(r'[0-9a-f]{40}', commit):
            raise ValueError('Require exact historical source commit')
        saved = subprocess.run(['git', 'show', commit+':'+relative], cwd=root, capture_output=True, check=True).stdout
        if digest(saved) != expected:
            raise ValueError('Historical producer hash differs: '+relative)
        historical.append({'path': relative, 'commit': commit, 'sha256': expected})
    return historical
