import copy
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
import torch
from torch import nn

from exemplar_experiment import FrozenFeatures, reference
from u2netp_material_candidate import module


continuation = module(Path(__file__).with_name('continue-exemplar-projection.py'), 'continuation_test')


class Body(nn.Module):
    def __init__(self):
        super().__init__()
        self.stage1d = nn.Conv2d(3, 2, 1)
        self.stage2d = nn.AvgPool2d(2)

    def forward(self, value):
        return self.stage2d(self.stage1d(value))


class ExemplarExperimentTest(unittest.TestCase):
    def test_frozen_features_match_explicit_fields_and_release_hooks(self):
        torch.manual_seed(17)
        body = Body().eval().requires_grad_(False)
        protocol = {'contextResolution': 8, 'contextChannels': 4, 'layers': ['stage1d', 'stage2d']}
        item = {'input': torch.rand(3, 8, 8)}
        reader = FrozenFeatures(body, protocol)
        expected_first = body.stage1d(item['input'][None])
        expected_second = torch.nn.functional.interpolate(
            body.stage2d(expected_first), (8, 8), mode='bilinear', align_corners=False)
        actual = reader(item)
        torch.testing.assert_close(actual, torch.cat([expected_first, expected_second], 1)[0], rtol=0, atol=0)
        self.assertFalse(actual.requires_grad)
        self.assertEqual(reader.captured, {})
        reader.close()
        self.assertFalse(body.stage1d._forward_hooks)
        self.assertFalse(body.stage2d._forward_hooks)
        with self.assertRaisesRegex(ValueError, 'frozen'):
            FrozenFeatures(body.requires_grad_(True), protocol)
        with self.assertRaisesRegex(ValueError, 'frozen'):
            FrozenFeatures(body.requires_grad_(False).train(), protocol)

    def test_real_supervision_rejects_development_and_changed_geometry(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'annotations.json'
            corners = {'points': [[4, 1], [7, 4], [4, 7], [1, 4]], 'order': 'notch,right,tip,left'}
            annotation = {'instances': [{'id': 'train', 'imageSha256': 'photo-hash',
                                        'overlapCorners': corners, 'sourceSize': [8, 8]}]}
            path.write_text(json.dumps(annotation))
            example = {'id': 'train', 'source': reference(path), 'overlapCorners': corners}
            real = [{'id': 'train', 'evidence': {'photoSha256': 'photo-hash'}}]
            case = continuation.real_cases([example], real, ['development'])[0]
            np.testing.assert_allclose(case['matrix']@np.array([0, 0, 1]), [4, 1, 1], atol=1e-12)
            for examples, development in [([example], ['train']), ([example, example], [])]:
                with self.assertRaisesRegex(ValueError, 'Duplicate or development'):
                    continuation.real_cases(examples, real, development)
            changed = copy.deepcopy(example)
            changed['overlapCorners']['points'][0][0] += 1
            with self.assertRaisesRegex(ValueError, 'Changed reviewed corners'):
                continuation.real_cases([changed], real, [])
            with self.assertRaisesRegex(ValueError, 'another photograph'):
                continuation.real_cases([example], [{'id': 'train', 'evidence': {'photoSha256': 'other'}}], [])


if __name__ == '__main__':
    torch.set_num_threads(1)
    unittest.main()
