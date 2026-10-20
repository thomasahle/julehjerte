import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from body_evaluation import audit_pool, read_pin, verify_body_evaluation


def fixture():
    def asset(name, reserved):
        return {'id': 'real-'+name, 'sha256': name*64, 'kind': 'photo', 'width': 400, 'height': 300,
                'localPath': name+'.jpg', 'splitStatus': 'qa-reserved' if reserved else 'unassigned',
                'sourceGroups': ['publisher:'+name], 'splitGroupId': 'split-'+name, 'nearDuplicateGroup': 'duplicate-'+name}
    assets = [asset(n, n not in ['a', 'b']) for n in ['a', 'b', 'c', 'd', 'e']]
    def photo(a):
        return {'id': a['id']+'-body-1', 'assetId': a['id'], 'imageSha256': a['sha256'], 'file': a['localPath'],
                'dimensions': [a['width'], a['height']], **{k: a[k] for k in ['sourceGroups', 'splitGroupId', 'nearDuplicateGroup']}}
    training = {'trainIds': ['real-a-body-1']}
    adaptation = {'trainingInputs': [{'id': 'real-a-body-1', 'photoSha256': assets[0]['sha256']}, {'id': 'synthetic'}]}
    selected = {'photos': list(map(photo, assets[3:]))}
    catalog = {'assets': assets}; exclusions = {'trainIds': ['real-a-body-1', 'real-b-body-1']}
    previous = {'photos': [photo(assets[2])]}
    return training, adaptation, selected, catalog, exclusions, previous, copy.deepcopy(previous)


class EvaluationTests(unittest.TestCase):
    def test_complete_source_separated_pool(self):
        result = audit_pool(*fixture())
        self.assertTrue(result['passed'])
        self.assertEqual(result['trainingPhotos'], 1)
        self.assertEqual(result['trainingExclusionPhotos'], 2)
        self.assertEqual(result['evaluationPhotos'], 2)

    def test_rejects_omissions_and_training_or_development_group_leakage(self):
        for field in ['sourceGroups', 'splitGroupId', 'nearDuplicateGroup']:
            for excluded_index in [0, 1, 2]:
                f = fixture(); f[3]['assets'][3][field] = f[3]['assets'][excluded_index][field]
                with self.assertRaises(ValueError): audit_pool(*f)
        for mutate in [lambda f: f[2]['photos'].pop(),
                       lambda f: f[2]['photos'].reverse(),
                       lambda f: f[1]['trainingInputs'].append({'id': 'real-b-body-1', 'photoSha256': 'b'*64}),
                       lambda f: f[4]['trainIds'].remove('real-a-body-1')]:
            f = fixture(); mutate(f)
            with self.assertRaises(ValueError): audit_pool(*f)

    def test_rejects_changed_photo_or_missing_identity(self):
        for field, value in [('imageSha256', 'wrong'), ('file', 'wrong'), ('dimensions', [1, 1]), ('sourceGroups', [])]:
            f = fixture(); f[2]['photos'][0][field] = value
            with self.assertRaises(ValueError): audit_pool(*f)
        f = fixture(); f[3]['assets'][0]['sha256'] = 'wrong'
        with self.assertRaises(ValueError): audit_pool(*f)
        f = fixture(); f[3]['assets'][3]['sourceGroups'] = []
        with self.assertRaises(ValueError): audit_pool(*f)

    def test_new_pool_requires_pinned_authorization_for_this_checkpoint_plan(self):
        training, adaptation, selected, catalog, exclusions, previous, original = fixture()
        with tempfile.TemporaryDirectory() as directory:
            def save(name, value):
                p = Path(directory)/name; p.write_text(json.dumps(value))
                return {'path': str(p), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
            training['evaluation'] = save('original.json', original)
            adaptation['plan'] = save('training.json', training)
            selected.update(sourceManifest=save('catalog.json', catalog), trainingExclusion=save('exclusions.json', exclusions), originalSelection=save('previous.json', previous))
            reference = save('selected.json', selected)
            with self.assertRaises(ValueError): verify_body_evaluation(training, adaptation, selected, reference)
            self.assertIsNone(verify_body_evaluation(training, adaptation, original, training['evaluation']))
            policy = {'schema': 'body-evaluation-extension-1', 'selection': reference, 'trainingPlan': adaptation['plan'], 'originalEvaluation': training['evaluation']}
            extension = save('extension.json', policy)
            self.assertTrue(verify_body_evaluation(training, adaptation, selected, reference, extension)['passed'])
            policy['trainingPlan'] = reference
            with self.assertRaises(ValueError): verify_body_evaluation(training, adaptation, selected, reference, save('wrong.json', policy))
            Path(reference['path']).write_text('{}')
            with self.assertRaises(ValueError): read_pin(reference)


if __name__ == '__main__': unittest.main()
