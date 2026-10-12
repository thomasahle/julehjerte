"""Offline tests for collection identity and public-pin parsing (no network)."""
import importlib.util
import io
import json
import base64
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from PIL import Image


def module(name, filename):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(filename))
    obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj);return obj


collector=module('collector','real-collect.py')
pinterest=module('pinterest','real-pinterest.py')


class CollectionTests(unittest.TestCase):
    def test_resume_merges_new_pages_groups_and_rights_for_cached_image(self):
        original={'imageUrl':'https://x/image.jpg','source':'publisher','sourcePages':['https://x/old'], 'sourceGroup':'family-one','rights':{'status':'unknown'}}
        asset={'origins':[original]}
        collector.merge_origin(asset, {**original, 'sourcePages':['https://x/new'], 'sourceGroup':'family-two','rights':{'status':'copyright-stated'}})
        self.assertEqual(len(asset['origins']),1)
        self.assertEqual(original['sourcePages'],['https://x/new','https://x/old'])
        self.assertEqual(original['sourceGroups'],['family-one','family-two'])
        self.assertEqual(original['rightsHistory'],[{'status':'unknown'},{'status':'copyright-stated'}])

    def test_qa_reservation_propagates_through_near_duplicates_and_source_family(self):
        rows=[{'id':'qa','nearDuplicateGroup':'same-photo','sourceGroups':['original'], 'splitStatus':'qa-reserved'},
              {'id':'repost','nearDuplicateGroup':'same-photo','sourceGroups':['pin-family'], 'splitStatus':'unassigned'},
              {'id':'crop','nearDuplicateGroup':'crop','sourceGroups':['pin-family'], 'splitStatus':'unassigned'},
              {'id':'new','nearDuplicateGroup':'new','sourceGroups':['new-source'], 'splitStatus':'unassigned'}]
        collector.assign_split_groups(rows)
        self.assertTrue(all(r['splitStatus']=='qa-reserved' for r in rows[:3]))
        self.assertEqual(len({r['splitGroupId'] for r in rows[:3]}),1)
        self.assertEqual(rows[3]['splitStatus'],'unassigned')

    def test_observed_largest_image_and_original(self):
        page=collector.Page('https://craft.example/post/')
        page.feed('<img src="small.jpg" srcset="medium.jpg 400w, large.jpg 1200w"><img src="small.jpg" data-orig-file="original.jpg">')
        self.assertEqual([r['url'] for r in page.images],['https://craft.example/post/large.jpg','https://craft.example/post/original.jpg'])

    def test_image_family_does_not_merge_different_photos(self):
        self.assertEqual(collector.image_family('https://x/wp-content/uploads/a-300x200.jpg'),'https://x/wp-content/uploads/a.jpg')
        self.assertNotEqual(collector.image_family('https://x/photos/a-300x200.jpg'),collector.image_family('https://x/photos/a.jpg'))

    def test_relative_unicode_urls_and_non_http_exclusion(self):
        self.assertEqual(collector.clean_url('../hjerte-æ.jpg#view','https://x/post/'),'https://x/hjerte-%C3%A6.jpg')
        self.assertIsNone(collector.clean_url('data:image/png;base64,abc'))
        self.assertIsNone(collector.clean_url('javascript:alert(1)'))

    def test_png_metadata_hashes_decoded_pixels(self):
        data=io.BytesIO();Image.new('RGB',(120,180),(5,35,65)).save(data,format='PNG')
        result=collector.metadata(data.getvalue())
        self.assertEqual((result['width'],result['height']),(120,180))
        self.assertEqual(result['decodedPixelsSha256'],collector.digest(Image.new('RGB',(120,180),(5,35,65)).tobytes()))
        self.assertEqual(len(result['dhash256']),64)

    def test_resume_rejects_corrupt_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'cache').mkdir();(root/'cache/file').write_bytes(b'changed')
            collector.save(root/'requests.json',{'https://example.com/photo.jpg':{'file':'cache/file','sha256':collector.digest(b'original')}})
            with self.assertRaisesRegex(ValueError,'SHA-256'):
                collector.Fetcher(root,offline=True).fetch('https://example.com/photo.jpg')

    def test_pin_uses_only_advertised_matching_original(self):
        text='<meta property="og:image" content="https://i.pinimg.com/736x/ab/cd/xx.jpg"><script>{"url":"https://i.pinimg.com/originals/ab/cd/xx.jpg","other":"https://i.pinimg.com/originals/ef/gh/yy.jpg"}</script>'
        self.assertEqual(pinterest.selected_image(text)[0],'https://i.pinimg.com/originals/ab/cd/xx.jpg')

    def test_pin_never_invents_original_url(self):
        text='<meta property="og:image" content="https://i.pinimg.com/736x/ab/cd/xx.jpg">'
        self.assertEqual(pinterest.selected_image(text)[0],'https://i.pinimg.com/736x/ab/cd/xx.jpg')
        with self.assertRaises(ValueError):pinterest.selected_image('<p>Please log in</p>')

    def test_pin_source_links_parsed_without_executing_script(self):
        text='<script data-relay-completed-request="true">window.fn("ignored", {"data":{"link":"https://artist.example/hearts","images_orig":{"url":"https://i.pinimg.com/originals/x.jpg"}}});</script>'
        self.assertEqual(pinterest.source_links(text),['https://artist.example/hearts'])

    def test_related_pin_requires_literal_link_or_typed_public_record(self):
        record={'__typename':'Pin','id':base64.b64encode(b'Pin:456').decode(),'images_orig':{'url':'https://i.pinimg.com/originals/actual.jpg'}}
        text='<script type="application/json">'+json.dumps({'pinId':'999','boardId':'888','main':record})+'</script><a href="/pin/123/">Main</a>'
        records=pinterest.public_related_records(text,'https://dk.pinterest.com/pin/123/')
        self.assertEqual(len(records),1)
        self.assertEqual(records[0]['url'],'https://dk.pinterest.com/pin/456/')
        self.assertEqual(records[0]['imageUrl'],'https://i.pinimg.com/originals/actual.jpg')
        self.assertEqual(records[0]['parentPin'],'https://dk.pinterest.com/pin/123/')

    def test_pin_resume_preserves_new_queries_and_related_parent_evidence(self):
        row={'url':'https://dk.pinterest.com/pin/123/','queries':['old'],'pageSha256':'page-sha',
             'publicRelatedPins':[{'url':'https://dk.pinterest.com/pin/456/','parentPin':'https://dk.pinterest.com/pin/123/'}]}
        pinterest.merge_discovery(row,{'url':row['url'],'queries':['new'],'parentPin':'https://dk.pinterest.com/pin/789/'})
        self.assertEqual(row['queries'],['new','old'])
        self.assertEqual(len(row['discoveryPaths']),2)
        queue=[];related=[]
        pinterest.enqueue_related(row,0,2,queue,related)
        self.assertEqual(queue[0]['parentPageSha256'],'page-sha')
        self.assertEqual(queue[0]['depth'],1)
        self.assertEqual(len(related),1)

    def test_multiple_pin_ledgers_count_revisited_pin_once_and_keep_success(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for name,status in [('pinterest','unavailable'),('pinterest-expanded','downloaded')]:
                (root/name).mkdir()
                collector.save(root/name/'imports.json',{'pins':[{'url':'https://dk.pinterest.com/pin/123/','status':status}]})
            with patch.object(collector,'ROOT',root):result=collector.pinterest_inventory(root)
            self.assertEqual(len(result['runs']),2)
            self.assertEqual(len(result['pins']),1)
            self.assertEqual(result['pins'][0]['status'],'downloaded')
            self.assertEqual(len(result['pins'][0]['runReferences']),2)


if __name__=='__main__':unittest.main()
