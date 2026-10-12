#!/usr/bin/env python3
"""Import only an explicit, bounded list of public Pinterest pins and advertised images.

No board crawling, login, private APIs, cookies or user-agent impersonation. This
manual selection workflow is separate from the robots-respecting bulk collector.
"""
import importlib.util
import argparse
import base64
import fcntl
import json
import re
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit

spec=importlib.util.spec_from_file_location('real_collect',Path(__file__).with_name('real-collect.py'))
common=importlib.util.module_from_spec(spec); spec.loader.exec_module(common)


class Meta(HTMLParser):
    def __init__(self):
        super().__init__(); self.values={}
    def handle_starttag(self,tag,attrs):
        if tag=='meta':
            a=dict(attrs); self.values[a.get('property',a.get('name',''))]=a.get('content','')


def selected_image(text):
    meta=Meta(); meta.feed(text)
    image=meta.values.get('og:image')
    if not image or urlsplit(image).netloc!='i.pinimg.com':
        raise ValueError('No public main-pin image advertised in HTML')
    basename=urlsplit(image).path.rsplit('/',1)[-1]
    originals=sorted(set(re.findall(r'https://i\.pinimg\.com/originals/[^"\s<>]+',text)))
    matching=[u for u in originals if urlsplit(u).path.rsplit('/',1)[-1]==basename]
    return matching[0] if matching else image, meta.values


def source_links(text):
    result=set()
    for attrs,body in re.findall(r'<script([^>]*)>(.*?)</script>',text,re.S):
        if 'data-relay-completed-request' not in attrs:
            continue
        start=body.find(', {')
        if start<0:
            continue
        try:
            obj,_=json.JSONDecoder().raw_decode(body[start+2:])
        except ValueError:
            continue
        def walk(x):
            if isinstance(x,dict):
                for k,v in x.items():
                    if k=='link' and isinstance(v,str) and v.startswith(('https://','http://')) and 'pinterest.' not in urlsplit(v).netloc:
                        result.add(v)
                    walk(v)
            elif isinstance(x,list):
                for v in x:walk(v)
        walk(obj)
    return sorted(result)


def pin_id(url):
    match=re.search(r'/pin/(?:[^/]*--)?(\d+)/?$',urlsplit(url).path)
    return match.group(1) if match else None


def public_related_records(text, source_url):
    """Only literal pin anchors or explicit Pin JSON records, never arbitrary IDs."""
    found={}
    for ident in re.findall(r'(?:https://(?:[a-z]+\.)?pinterest\.com)?/pin/(?:[\w-]*--)?(\d+)/',text):
        found[ident]={'url':'https://dk.pinterest.com/pin/'+ident+'/', 'discovery':'Public pin link exposed in selected pin HTML', 'parentPin':source_url}
    for attrs,body in re.findall(r'<script([^>]*)>(.*?)</script>',text,re.S):
        obj=None
        try:
            if 'application/json' in attrs or 'application/ld+json' in attrs:
                obj=json.loads(body)
            elif 'data-relay-completed-request' in attrs:
                start=body.find(', {')
                if start>=0:obj,_=json.JSONDecoder().raw_decode(body[start+2:])
        except ValueError:
            continue
        def walk(x):
            if isinstance(x,dict):
                if x.get('__typename')=='Pin':
                    ident=str(x.get('entityId',''))
                    if not ident.isdigit():
                        try:
                            decoded=base64.b64decode(x.get('id','')).decode()
                            ident=decoded.split(':',1)[1] if decoded.startswith('Pin:') else ''
                        except (ValueError,UnicodeError):ident=''
                    image=x.get('images_orig',{}).get('url') if isinstance(x.get('images_orig'),dict) else None
                    if ident.isdigit() and image and urlsplit(image).netloc=='i.pinimg.com':
                        found[ident]={'url':'https://dk.pinterest.com/pin/'+ident+'/', 'imageUrl':image,
                                      'discovery':'Explicit public Pin record and original image in selected pin HTML',
                                      'parentPin':source_url,'title':x.get('title') or x.get('seoAltText'),
                                      'observedSourceLinks':[x['link']] if isinstance(x.get('link'),str) else []}
                for v in x.values():walk(v)
            elif isinstance(x,list):
                for v in x:walk(v)
        walk(obj)
    found.pop(pin_id(source_url),None)
    return list(found.values())


def merge_discovery(row, pin):
    """Keep every observed discovery path when a cached pin is found again."""
    paths=row.setdefault('discoveryPaths',[])
    for item in (row,pin):
        evidence={k:item[k] for k in ('url','discovery','parentPin','parentPageSha256','searchTitle','queries','observedSearchUrls') if k in item}
        if evidence and evidence not in paths:paths.append(evidence)
    for key in ('queries','observedSearchUrls'):
        values=sorted(set(row.get(key,[])+pin.get(key,[])))
        if values:row[key]=values
    return row


