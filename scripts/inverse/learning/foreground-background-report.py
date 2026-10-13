"""Audit the paired background experiment and summarize complete pipeline replays."""
import argparse
from collections import Counter
import json
from pathlib import Path
import statistics

from data import checked_asset, digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--study', required=True)
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    root, baseline = Path(args.study), Path(args.baseline)
    raw_reports, verified = {}, 0

    def read(path):
        raw = path.read_bytes(); result = json.loads(raw)
        if isinstance(result, dict) and 'status' in result and result['status'] != 'complete':
            raise ValueError(f'Incomplete experiment: {path}')
        raw_reports[str(path)] = digest(raw)
        return result

    def artifacts(directory, records):
        nonlocal verified
        for record in records:
            checked_asset(directory, record); verified += 1

    def flat_artifacts(directory, report):
        artifacts(directory, [{'path': name, 'sha256': sha} for name, sha in report['artifacts'].items()])

    training = {'original': read(baseline/'imagenet/report.json'),
                'background_augmented': read(root/'background-trained/report.json')}
    old, new = training.values()
    if old['splits'] != new['splits'] or old['initialization'] != new['initialization'] or old['optimizer'] != new['optimizer']:
        raise ValueError('Training splits, initialization or optimizer changed')
    budget = lambda r: [(h['epoch'], h['trainingViews'], h['optimizerUpdates']) for h in r['history']]
    if budget(old) != budget(new): raise ValueError('Training update budgets differ')
    train_ids = set(new['splits']['train']['viewIds'])
    imports = []
    for name in ['batch', 'corners']:
        path = root/'background-training'/name/'manifest.json'; manifest = read(path)
        ids = {manifest['sourceManifestSha256'][:12]+':'+r['sourceViewId'] for r in manifest['rows']}
        if not ids <= train_ids: raise ValueError('Non-training photograph entered augmentation')
        imports.append({'path': str(path), 'sha256': digest(path.read_bytes()), 'sourceViews': len(ids),
                        'sourceViewIds': sorted(ids),
                        'variantViewsIncludingBaseline': len(manifest['rows']), 'summary': manifest['summary']})
    diagnostic = read(root/'background-probe/manifest.json')
    if any(diagnostic['sourceManifestSha256'][:12]+':'+r['sourceViewId'] in train_ids for r in diagnostic['rows']):
        raise ValueError('Diagnostic view entered training')

    def train_summary(report):
        return {**{k: report[k] for k in ['selectedEpoch', 'parameters', 'checkpointSha256', 'initialization']},
                'optimizerUpdates': sum(h['optimizerUpdates'] for h in report['history']),
                'trainingEpochSeconds': sum(h['seconds'] for h in report['history']),
                'nativeInferenceMedianSeconds': report['nativeInferenceSeconds']['median'],
                'splits': {k: {'views': v['views'], 'geometries': len(v['geometryHashes'])} for k, v in report['splits'].items()},
                'metrics': {k: {n: x for n, x in v.items() if n != 'rows'} for k, v in report['learned'].items()}}

    for name, directory in [('original', baseline/'imagenet'), ('background_augmented', root/'background-trained')]:
        flat_artifacts(directory, training[name])
    controls = {}
    for name, directory in [('original', root/'background-evaluation'), ('background_augmented', root/'background-after')]:
        report = read(directory/'report.json'); flat_artifacts(directory, report)
        if report['probeManifestSha256'] != digest((root/'background-probe/manifest.json').read_bytes()):
            raise ValueError('Background diagnostic inputs changed')
        controls[name] = {'metrics': {k: {n: v for n, v in row.items() if n != 'rows'} for k, row in report['metrics'].items()},
                          'paired': {variant: {key: statistics.mean(r[key] for r in report['paired'] if r['variant'] == variant)
                                               for key in ['paperCoreMeanAbsoluteRGBChange', 'paperCoreMeanAbsolutePredictionChange', 'paperCoreFalseNegativeFraction']}
                                     for variant in report['metrics']}}

    original_probe = read(baseline/'probe/manifest.json'); new_probe = read(root/'augmented-probe/manifest.json')
    identity = lambda probe: [{k: row[k] for k in ['id', 'photoSha256', 'roi', 'window']} for row in probe['rows']]
    if identity(original_probe) != identity(new_probe): raise ValueError('Replay photographs or selection windows differ')
    for directory, manifest in [(baseline/'probe', original_probe), (root/'augmented-probe', new_probe)]:
        for row in manifest['rows']:
            if digest(Path(row['file']).read_bytes()) != row['photoSha256']: raise ValueError('Source photograph changed')
            artifacts(directory, row['assets'].values())

    evaluation, rows, replay_reports = {}, [], {}
    for name, directory in [('original', baseline/'replay'), ('seeded_rgb', root/'replay'), ('fill_holes', root/'holes'), ('background_augmented', root/'augmented-replay')]:
        report = read(directory/'report.json')
        replay_reports[name] = report
        expected_probe = root/'augmented-probe/manifest.json' if name == 'background_augmented' else baseline/'probe/manifest.json'
        if report['probeManifestSha256'] != digest(expected_probe.read_bytes()): raise ValueError('Replay probe mismatch')
        evaluation[name] = {}
        for row in report['rows']:
            artifacts(directory, row['assets'].values())
            if row['method'] != 'learned': continue
            saved = {k: row[k] for k in ['id', 'group', 'status', 'cropEvidence', 'cornerErrorsPixels', 'classifiedReference', 'exportedReference', 'independentImageError', 'checkedPair'] if k in row}
            saved['experiment'] = name
            if 'report' in row:
                saved.update({'slits': row['report']['slits'], 'templateChecksPassed': row['report']['templateChecksPassed'],
                              'independentFeaturesPassed': row['independentFeatures']['passed'], 'solveSeconds': row['solveSeconds'],
                              'totalMeasuredSeconds': sum(row.get(k, 0) for k in ['inferenceSeconds', 'cropSeconds', 'prepareSeconds', 'solveSeconds'])})
            else:
                detection = json.loads(checked_asset(directory, row['assets']['detection.json']).read_text())
                saved['initialRejectionReason'] = detection.get('proposal', {}).get('reason')
            rows.append(saved)
        for domain in ['real', 'synthetic']:
            selected = [r for r in report['rows'] if r['method'] == 'learned' and (r['group'] == 'real') == (domain == 'real')]
            valid = [r for r in selected if r.get('checkedPair')]
            evaluation[name][domain] = {'views': len(selected), 'statuses': dict(Counter(r['status'] for r in selected)),
                                        'supportedOutlines': sum(r['cropEvidence']['outlineSupported'] is True for r in selected),
                                        'checkedPairs': len(valid)}
            if domain == 'synthetic' and valid:
                evaluation[name][domain].update({'checkedPairMeanLatentMismatch': statistics.mean(r['exportedReference']['mismatchFraction'] for r in valid),
                                                 'checkedPairMeanObservedFraction': statistics.mean(r['exportedReference']['observedFraction'] for r in valid),
                                                 'checkedPairMaximumCornerErrorPixels': max(max(r['cornerErrorsPixels']) for r in valid)})

    common = {name: {r['id']: r for r in replay_reports[name]['rows'] if r['method'] == 'learned' and r['group'] != 'real' and r.get('checkedPair')}
              for name in ['original', 'background_augmented']}
    common_ids = sorted(set(common['original']) & set(common['background_augmented']))
    common_scores = {name: {'meanLatentMismatch': statistics.mean(records[ident]['exportedReference']['mismatchFraction'] for ident in common_ids),
                           'meanObservedFraction': statistics.mean(records[ident]['exportedReference']['observedFraction'] for ident in common_ids)}
                     for name, records in common.items()} if common_ids else {}
    result = {'schema': 'woven-heart-foreground-background-study-1',
              'decision': 'Keep offline: improved isolated-photo recovery, unresolved collage crops and one lost synthetic crop; visible defects remain in numerically accepted pairs.',
              'auditSourceSha256': digest(Path(__file__).read_bytes()), 'rawReports': raw_reports,
              'verifiedReferencedArtifacts': verified, 'unchangedTrainingSplitsAndUpdateBudgets': True,
              'training': {k: train_summary(v) for k, v in training.items()}, 'variantSampling': new['variantSampling'],
              'diagnostic': {'sourceManifestSha256': diagnostic['sourceManifestSha256'],
                             'sourceViewIds': sorted({r['sourceViewId'] for r in diagnostic['rows']}), 'variants': diagnostic['variants']},
              'trainingImports': imports, 'backgroundControls': controls, 'evaluation': evaluation, 'rows': rows,
              'commonAcceptedSynthetic': {'ids': common_ids, 'scores': common_scores,
                                          'qualification': 'Same case IDs, but errors remain conditional on each crop\'s observed portion of the true overlap.'},
              'qualifications': ['No real photograph is used for training or checkpoint selection. Original development loss selects epoch 20; threshold stays 0.5.',
                                 'Single training runs with equal update budgets, not a multi-seed estimate. Recipe holdouts are not topology-disjoint.',
                                 'All accepted new crop proposals are fitted and independently rendered. Geometry and source-feature acceptance thresholds are unchanged.',
                                 'The 12 synthetic pipeline views are fixed diagnostics; conditional latent errors cover only their observed true overlap.',
                                 'These repeatedly inspected real cases guide development. No claim of fresh unseen-photo generalization or a new full production benchmark.',
                                 'All six returned real crops remain needs_review. Numerical acceptance does not certify unknown original artwork or physical assembly.']}
    Path(args.output).write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({'verifiedReferencedArtifacts': verified, 'evaluation': evaluation}, indent=2))


if __name__ == '__main__': main()
