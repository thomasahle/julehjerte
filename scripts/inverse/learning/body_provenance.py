"""Allow a historical training driver, but no changed numerical dependency."""
from pathlib import Path
import re
import subprocess

from data import digest
from preserved_candidate import pinned


def verify_body_sources(report, root=Path(__file__).resolve().parents[3]):
    root = Path(root).resolve(); historical = []
    for file, expected in report['sourceHashes'].items():
        path = Path(file).resolve()
        if path.is_file() and digest(path.read_bytes()) == expected:
            continue
        relative = str(path.relative_to(root))
        if relative != 'scripts/inverse/learning/train-u2netp-body.py':
            pinned({'path': str(path), 'sha256': expected})
        commit = report['sourceCommit']
        if not re.fullmatch(r'[0-9a-f]{40}', commit):
            raise ValueError('Require exact historical source commit')
        saved = subprocess.run(['git', 'show', commit+':'+relative], cwd=root, capture_output=True, check=True).stdout
        if digest(saved) != expected:
            raise ValueError('Historical body trainer hash differs')
        historical.append({'path': relative, 'commit': commit, 'sha256': expected})
    return historical
