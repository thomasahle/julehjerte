"""Audit matched scene training and its complete photograph-to-template replay."""
import argparse
from collections import Counter
import json
from pathlib import Path
import statistics

from data import checked_asset, digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--study', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args(); root = Path(args.study); raw_reports = {}; verified = 0

    def read(path):
        raw = path.read_bytes(); result = json.loads(raw)
        if result.get('status') != 'complete': raise ValueError(f'Incomplete report: {path}')
        raw_reports[str(path)] = digest(raw)
        return result

    def assets(directory, records):
        nonlocal verified
        for asset in records:
            checked_asset(directory, asset); verified += 1

    training = {name: read(root/(name+'-trained')/'report.json') for name in ['control', 'scene']}
    a, b = training.values()
    for key in ['sources', 'splits', 'initialization', 'optimizer', 'parameters', 'trainingVariantSources']:
        if a[key] != b[key]: raise ValueError('Changed training '+key)
    budget = lambda r: [(h['epoch'], h['trainingViews'], h['optimizerUpdates'], h['backgroundDrawsSha256']) for h in r['history']]
    if budget(a) != budget(b): raise ValueError('Training budgets or background draws differ')
    if any(h['sceneViews'] for h in a['history']) or not any(h['sceneViews'] for h in b['history']): raise ValueError('Missing scene/control intervention')
    train_ids = set(a['splits']['train']['viewIds']); imports = []
    for name in ['training-batch', 'training-corners', 'verified-diagnostic']:
        directory = root/name; manifest = read(directory/'manifest.json')
        ids = {manifest['sourceManifestSha256'][:12]+':'+r['sourceViewId'] for r in manifest['rows']}
        if name == 'verified-diagnostic':
            if ids & train_ids: raise ValueError('Diagnostic views entered training')
        elif not ids <= train_ids: raise ValueError('Non-training source entered scene augmentation')
        baselines = {r['sourceViewId']: r for r in manifest['rows'] if r['variant'] == 'baseline'}
        for row in manifest['rows']:
            assets(directory, row['assets'].values())
            original = baselines[row['sourceViewId']]
            for target in ['photo-paper-a.png', 'photo-overlap-valid.png', 'crop-paper-a.png', 'crop-overlap-valid.png']:
                if row['assets'][target]['sha256'] != original['assets'][target]['sha256']: raise ValueError('Scene changed target pixels')
            baseline = next(r for r in manifest['baselineIdentities'] if r['sourceViewId'] == row['sourceViewId'])
            if original['assets']['photo.jpg']['sha256'] != baseline['imageHashes']['photo.jpg']: raise ValueError('Changed original photograph')
        imports.append({'path': str(directory), 'sourceViews': len(ids), 'rowsIncludingBaselines': len(manifest['rows']), 'summary': manifest['summary']})

    diagnostics, probes, replays, evaluations, rows = {}, {}, {}, {}, []
    for name in ['control', 'scene']:
        run = training[name]
        assets(root/(name+'-trained'), [{'path': f, 'sha256': h} for f, h in run['artifacts'].items()])
        diagnostic = read(root/(name+'-diagnostic')/'report.json')
        if diagnostic['probeManifestSha256'] != raw_reports[str(root/'verified-diagnostic/manifest.json')] or diagnostic['checkpointSha256'] != run['checkpointSha256']:
            raise ValueError('Diagnostic checkpoint or source changed')
        assets(root/(name+'-diagnostic'), [{'path': f, 'sha256': h} for f, h in diagnostic['artifacts'].items()])
        diagnostics[name] = {'metrics': {k: {field: v for field, v in m.items() if field != 'rows'} for k, m in diagnostic['metrics'].items()},
                             'paired': diagnostic['paired']}
        probe = read(root/(name+'-probe')/'manifest.json'); probes[name] = probe
        if probe['checkpointSha256'] != run['checkpointSha256']: raise ValueError('Exported checkpoint changed')
        for row in probe['rows']:
            if digest(Path(row['file']).read_bytes()) != row['photoSha256']: raise ValueError('Changed replay photograph')
            assets(root/(name+'-probe'), row['assets'].values())
        replay = read(root/(name+'-replay')/'report.json'); replays[name] = replay
        if replay['probeManifestSha256'] != raw_reports[str(root/(name+'-probe')/'manifest.json')]: raise ValueError('Replay source changed')
        for row in replay['rows']:
            assets(root/(name+'-replay'), row['assets'].values())
            saved = {k: v for k, v in row.items() if k in ['id', 'caseId', 'group', 'status', 'cropEvidence', 'cornerErrorsPixels', 'classifiedReference', 'exportedReference', 'independentImageError', 'checkedPair', 'error']}
            saved['quad'] = (row.get('selectedCrop') or {}).get('quad')
            saved['experiment'] = name
            saved['totalMeasuredSeconds'] = sum(row.get(k, 0) for k in ['inferenceSeconds', 'cropSeconds', 'prepareSeconds', 'solveSeconds'])
            if 'report' in row and 'slits' in row['report']:
                saved['slits'] = row['report']['slits']; saved['templateChecksPassed'] = row['report']['templateChecksPassed']
            rows.append(saved)
        evaluations[name] = {}
        for domain in ['real', 'synthetic']:
            subset = [r for r in replay['rows'] if (r['group'] == 'real') == (domain == 'real')]
            evaluations[name][domain] = {'views': len(subset), 'statuses': dict(Counter(r['status'] for r in subset)),
                                         'supportedOutlines': sum(r['cropEvidence']['outlineSupported'] is True for r in subset),
                                         'checkedPairs': sum(bool(r.get('checkedPair')) for r in subset)}
    identities = lambda p: [{k: r[k] for k in ['id', 'photoSha256', 'roi', 'window']} for r in p['rows']]
    if identities(probes['control']) != identities(probes['scene']): raise ValueError('Replay input windows differ')
    for key in ['configuration', 'methods', 'foregroundRefinement', 'sourceHashes']:
        if replays['control'][key] != replays['scene'][key]: raise ValueError('Pipeline implementation or settings differ')
    common = [{r['id']: r for r in replay['rows'] if r['group'] != 'real' and r.get('checkedPair')} for replay in replays.values()]
    shared = sorted(set(common[0]) & set(common[1]))
    result = {'schema': 'woven-heart-foreground-scene-study-1', 'decision': 'Offline experiment; no model added to the application.',
              'auditSourceSha256': digest(Path(__file__).read_bytes()), 'rawReports': raw_reports, 'verifiedReferencedArtifacts': verified,
              'matchedBackgroundDrawsAndUpdateBudgets': True, 'training': {name: {**{k: r[k] for k in ['selectedEpoch', 'checkpointSha256', 'parameters', 'sceneSampling', 'nativeInferenceSeconds']},
              'optimizerUpdates': sum(h['optimizerUpdates'] for h in r['history']), 'sceneViews': sum(h['sceneViews'] for h in r['history']),
              'metrics': {k: {f: v for f, v in m.items() if f != 'rows'} for k, m in r['learned'].items()}} for name, r in training.items()},
              'imports': imports, 'diagnostics': diagnostics, 'evaluation': evaluations, 'rows': rows,
              'commonAcceptedSynthetic': {'ids': shared, 'scores': {name: {field: statistics.mean(r[i]['exportedReference'][field] for i in shared) for field in ['mismatchFraction', 'observedFraction']} for name, r in zip(['control', 'scene'], common)} if shared else {}},
              'qualifications': ['Single training seed per condition; no real-photo training or checkpoint selection.',
                                  'Repeated synthetic diagnostics and recipe holdouts are not unseen motif/topology evaluation.',
                                  'Other hearts reuse the selected procedural design; the selected body is always in front.',
                                  'Matching background draws does not make the scene photos pixel-identical after blur/JPEG.',
                                  'Common synthetic case scores still depend on each crop\'s observed portion of the true overlap.',
                                  'Numerical crop/template acceptance is not verified physical corner truth or physical assembly.']}
    Path(args.output).write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({'verifiedArtifacts': verified, 'evaluation': evaluations}, indent=2))


if __name__ == '__main__': main()
