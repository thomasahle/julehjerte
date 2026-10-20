"""Audit a fixed expanded photo cohort without changing a model's training record."""
import hashlib
import json
from pathlib import Path


def read_pin(reference):
    raw = Path(reference['path']).read_bytes()
    if hashlib.sha256(raw).hexdigest() != reference['sha256']:
        raise ValueError('Evaluation input changed: '+reference['path'])
    return json.loads(raw)


def audit_pool(training, adaptation, selected, catalog, exclusions, previous, original):
    assets = {a['id']: a for a in catalog['assets']}
    if len(assets) != len(catalog['assets']):
        raise ValueError('Repeated catalog asset')
    real = [r for r in adaptation['trainingInputs'] if r['id'].startswith('real-')]
    if [r['id'] for r in real] != training['trainIds'] or not set(training['trainIds']) <= set(exclusions['trainIds']):
        raise ValueError('Expanded exclusions omit actual training inputs')
    if [(p['assetId'], p['imageSha256']) for p in previous['photos']] != [(p['assetId'], p['imageSha256']) for p in original['photos']]:
        raise ValueError('Previous development cohort differs from original training evaluation')
    train = []
    reserved = {a['splitGroupId'] for a in assets.values() if a['splitStatus'] == 'qa-reserved'}
    for row in real:
        a = assets[row['id'].rsplit('-body-', 1)[0]]
        if a['sha256'] != row['photoSha256'] or a['splitStatus'] != 'unassigned' or a['splitGroupId'] in reserved:
            raise ValueError('Training identity or source reservation changed')
        train.append(a)
    excluded = [assets[i.rsplit('-body-', 1)[0]] for i in exclusions['trainIds']]
    excluded += [assets[p['assetId']] for p in previous['photos']]
    if any(not a.get('sourceGroups') or not a.get('splitGroupId') or not a.get('nearDuplicateGroup') for a in assets.values()):
        raise ValueError('Missing source/duplicate grouping')
    groups = {g for a in excluded for g in a['sourceGroups']}
    splits = {a['splitGroupId'] for a in excluded}
    duplicates = {a['nearDuplicateGroup'] for a in excluded}
    eligible = sorted(a['id'] for a in assets.values() if a['kind'] == 'photo' and a['splitStatus'] == 'qa-reserved'
                      and min(a['width'], a['height']) >= 160 and not set(a['sourceGroups']) & groups
                      and a['splitGroupId'] not in splits and a['nearDuplicateGroup'] not in duplicates)
    if not eligible or [p['assetId'] for p in selected['photos']] != eligible:
        raise ValueError('Require all eligible reserved photos in fixed asset-ID order')
    for p in selected['photos']:
        a = assets[p['assetId']]
        expected = {'id': a['id']+'-body-1', 'imageSha256': a['sha256'], 'file': a['localPath'],
                    'dimensions': [a['width'], a['height']], **{k: a[k] for k in ['sourceGroups', 'splitGroupId', 'nearDuplicateGroup']}}
        if any(p.get(k) != v for k, v in expected.items()):
            raise ValueError('Selected photo identity or grouping differs from catalog')
    return {'schema': 'body-expanded-evaluation-audit-1', 'passed': True, 'trainingPhotos': len(train),
            'trainingExclusionPhotos': len(exclusions['trainIds']), 'priorDevelopmentPhotos': len(previous['photos']),
            'evaluationPhotos': len(eligible), 'evaluationSplitGroups': len({assets[i]['splitGroupId'] for i in eligible}),
            'allEligiblePhotosIncluded': True, 'sourceAndDuplicateSeparationPassed': True,
            'scope': 'Expanded development cohort; previously inspected photos are not claimed to be an untouched holdout.'}


def verify_body_evaluation(training, adaptation, selected, reference, extension=None):
    if extension is None:
        if training['evaluation'] != reference:
            raise ValueError('New evaluation requires an explicit pinned extension')
        return None
    policy = read_pin(extension)
    if policy['schema'] != 'body-evaluation-extension-1' or policy['selection'] != reference or policy['trainingPlan'] != adaptation['plan'] or policy['originalEvaluation'] != training['evaluation']:
        raise ValueError('Evaluation extension does not belong to this model and selection')
    if read_pin(reference) != selected:
        raise ValueError('Selected evaluation changed')
    catalog = read_pin(selected['sourceManifest'])
    exclusions = read_pin(selected['trainingExclusion'])
    previous = read_pin(selected['originalSelection'])
    original = read_pin(training['evaluation'])
    result = audit_pool(training, adaptation, selected, catalog, exclusions, previous, original)
    result.update(selection=reference, extension=extension, trainingPlan=adaptation['plan'], sourceManifest=selected['sourceManifest'])
    return result
