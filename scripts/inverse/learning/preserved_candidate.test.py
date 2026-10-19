import copy
import unittest

from preserved_candidate import source_separation


class SourceSeparationTests(unittest.TestCase):
    def setUp(self):
        self.catalog = {'assets': [
            {'id': 'train', 'sha256': 'a', 'splitStatus': 'unassigned', 'splitGroupId': 'source-a',
             'nearDuplicateGroup': 'duplicate-a', 'sourceGroups': ['page-a']},
            {'id': 'evaluation', 'sha256': 'b', 'splitStatus': 'qa-reserved', 'splitGroupId': 'source-b',
             'nearDuplicateGroup': 'duplicate-b', 'sourceGroups': ['page-b']}]}
        self.train = [{'assetId': 'train', 'imageSha256': 'a'}]
        self.held = [{'assetId': 'evaluation', 'imageSha256': 'b'}]

    def test_disjoint_reserved_evaluation_is_allowed(self):
        result = source_separation(self.train, self.held, self.catalog)
        self.assertTrue(result['sourceAndDuplicateSeparationPassed'])
        self.assertEqual(result['evaluationSourceGroups'], 1)

    def test_different_ids_cannot_hide_source_or_near_duplicate_overlap(self):
        for field in ['nearDuplicateGroup', 'splitGroupId', 'sourceGroups']:
            catalog = copy.deepcopy(self.catalog)
            catalog['assets'][1][field] = catalog['assets'][0][field]
            with self.subTest(field=field), self.assertRaises(ValueError):
                source_separation(self.train, self.held, catalog)

    def test_a_related_reserved_asset_excludes_an_otherwise_unassigned_training_photo(self):
        catalog = copy.deepcopy(self.catalog)
        catalog['assets'].append({**catalog['assets'][0], 'id': 'reserved-relative',
                                  'sha256': 'c', 'splitStatus': 'qa-reserved'})
        with self.assertRaisesRegex(ValueError, 'Reserved source'):
            source_separation(self.train, self.held, catalog)

    def test_changed_bytes_or_duplicate_evaluation_are_rejected(self):
        with self.assertRaises(ValueError):
            source_separation(self.train, [{'assetId': 'evaluation', 'imageSha256': 'changed'}], self.catalog)
        with self.assertRaises(ValueError):
            source_separation(self.train, self.held*2, self.catalog)
        catalog = copy.deepcopy(self.catalog)
        catalog['assets'][1]['splitStatus'] = 'unassigned'
        with self.assertRaises(ValueError):
            source_separation(self.train, self.held, catalog)


if __name__ == '__main__': unittest.main()