def enqueue_related(row, depth, maximum_depth, queue, related):
    for record in row.get('publicRelatedPins',[]):
        record={**record,'parentPageSha256':row.get('pageSha256')}
        if record not in related:related.append(record)
        if depth<maximum_depth:queue.append({**record,'depth':depth+1})


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--selection',type=Path,default=Path(__file__).with_name('real-pinterest-pins.json'))
    parser.add_argument('--output',type=Path,default=common.DEFAULT_OUTPUT/'pinterest')
    parser.add_argument('--max-pins',type=int,default=500)
    parser.add_argument('--related-depth',type=int,default=0)
    parser.add_argument('--minimum-delay',type=float,default=1.2)
    args=parser.parse_args()
    if args.max_pins<1 or args.max_pins>1000 or args.related_depth<0 or args.related_depth>3 or args.minimum_delay<1:
        raise ValueError('Use a bounded 1–1000 pin selection, depth 0–3, and at least one second pacing')
    out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    lock=(out/'.import.lock').open('a');fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
    fetcher=common.Fetcher(out,minimum_delay=args.minimum_delay,jitter=.5)
    pins=json.loads(args.selection.read_text())
    queue=[{**pin,'depth':0} for pin in pins]
    imported_path=out/'imports.json'
    prior=json.loads(imported_path.read_text()) if imported_path.exists() else {'pins':[]}
    rows={pin_id(r['url']):r for r in prior['pins']}
    seen=set();related=[];stopped=None
    def checkpoint():
        common.save(imported_path,{'policy':'Bounded user-authorized public pin selection and literally exposed related pin records; no boards, login, private APIs or invented image upgrades.',
                                  'selectionFile':str(args.selection),'selectionSha256':common.digest(args.selection.read_bytes()),
                                  'maximumPins':args.max_pins,'maximumRelatedDepth':args.related_depth,
                                  'minimumHostDelaySeconds':args.minimum_delay,'hostJitterSeconds':.5,
                                  'startedFromPriorRows':len(prior['pins']),'publicRelatedDiscoveries':related,
                                  'stopped':stopped,'remainingQueued':len(queue),'pins':list(rows.values())})
    while queue and len(seen)<args.max_pins:
        pin=queue.pop(0);url=pin['url'];ident=pin_id(url)
        if not ident or not re.match(r'^https://(?:[a-z]+\.)?pinterest\.com/pin/',url):
            raise ValueError('Only explicit public pin URLs allowed: '+url)
        if ident in seen:
            if ident in rows:merge_discovery(rows[ident],pin)
            continue
        seen.add(ident)
        if rows.get(ident,{}).get('status')=='downloaded':
            merge_discovery(rows[ident],pin)
            enqueue_related(rows[ident],pin['depth'],args.related_depth,queue,related)
            continue
        try:
            page={};records=[]
            if pin.get('imageUrl') and pin.get('parentPin'):
                image=pin['imageUrl'];meta={'og:title':pin.get('title')};links=pin.get('observedSourceLinks',[])
            else:
                body,page=fetcher.fetch(url,5_000_000,robots=False)
                text=body.decode('utf8',errors='replace')
                image,meta=selected_image(text);links=source_links(text)
                records=public_related_records(text,url)
            data,fetched=fetcher.fetch(image,robots=False)
            info=common.metadata(data);sha=common.digest(data)
            ext={'JPEG':'.jpg','PNG':'.png','WEBP':'.webp'}.get(info['format'],'.img')
            file=out/'assets'/(sha+ext);file.parent.mkdir(exist_ok=True);file.write_bytes(data)
            row={**pin,'status':'downloaded','pageSha256':page.get('sha256'),'pageRetrievedAt':page.get('retrievedAt'),
                 'imageUrl':image,'retrievedAt':fetched['retrievedAt'],'sha256':sha,'bytes':len(data),
                 'file':str(file.relative_to(common.ROOT)),'title':meta.get('og:title'),
                 'observedSourceLinks':links,'publicRelatedPins':records,
                 **{k:v for k,v in info.items() if k!='thumbnailRgb'}}
            print('downloaded',len(seen),ident,info['width'],info['height'],'related',len(records),flush=True)
            enqueue_related(row,pin['depth'],args.related_depth,queue,related)
        except Exception as error:
            row={**pin,'status':'unavailable','error':str(error)}
            print('unavailable',len(seen),ident,error,flush=True)
            if fetcher.rate_limited_hosts:
                stopped={'reason':'HTTP 429; remaining requests deferred without host switching', 'hosts':sorted(fetcher.rate_limited_hosts), 'at':common.now()}
        rows[ident]=merge_discovery(row,pin)
        checkpoint()
        if stopped:break
    checkpoint()


if __name__=='__main__':main()
