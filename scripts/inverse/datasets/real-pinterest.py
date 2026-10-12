#!/usr/bin/env python3
"""Import only an explicit, bounded list of public Pinterest pins and advertised images.

No board crawling, login, private APIs, cookies or user-agent impersonation. This
manual selection workflow is separate from the robots-respecting bulk collector.
"""
import importlib.util
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


def main():
    out=common.DEFAULT_OUTPUT/'pinterest'
    out.mkdir(parents=True,exist_ok=True)
    fetcher=common.Fetcher(out)
    pins=json.loads(Path(__file__).with_name('real-pinterest-pins.json').read_text())
    rows=[]
    for pin in pins:
        url=pin['url']
        if not re.match(r'^https://(?:[a-z]+\.)?pinterest\.com/pin/[^/?]+/$',url):
            raise ValueError('Only explicit public pin URLs allowed: '+url)
        try:
            body,page=fetcher.fetch(url,5_000_000,robots=False)
            text=body.decode('utf8',errors='replace')
            image,meta=selected_image(text)
            data,fetched=fetcher.fetch(image,robots=False)
            info=common.metadata(data); sha=common.digest(data)
            ext={'JPEG':'.jpg','PNG':'.png','WEBP':'.webp'}.get(info['format'],'.img')
            file=out/'assets'/(sha+ext);file.parent.mkdir(exist_ok=True);file.write_bytes(data)
            row={**pin,'status':'downloaded','pageSha256':page['sha256'],'pageRetrievedAt':page['retrievedAt'],
                 'imageUrl':image,'retrievedAt':fetched['retrievedAt'],'sha256':sha,'bytes':len(data),
                 'file':str(file.relative_to(common.ROOT)),'title':meta.get('og:title'),
                 'observedSourceLinks':source_links(text),**{k:v for k,v in info.items() if k!='thumbnailRgb'}}
            print('downloaded',url,info['width'],info['height'],flush=True)
        except Exception as error:
            row={**pin,'status':'unavailable','error':str(error)}
            print('unavailable',url,error,flush=True)
        rows.append(row)
        common.save(out/'imports.json',{'policy':'Explicit public pins only; no board expansion or login. Generic crawler robots exclusions are separate from these individually selected public-page imports. Original URLs used only when literally advertised in returned HTML.','pins':rows})


if __name__=='__main__':main()
