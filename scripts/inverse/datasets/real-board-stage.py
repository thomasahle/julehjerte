#!/usr/bin/env python3
"""Stage an explicitly observed board without changing an existing dataset.

Only the selection's literal public image URLs are downloaded. No board crawling,
credentials, private APIs, inferred URL upgrades, or automatic training admission.
"""
import argparse
import fcntl
import importlib.util
import json
import os
import shutil
from pathlib import Path
from urllib.parse import urlsplit

SPEC = importlib.util.spec_from_file_location('real_collect', Path(__file__).with_name('real-collect.py'))
common = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(common)


def verified_link(source, destination, sha):
    if common.digest(source.read_bytes()) != sha:
        raise ValueError('Existing asset checksum mismatch: ' + str(source))
    if destination.exists():
        if common.digest(destination.read_bytes()) != sha:
            raise ValueError('Staged asset checksum mismatch: ' + str(destination))
    else:
        os.link(source, destination)


def stage(selection_path, existing_root, output, maximum_new_bytes=20*1024**2, offline=False):
    selection_bytes = selection_path.read_bytes()
    selection = json.loads(selection_bytes)
    pins = selection['pins']
    if len({p['url'] for p in pins}) != len(pins):
        raise ValueError('Duplicate pin URL in selection')
    for pin in pins:
        image = urlsplit(pin['imageUrl'])
        if image.scheme != 'https' or image.netloc != 'i.pinimg.com' or not image.path.startswith('/originals/'):
            raise ValueError('Selection must use explicitly advertised original image URLs')
    if output == existing_root or existing_root in output.parents:
        raise ValueError('Stage outside the existing dataset worktree')
    output.mkdir(parents=True, exist_ok=True)
    (output/'assets').mkdir(exist_ok=True)
    with (output/'stage.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        original = existing_root/'docs/inverse/datasets/real-manifest.json'
        original_bytes = original.read_bytes()
        existing = json.loads(original_bytes)['assets']
        by_url = {o['imageUrl']:a for a in existing for o in a['origins'] if o.get('imageUrl')}
        by_sha = {a['sha256']:a for a in existing}
        ledger_path = output/'imports.json'
        ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {
            'schema':'staged-observed-board-1', 'boardUrl':selection['boardUrl'],
            'selectionSha256':common.digest(selection_bytes), 'existingManifestSha256':common.digest(original_bytes),
            'maximumNewImageBytes':maximum_new_bytes, 'downloadedNewImageBytes':0, 'pins':[],
            'policy':'Separate staging of explicit observed image URLs. Exact matches are hardlinked; source assets are never written. Titles are source text, not verified creator attribution. No training admission or publishing permission inferred.'}
        if ledger['selectionSha256'] != common.digest(selection_bytes) or ledger['existingManifestSha256'] != common.digest(original_bytes):
            raise ValueError('Selection or existing manifest changed since staging began')
        if ledger['maximumNewImageBytes'] != maximum_new_bytes:
            raise ValueError('Cannot silently change the acquisition budget during resume')
        rows = {r['url']:r for r in ledger['pins']}
        downloaded = {r['imageUrl']:r for r in rows.values() if r['status']=='downloaded'}
        fetcher = common.Fetcher(output, offline=offline, minimum_delay=1.2, jitter=.2)
        ledger['stopped'] = None
        def checkpoint():
            ledger['pins'] = list(rows.values())
            ledger['completeSelection'] = len(rows)==len(pins) and all(r['status']=='downloaded' for r in rows.values())
            ledger['reportedPinCount'] = selection.get('reportedPinCount')
            ledger['inventoriedPinCount'] = len(pins)
            common.save(ledger_path, ledger)
        for pin in pins:
            prior = rows.get(pin['url'])
            if prior and prior['status']=='downloaded':
                if common.digest((output/prior['file']).read_bytes()) != prior['sha256']:
                    raise ValueError('Previously staged file no longer matches its checksum')
                continue
            try:
                url = pin['imageUrl']
                same = downloaded.get(url)
                old = by_url.get(url)
                fetched = {}
                if same:
                    row = {**same, **pin}
                else:
                    if shutil.disk_usage(output).free < 10*1024**3:
                        raise RuntimeError('Less than 10 GiB free')
                    if old:
                        data = (existing_root/old['localPath']).read_bytes()
                        if common.digest(data) != old['sha256']:
                            raise ValueError('Existing asset checksum mismatch')
                    else:
                        remaining = maximum_new_bytes-ledger['downloadedNewImageBytes']
                        if remaining <= 0:
                            ledger['stopped'] = {'reason':'New image byte budget exhausted'}
                            break
                        data, fetched = fetcher.fetch(url, min(4*1024**2, remaining), robots=False)
                        ledger['downloadedNewImageBytes'] += len(data)
                    sha = common.digest(data)
                    info = common.metadata(data)
                    extension = {'JPEG':'.jpg','PNG':'.png','GIF':'.gif','WEBP':'.webp'}.get(info['format'])
                    if not extension:
                        raise ValueError('Unsupported image format: '+str(info['format']))
                    file = output/'assets'/(sha+extension)
                    exact = by_sha.get(sha)
                    if exact:
                        verified_link(existing_root/exact['localPath'], file, sha)
                    elif not file.exists():
                        if fetched.get('file'):
                            (output/fetched['file']).replace(file)
                        else:
                            file.write_bytes(data)
                    elif common.digest(file.read_bytes()) != sha:
                        raise ValueError('Staged file content mismatch')
                    if fetched.get('file'):
                        cache = output/fetched['file']
                        if cache.exists() and cache != file:
                            cache.unlink()
                        fetched['file'] = str(file.relative_to(output))
                        fetcher.requests[url] = fetched
                        common.save(fetcher.requests_file, fetcher.requests)
                    row = {**pin, 'status':'downloaded', 'sha256':sha, 'bytes':len(data),
                        'file':str(file.relative_to(output)), 'retrievedAt':fetched.get('retrievedAt'),
                        'stagedAt':common.now(), 'reusedExistingCorpus':bool(exact),
                        'existingAssetId':exact['id'] if exact else None,
                        **{k:v for k,v in info.items() if k!='thumbnailRgb'},
                        'observedSourceLinks':[], 'publicRelatedPins':[]}
                    downloaded[url] = row
            except Exception as error:
                row = {**pin, 'status':'unavailable', 'error':str(error)}
                if fetcher.rate_limited_hosts:
                    ledger['stopped'] = {'reason':'HTTP 429; no more requests', 'hosts':sorted(fetcher.rate_limited_hosts)}
            rows[pin['url']] = row
            checkpoint()
            if len(rows)%10 == 0:
                print(len(rows), 'pins staged;', ledger['downloadedNewImageBytes'], 'new image bytes', flush=True)
            if ledger['stopped']:
                break
        checkpoint()
        assets = {}
        for row in rows.values():
            if row['status'] != 'downloaded':
                continue
            sha = row['sha256']
            old = by_sha.get(sha)
            asset = assets.setdefault(sha, {
                'id':'real-'+sha[:16], **{k:row[k] for k in ('sha256','bytes','width','height','format','decodedPixelsSha256','dhash256')},
                'localPath':row['file'], 'existingAssetId':row['existingAssetId'],
                'kind':old['kind'] if old else 'unknown', 'reviewStatus':'existing-label' if old else 'unreviewed',
                'existingSourceGroups':old.get('sourceGroups',[]) if old else [],
                'existingSplitGroupId':old.get('splitGroupId') if old else None,
                'existingSplitStatus':old.get('splitStatus') if old else None,
                'existingNearDuplicateGroup':old.get('nearDuplicateGroup') if old else None,
                'origins':[], 'trainingRightsStatus':'not-cleared', 'splitStatus':'quarantined-pending-source-family-review'})
            asset['origins'].append({'imageUrl':row['imageUrl'], 'sourcePages':[row['url'],selection['boardUrl']],
                'source':'pinterest', 'sourceGroup':'pinterest-board:'+selection['boardUrl'],
                'pinTitle':row.get('title'), 'boardIndex':row.get('boardIndex'), 'author':None,
                'rights':{'status':'unknown','fact':'Pinterest board owner and card title do not establish the designer, photographer, or rights holder.'}})
        manifest = {'schema':'real-heart-staged-import-1', 'generatedAt':common.now(),
            'assetRoot':str(output), 'existingManifestSha256':common.digest(original_bytes),
            'boardUrl':selection['boardUrl'], 'reportedPinCount':selection.get('reportedPinCount'),
            'inventoriedPins':len(pins), 'downloadedPins':sum(r['status']=='downloaded' for r in rows.values()),
            'distinctFileHashes':len(assets), 'exactExistingFiles':sum(bool(a['existingAssetId']) for a in assets.values()),
            'downloadedNewImageBytes':ledger['downloadedNewImageBytes'], 'assets':list(assets.values())}
        common.save(output/'staged-manifest.json', manifest)
        if original.read_bytes() != original_bytes:
            raise ValueError('Existing manifest changed externally during staging')
        return ledger, manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--selection',type=Path,required=True)
    parser.add_argument('--existing-root',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--maximum-new-bytes',type=int,default=20*1024**2)
    parser.add_argument('--offline',action='store_true')
    args = parser.parse_args()
    if args.maximum_new_bytes < 1 or args.maximum_new_bytes > 20*1024**2:
        parser.error('Use a positive acquisition budget no larger than 20 MiB')
    ledger, manifest = stage(args.selection.resolve(),args.existing_root.resolve(),args.output.resolve(),args.maximum_new_bytes,args.offline)
    print(json.dumps({k:v for k,v in manifest.items() if k!='assets'},indent=2))
    raise SystemExit(0 if ledger['completeSelection'] else 1)
