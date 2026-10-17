"""Import an explicit observed-board inventory with deduplication and disk limits.

The selection must contain observed pin and original-image URLs, not guessed upgrades.
This script fetches the advertised images only; it does not automate board browsing.
"""
import argparse, fcntl, importlib.util, json, os, shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--selection',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--offline',action='store_true')
args=parser.parse_args()
HERE=args.output.resolve();assert HERE.parent==ROOT/'tmp/heart-training-real'
HERE.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('common',ROOT/'scripts/inverse/datasets/real-collect.py');common=importlib.util.module_from_spec(spec);spec.loader.exec_module(common)
lock=(HERE/'download.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
inventory=json.loads(args.selection.read_text());expected=inventory['reportedPinCount']
selection=[{**p,'parentPin':inventory['boardUrl'],'discovery':inventory['method']} for p in inventory['pins']]
assert len(selection)==len({p['url'] for p in selection})==expected
manifest=json.loads((ROOT/'docs/inverse/datasets/real-manifest.json').read_text())
by_url={o['imageUrl']:a for a in manifest['assets'] for o in a['origins'] if o.get('imageUrl')};by_hash={a['sha256']:a for a in manifest['assets']}
path=HERE/'imports.json';prior=json.loads(path.read_text()) if path.exists() else {'pins':[]};rows={r['url']:r for r in prior['pins']}
fetcher=common.Fetcher(HERE,offline=args.offline,minimum_delay=1.2,jitter=.5)
ledger={'policy':'Explicit pin inventory obtained by scrolling the user-selected public board in their signed-in browser. Only advertised original image URLs fetched, without credentials, private API calls, related discovery or guessed URL upgrades.', 'boardUrl':selection[0]['parentPin'],'expectedPinCount':expected,'selectionFile':str(args.selection),'selectionSha256':common.digest(args.selection.read_bytes()),'minimumHostDelaySeconds':1.2,'maximumNewBytes':100*1024**2,'minimumFreeGiB':10,'pins':[],'stopped':None}
new_bytes=0
try:
 for i,pin in enumerate(selection):
  if pin['url'] in rows and rows[pin['url']]['status']=='downloaded':
   old=rows[pin['url']];assert old['imageUrl']==pin['imageUrl'];assert common.digest((ROOT/old['file']).read_bytes())==old['sha256'];continue
  if shutil.disk_usage(ROOT).free<10*1024**3:raise RuntimeError('Less than 10 GiB free')
  if new_bytes>=ledger['maximumNewBytes']:raise RuntimeError('100 MiB acquisition cap reached')
  try:
   url=pin['imageUrl'];assert url.startswith('https://i.pinimg.com/originals/')
   existing=by_url.get(url)
   if existing:
    file=ROOT/existing['localPath'];data=file.read_bytes();assert common.digest(data)==existing['sha256'];fetched={'retrievedAt':common.now()}
   else:
    data,fetched=fetcher.fetch(url,4*1024**2,robots=False)
   sha=common.digest(data);info=common.metadata(data);assert info['format']=='JPEG'
   old=by_hash.get(sha);file=ROOT/old['localPath'] if old else HERE.parent/'assets'/(sha+'.jpg')
   if file.exists():assert common.digest(file.read_bytes())==sha
   else:
    if new_bytes+len(data)>ledger['maximumNewBytes']:raise RuntimeError('100 MiB acquisition cap reached')
    file.write_bytes(data);new_bytes+=len(data)
   # Keep one content-addressed image copy. The fetch ledger points at it.
   if 'file' in fetched:
    cache=HERE/fetched['file'];fetched['file']=os.path.relpath(file,HERE)
    if cache!=file and cache.exists():cache.unlink()
    fetcher.requests[url]=fetched;common.save(fetcher.requests_file,fetcher.requests)
   row={**pin,'status':'downloaded','sha256':sha,'bytes':len(data),'file':str(file.relative_to(ROOT)),'retrievedAt':fetched['retrievedAt'],'reusedExistingCorpus':bool(old),**{k:v for k,v in info.items() if k!='thumbnailRgb'},'publicRelatedPins':[],'observedSourceLinks':[],'discoveryPaths':[{'url':pin['url'],'parentPin':pin['parentPin'],'discovery':pin['discovery']}]}
  except Exception as error:
   row={**pin,'status':'unavailable','error':str(error)}
   if fetcher.rate_limited_hosts:ledger['stopped']={'reason':'HTTP 429','hosts':sorted(fetcher.rate_limited_hosts)}
  rows[pin['url']]=row;ledger.update(pins=list(rows.values()),newBytesThisRun=new_bytes);common.save(path,ledger)
  if (i+1)%20==0:print(i+1,'pins checked;',new_bytes,'new bytes',flush=True)
  if ledger['stopped']:break
except BaseException as error:
 ledger['stopped']={'reason':str(error)};raise
finally:
 ledger.update(pins=list(rows.values()),newBytesThisRun=new_bytes);ledger['complete']=len(rows)==expected and all(r['status']=='downloaded' for r in rows.values());common.save(path,ledger)
 print('complete',ledger['complete'],'downloaded',sum(r['status']=='downloaded' for r in rows.values()),'new bytes',new_bytes,flush=True)
raise SystemExit(0 if ledger['complete'] else 1)
