from pathlib import Path
import subprocess
import tempfile
import unittest

from data import digest
from material_provenance import verify_material_sources


class MaterialProvenanceTests(unittest.TestCase):
    def test_historical_driver_but_current_model_required(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=root, stderr=subprocess.DEVNULL).decode().strip()
            git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid')
            driver = root/'scripts/inverse/learning/continue-u2netp-material.py'
            driver.parent.mkdir(parents=True); driver.write_text('old driver\n')
            model = driver.with_name('u2netp_material.py'); model.write_text('original numerical implementation\n')
            report = {'sourceHashes': {str(p): digest(p.read_bytes()) for p in [driver, model]}}
            git('add', '.'); git('commit', '-qm', 'fixture'); report['sourceCommit'] = git('rev-parse', 'HEAD')
            self.assertEqual(verify_material_sources(report, root), [])
            driver.write_text('new driver\n')
            self.assertEqual(len(verify_material_sources(report, root)), 1)
            # Even a recorded historical numerical implementation may not be
            # substituted for the implementation used to load/evaluate a model.
            model.write_text('changed numerical implementation\n')
            with self.assertRaisesRegex(ValueError, 'Pinned candidate input changed'):
                verify_material_sources(report, root)
            model.write_text('original numerical implementation\n')
            report['sourceHashes'][str(driver)] = '0'*64
            with self.assertRaisesRegex(ValueError, 'Historical producer hash differs'):
                verify_material_sources(report, root)


if __name__ == '__main__': unittest.main()
