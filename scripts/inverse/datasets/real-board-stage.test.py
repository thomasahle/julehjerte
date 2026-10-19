"""Offline acquisition invariants: preserve source bytes, cap downloads, deduplicate."""
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image

spec = importlib.util.spec_from_file_location('stage',Path(__file__).with_name('real-board-stage.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def image_bytes(color, format='PNG'):
    out = io.BytesIO()
    Image.new('RGB',(8,9),color).save(out,format=format)
    return out.getvalue()


class StageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.existing = self.base/'existing'
        self.out = self.base/'stage'
        self.selection = self.base/'selection.json'
        self.manifest = self.existing/'docs/inverse/datasets/real-manifest.json'
        self.manifest.parent.mkdir(parents=True)
        self.manifest.write_text(json.dumps({'assets':[]}))
        self.calls = []
        self.payloads = {}
        calls,payloads = self.calls,self.payloads
        class FakeFetcher:
            def __init__(self,out,**kwargs):
                self.out,self.requests,self.rate_limited_hosts = out,{},set()
                self.requests_file=out/'requests.json'
            def fetch(self,url,maximum,robots):
                calls.append((url,maximum))
                data=payloads[url]
                if len(data)>maximum:
                    raise ValueError('Exceeds byte limit')
                file='cache/'+module.common.digest(data)
                (self.out/'cache').mkdir(exist_ok=True)
                (self.out/file).write_bytes(data)
                return data,{'file':file,'retrievedAt':'fixture'}
        self.addCleanup(patch.stopall)
        patch.object(module.common,'Fetcher',FakeFetcher).start()
    def select(self,urls):
        self.selection.write_text(json.dumps({'boardUrl':'https://dk.pinterest.com/test/board/','reportedPinCount':len(urls),
            'pins':[{'url':f'https://dk.pinterest.com/pin/{i}/','imageUrl':u,'boardIndex':i} for i,u in enumerate(urls)]}))
    def run_stage(self,budget=20000):
        return module.stage(self.selection,self.existing,self.out,budget)
    def test_exact_existing_and_repeated_pins_are_hardlinked(self):
        data=image_bytes('red');sha=module.common.digest(data)
        source=self.existing/'photo.png';source.write_bytes(data)
        url='https://i.pinimg.com/originals/red.png'
        self.manifest.write_text(json.dumps({'assets':[{'id':'old','sha256':sha,'localPath':'photo.png','kind':'photo','origins':[{'imageUrl':url}]}]}))
        original=self.manifest.read_bytes();self.select([url,url]);ledger,manifest=self.run_stage()
        self.assertTrue(ledger['completeSelection']);self.assertEqual(self.calls,[])
        self.assertEqual(manifest['distinctFileHashes'],1);self.assertEqual(manifest['downloadedPins'],2)
        self.assertEqual((self.out/manifest['assets'][0]['localPath']).stat().st_ino,source.stat().st_ino)
        self.assertEqual(source.read_bytes(),data);self.assertEqual(self.manifest.read_bytes(),original)
    def test_png_and_gif_preserved_and_offline_resume_downloads_nothing(self):
        urls=['https://i.pinimg.com/originals/a.png','https://i.pinimg.com/originals/b.gif']
        self.payloads.update(zip(urls,[image_bytes('red'),image_bytes('white','GIF')]))
        self.select(urls);ledger,manifest=self.run_stage();self.assertTrue(ledger['completeSelection'])
        self.assertEqual({a['format'] for a in manifest['assets']},{'PNG','GIF'})
        before=list(self.calls);self.run_stage();self.assertEqual(self.calls,before)
        self.assertFalse(list((self.out/'cache').iterdir()))
    def test_total_acquisition_budget_applies_across_resume(self):
        first=image_bytes('red');second=image_bytes('blue')
        urls=['https://i.pinimg.com/originals/a.png','https://i.pinimg.com/originals/b.png']
        self.payloads.update(zip(urls,[first,second]));self.select(urls)
        ledger,manifest=self.run_stage(len(first))
        self.assertFalse(ledger['completeSelection']);self.assertEqual(manifest['downloadedNewImageBytes'],len(first))
        self.assertEqual(len(self.calls),1)
        self.run_stage(len(first));self.assertEqual(len(self.calls),1)
    def test_rejects_corrupted_existing_asset(self):
        url='https://i.pinimg.com/originals/a.png';(self.existing/'a.png').write_bytes(b'corrupted')
        self.manifest.write_text(json.dumps({'assets':[{'sha256':'wrong','localPath':'a.png','origins':[{'imageUrl':url}]}]}))
        self.select([url]);ledger,manifest=self.run_stage()
        self.assertFalse(ledger['completeSelection']);self.assertEqual(manifest['downloadedPins'],0)
        self.assertEqual(self.calls,[])
    def test_cannot_stage_inside_existing_worktree(self):
        self.select([]);self.out=self.existing/'new'
        with self.assertRaisesRegex(ValueError,'outside'):self.run_stage()
    def test_ignores_no_unadvertised_upgrades_or_external_hosts(self):
        self.select(['https://other.example/originals/test.jpg'])
        with self.assertRaisesRegex(ValueError,'advertised'):self.run_stage()
    def test_changed_inventory_cannot_resume_silently(self):
        url='https://i.pinimg.com/originals/a.png';self.payloads[url]=image_bytes('red');self.select([url]);self.run_stage()
        self.select([url,'https://i.pinimg.com/originals/new.png'])
        with self.assertRaisesRegex(ValueError,'changed'):self.run_stage()


if __name__=='__main__':unittest.main()
