from pathlib import Path
import subprocess
import tempfile
import unittest

from data import digest
from body_provenance import verify_body_sources


class BodyProvenanceTests(unittest.TestCase):
    def test_only_exact_historical_trainer_is_allowed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=root, stderr=subprocess.DEVNULL).decode().strip()
            git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid')
            driver = root/'scripts/inverse/learning/train-u2netp-body.py'
            driver.parent.mkdir(parents=True); driver.write_text('old trainer\n')
            model = driver.with_name('u2netp_adaptation.py'); model.write_text('original numerical implementation\n')
            report = {'sourceHashes': {str(p): digest(p.read_bytes()) for p in [driver, model]}}
            git('add', '.'); git('commit', '-qm', 'fixture'); report['sourceCommit'] = git('rev-parse', 'HEAD')
            self.assertEqual(verify_body_sources(report, root), [])
            driver.write_text('new trainer\n'); self.assertEqual(len(verify_body_sources(report, root)), 1)
            model.write_text('changed numerical implementation\n')
            with self.assertRaisesRegex(ValueError, 'Pinned candidate input changed'): verify_body_sources(report, root)
            model.write_text('original numerical implementation\n'); report['sourceHashes'][str(driver)] = '0'*64
            with self.assertRaisesRegex(ValueError, 'Historical body trainer hash differs'): verify_body_sources(report, root)


if __name__ == '__main__': unittest.main()
