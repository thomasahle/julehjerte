import json
from pathlib import Path
import tempfile
import unittest

from body_schedule import training_draws
from data import digest


class BodyScheduleTests(unittest.TestCase):
    def test_original_full_draw_sequences_remain_exact(self):
        # Digests from the two previously audited 120-update training reports.
        for count, expected in [(16, '6aa4ef8906066b777c6b6933f46e9bb738afe41c954b51b9255dfc3e9224d9f5'),
                                (24, '7112ff3458f2de93650cdc5a0787af4c136bb743d55827815d8965aeb8ec3bb4')]:
            draws = training_draws({'protocol': {'seed': 20261020, 'updates': 120}}, 64, count)
            self.assertEqual(digest(json.dumps(draws, sort_keys=True, separators=(',', ':')).encode()), expected)

    def test_paired_schedule_keeps_common_synthetic_and_reflections(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory)/'schedule.json'
            schedule = {'schema': 'paired-body-exposure-schedule-1', 'syntheticCount': 3,
                        'trainIds': {'control': ['old'], 'candidate': ['old', 'new']},
                        'rows': [{'control': 0, 'candidate': 0, 'synthetic': 1, 'flips': [True, False]},
                                 {'control': 0, 'candidate': 1, 'synthetic': 2, 'flips': [False, True]}]}
            def plan(arm):
                file.write_text(json.dumps(schedule))
                return {'protocol': {'scheduleArm': arm, 'updates': 2}, 'trainIds': schedule['trainIds'][arm],
                        'drawSchedule': {'path': str(file), 'sha256': digest(file.read_bytes())}}
            control = training_draws(plan('control'), 3, 1); candidate = training_draws(plan('candidate'), 3, 2)
            self.assertEqual(control[0], candidate[0]); self.assertEqual(candidate[1]['real'], 1)
            self.assertEqual([d['synthetic'] for d in control], [d['synthetic'] for d in candidate])
            self.assertEqual([d['flips'] for d in control], [d['flips'] for d in candidate])
            p = plan('candidate'); file.write_text('changed')
            with self.assertRaises(ValueError): training_draws(p, 3, 2)
            for key, value in [('candidate', 2), ('candidate', -1), ('candidate', True), ('flips', [1, False]), ('synthetic', 3)]:
                original = schedule['rows'][1][key]; schedule['rows'][1][key] = value
                with self.assertRaisesRegex(ValueError, 'Invalid exposure draw'): training_draws(plan('candidate'), 3, 2)
                schedule['rows'][1][key] = original
            p = plan('candidate'); p['trainIds'] = ['new', 'old']
            with self.assertRaisesRegex(ValueError, 'different real photos'): training_draws(p, 3, 2)
            p = plan('candidate'); p['protocol']['updates'] = 3
            with self.assertRaisesRegex(ValueError, 'dimensions differ'): training_draws(p, 3, 2)

    def test_empty_or_boolean_dimensions_fail(self):
        for updates in [0, -1, True, 2.5]:
            with self.assertRaises(ValueError): training_draws({'protocol': {'updates': updates}}, 64, 16)


if __name__ == '__main__': unittest.main()
