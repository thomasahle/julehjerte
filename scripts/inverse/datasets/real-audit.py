#!/usr/bin/env python3
"""Verify every exported real-image asset locally, without network access."""
import hashlib
import json
from collections import Counter
from pathlib import Path
from PIL import Image, ImageOps

ROOT=Path(__file__).resolve().parents[3]
manifest_path=ROOT/'docs/inverse/datasets/real-manifest.json'
manifest=json.loads(manifest_path.read_text())
seen=set(); decoded={}; groups={}; bytes_total=0
for row in manifest['assets']:
    file=(ROOT/row['localPath']).resolve()
    assert file.is_relative_to((ROOT/manifest['assetRoot']).resolve()), row['id']
    data=file.read_bytes();sha=hashlib.sha256(data).hexdigest()
    assert sha==row['sha256'] and sha not in seen, row['id']
    assert row['bytes']==len(data),row['id']
    seen.add(sha);bytes_total+=len(data)
    with Image.open(file) as source:
        im=ImageOps.exif_transpose(source).convert('RGB')
        assert list(im.size)==[row['width'],row['height']],row['id']
        pixel_sha=hashlib.sha256(im.tobytes()).hexdigest()
        assert pixel_sha==row['decodedPixelsSha256'],row['id']
    decoded.setdefault(pixel_sha,[]).append(row['id'])
    assert row['origins'] and row['sourceGroups'] and row['exactDuplicateGroup']==sha,row['id']
    assert row['reviewStatus'].startswith('visually-reviewed'),row['id']
    assert row['trainingRightsStatus']=='not-cleared',row['id']
    groups.setdefault(row['splitGroupId'],[]).append(row)
for group in groups.values():
    if any(r['splitStatus']=='qa-reserved' for r in group):
        assert all(r['splitStatus']=='qa-reserved' for r in group)
photos=[r for r in manifest['assets'] if r['kind'] in ('photo','photo-multiple','photo-collage','mixed-photo-template')]
pins=manifest['pinterestCollection']['pins']
report={'manifestSha256':hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
        'verifiedAssetFiles':len(seen),'verifiedBytes':bytes_total,
        'verifiedDecodedPixelGroups':len(decoded),'kinds':dict(Counter(r['kind'] for r in manifest['assets'])),
        'reviewedAssembledHeartPhotoFiles':len(photos),'reviewedPhotoNearDuplicateGroups':len({r['nearDuplicateGroup'] for r in photos}),
        'qaReservedFiles':sum(r['splitStatus']=='qa-reserved' for r in manifest['assets']),
        'pinterestSelectedPins':len(pins),'pinterestDownloadedPins':sum(r['status']=='downloaded' for r in pins),
        'pinterestPhotoFiles':sum(r['kind'] in ('photo','photo-multiple','photo-collage','mixed-photo-template') and any(o['source']=='pinterest' for o in r['origins']) for r in manifest['assets'])}
output=ROOT/'docs/inverse/datasets/real-validation.json'
output.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
