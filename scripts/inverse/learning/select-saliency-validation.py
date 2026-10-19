"""Freeze a source-balanced, previously unevaluated photo cohort before inference."""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps

digest = lambda data: hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', type=Path, required=True)
    parser.add_argument('--exposure', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    catalog = json.loads(args.catalog.read_bytes()); exposure = json.loads(args.exposure.read_bytes())
    assert exposure['schema'] == 'pipeline-exposure-audit-2'
    seed = 'u2netp-reviewed-partial-validation-v1'; rank = lambda key: digest((seed+':'+key).encode())
    seen = set(exposure['seenAssetIds']); hashes = set(exposure['seenPhotoHashes'])
    # Legacy fixture replays use motif names rather than the newer asset IDs.
    seen.update(r['id'] for r in catalog['assets'] if any(o.get('existingFile') for o in r['origins']))
    groups_seen = {r['nearDuplicateGroup'] for r in catalog['assets'] if r['id'] in seen or r['sha256'] in hashes}
    groups = defaultdict(list)
    for row in catalog['assets']:
        if row['kind'] == 'photo' and row['format'] == 'JPEG' and row['splitStatus'] == 'qa-reserved' and row['nearDuplicateGroup'] not in groups_seen and row['width']*row['height'] <= 24e6 and max(row['width'], row['height']) <= 16384:
            groups[row['splitGroupId']].append(row)
    for group in groups: groups[group].sort(key=lambda r: rank('photo:'+r['sha256']))
    order = sorted(groups, key=lambda g: rank('source:'+g)); selected = []; duplicate_groups = set(); counts = defaultdict(int)
    for slot in range(10):
        for group in order:
            available = [r for r in groups[group] if r['nearDuplicateGroup'] not in duplicate_groups]
            if not available: continue
            row = available[0]; selected.append(row); duplicate_groups.add(row['nearDuplicateGroup']); counts[group] += 1
            if len(selected) == 32: break
        if len(selected) == 32: break
    assert len(selected) == 32 and max(counts.values()) <= 10
    photos = []
    for row in selected:
        file = Path(row['localPath']); assert digest(file.read_bytes()) == row['sha256']
        with Image.open(file) as original: image = ImageOps.exif_transpose(original).convert('RGB')
        assert image.width*image.height <= 24e6 and max(image.size) <= 16384
        photos.append({'id': row['id']+'-body-1', 'assetId': row['id'], 'file': str(file),
                       'imageSha256': row['sha256'], 'dimensions': list(image.size),
                       'decodedRGBSha256': digest(image.tobytes()), 'splitGroupId': row['splitGroupId'],
                       'nearDuplicateGroup': row['nearDuplicateGroup'], 'selectionRank': rank('photo:'+row['sha256']),
                       'sourceGroups': row['sourceGroups']})
    result = {'schema': 'saliency-validation-selection-1', 'status': 'predeclared',
              'sourceManifest': {'path': str(args.catalog), 'sha256': digest(args.catalog.read_bytes())},
              'exposureAudit': {'path': str(args.exposure), 'sha256': digest(args.exposure.read_bytes())},
              'selectorSha256': digest(Path(__file__).read_bytes()),
              'selector': {'seed': seed, 'photos': 32, 'sourceCap': 10, 'sourceCounts': dict(counts),
                           'eligiblePhotos': sum(map(len, groups.values())),
                           'method': 'SHA256-ranked source groups and photos, round-robin sources, at most ten per connected source group, one per near-duplicate group.',
                           'metadataAdjustment': 'A cap of eight could fill only 26 slots after legacy fixture and near-duplicate exclusions. Raised to ten before any selected-photo inspection or inference.',
                           'exclusions': 'Existing recorded experiment/label/plan image IDs and photo hashes, their near-duplicate groups, and all legacy fixture imports. QA-reserved single-heart JPEG photos only; no model result or manual inspection enters selection.'},
              'scope': 'New pipeline evaluation photos, already part of the visually reviewed inventory. Known source groups may have earlier evaluation photos; motif novelty and upstream pretraining overlap are unverified. No heart fine-tuning or photo copying.',
              'photos': photos}
    assert not args.output.exists(); args.output.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result['selector'], indent=2))


if __name__ == '__main__': main()
