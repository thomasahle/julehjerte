#!/usr/bin/env python3
"""Resumable, bounded collection of public heart photographs; no model or solver inputs.

Requires Pillow (already available in the development environment). Nothing here
asserts that publicly accessible photographs are licensed for redistribution or training.
"""
import argparse
import hashlib
import fcntl
import html
import io
import json
import re
import time
from collections import Counter
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, unquote, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUTPUT = ROOT / 'tmp/heart-training-real'
USER_AGENT = 'JulehjertePhotoResearch/0.1'
RASTER = re.compile(r'\.(?:jpe?g|png|webp)(?:\?|$)', re.I)
RESIZE = re.compile(r'-\d{2,5}x\d{2,5}(?=\.[^.]+$)')


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.writing')
    tmp.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
    tmp.replace(path)


def clean_url(url, base=''):
    value = urljoin(base, html.unescape(url.strip()))
    parts = urlsplit(value)
    if parts.scheme not in ('https', 'http') or not parts.netloc:
        return None
    return urlunsplit((parts.scheme, parts.netloc, quote(unquote(parts.path), safe='/%:@+'), parts.query, ''))


def image_family(url):
    p = urlsplit(url)
    # Only collapse named WordPress sizes, not arbitrary similarly named photos.
    path = RESIZE.sub('', p.path) if '/wp-content/uploads/' in p.path else p.path
    return urlunsplit((p.scheme, p.netloc, path, '', ''))


class Page(HTMLParser):
    def __init__(self, url):
        super().__init__()
        self.url, self.images, self.links, self.text = url, [], [], []
        self.title, self.in_title, self.anchor = '', False, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'title':
            self.in_title = True
        if tag == 'a':
            self.anchor = clean_url(a.get('href', ''), self.url)
            if self.anchor:
                self.links.append(self.anchor)
                if RASTER.search(self.anchor):
                    self.images.append({'url': self.anchor, 'alt': '', 'linkedOriginal': True, 'rank': 100000})
        if tag != 'img':
            return
        candidates = []
        if a.get('data-orig-file'):
            candidates.append((a['data-orig-file'], 10000000))
        for attr in ('src', 'data-src', 'data-lazy-src', 'data-original', 'data-pb-source'):
            if a.get(attr):
                candidates.append((a[attr], int(a.get('width', '0')) if a.get('width', '').isdigit() else 0))
        for attr in ('srcset', 'data-srcset', 'data-lazy-srcset'):
            for entry in a.get(attr, '').split(','):
                bits = entry.strip().rsplit(' ', 1)
                if len(bits) == 2 and re.match(r'^\d+(?:\.\d+)?[wx]$', bits[1]):
                    candidates.append((bits[0], float(bits[1][:-1])))
        if candidates:
            candidates.sort(key=lambda x: x[1], reverse=True)
            for value, rank in candidates:
                url = clean_url(value, self.url)
                if url:
                    self.images.append({'url': url, 'alt': a.get('alt', ''), 'linkedOriginal': False, 'rank': rank})
                    break

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        if tag == 'a':
            self.anchor = None

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        self.text.append(data)


class Fetcher:
    def __init__(self, out, offline=False):
        self.out, self.offline, self.robots, self.last = out, offline, {}, {}
        self.rate_limited_hosts = set()
        self.requests_file = out / 'requests.json'
        self.requests = json.loads(self.requests_file.read_text()) if self.requests_file.exists() else {}

    def fetch(self, url, maximum=15_000_000, robots=True):
        cached = self.requests.get(url)
        if cached and cached.get('file') and (self.out / cached['file']).exists():
            data = (self.out / cached['file']).read_bytes()
            if digest(data) != cached['sha256']:
                raise ValueError('Cached bytes fail SHA-256: ' + url)
            return data, cached
        if cached and cached.get('error'):
            code = cached.get('httpStatus')
            if code is None:
                match = re.search(r'HTTP Error (\d+)', cached['error'])
                code = int(match.group(1)) if match else None
            if code:
                raise HTTPError(url, code, 'Cached previous failure; inspect before retry: ' + cached['error'], {}, None)
            raise ValueError('Cached previous failure; inspect before retry: ' + cached['error'])
        if self.offline:
            raise ValueError('Not cached: ' + url)
        host = urlsplit(url).netloc
        if host in self.rate_limited_hosts:
            raise ValueError('Host returned HTTP 429 earlier in this run; no further requests: ' + host)
        if robots:
            origin = urlunsplit((*urlsplit(url)[:2], '', '', ''))
            if origin not in self.robots:
                rp = RobotFileParser()
                try:
                    body, _ = self.fetch(origin + '/robots.txt', 1_000_000, robots=False)
                    rp.parse(body.decode('utf8', errors='replace').splitlines())
                except HTTPError as error:
                    rp.parse(['User-agent: *', 'Disallow: /'] if error.code in (401, 403, 429) else [])
                except Exception:
                    # Unavailable robots is recorded but not treated as authentication.
                    rp.parse([])
                self.robots[origin] = rp
            if not self.robots[origin].can_fetch(USER_AGENT, url):
                raise PermissionError('Disallowed by robots.txt: ' + url)
        time.sleep(max(0, .15 - (time.monotonic() - self.last.get(host, 0))))
        req = Request(url, headers={'User-Agent': USER_AGENT})
        try:
            with urlopen(req, timeout=25) as response:
                data = response.read(maximum + 1)
                if len(data) > maximum:
                    raise ValueError('Exceeds byte limit')
                metadata = {'url': url, 'finalUrl': response.url, 'retrievedAt': now(),
                            'contentType': response.headers.get('Content-Type'), 'bytes': len(data), 'sha256': digest(data)}
        except Exception as error:
            code = error.code if isinstance(error, HTTPError) else None
            if code == 429:
                self.rate_limited_hosts.add(host)
            self.requests[url] = {'url': url, 'retrievedAt': now(), 'error': str(error), 'httpStatus': code}
            save(self.requests_file, self.requests)
            raise
        finally:
            self.last[host] = time.monotonic()
        file = 'cache/' + metadata['sha256']
        (self.out / 'cache').mkdir(exist_ok=True, parents=True)
        (self.out / file).write_bytes(data)
        metadata['file'] = file
        self.requests[url] = metadata
        save(self.requests_file, self.requests)
        return data, metadata


def metadata(data):
    with Image.open(io.BytesIO(data)) as original:
        im = ImageOps.exif_transpose(original).convert('RGB')
        width, height = im.size
        tiny = im.resize((17, 16)).convert('L')
        px = list(tiny.getdata())
        bits = ''.join('1' if px[y*17+x] > px[y*17+x+1] else '0' for y in range(16) for x in range(16))
        rgb = im.resize((16, 16))
        return {'width': width, 'height': height, 'format': original.format,
                'decodedPixelsSha256': digest(im.tobytes()), 'dhash256': f'{int(bits, 2):064x}',
                'thumbnailRgb': list(rgb.getdata())}


def discover(args, seeds, fetcher):
    path = args.output / 'discovery.json'
    previous = json.loads(path.read_text()) if path.exists() else {'pages': [], 'candidates': [], 'errors': []}
    pages = {r['url']: r for r in previous['pages']}
    candidates = {r['imageUrl']: r for r in previous['candidates']}
    errors = []
    for seed in seeds:
        queue = [(clean_url(u), 0) for u in seed['pages']]
        visited = set()
        while queue and len(visited) < seed.get('maxPages', 1):
            url, depth = queue.pop(0)
            if url in visited:
                continue
            visited.add(url)
            try:
                data, fetched = fetcher.fetch(url, 5_000_000)
                parser = Page(url)
                parser.feed(data.decode('utf8', errors='replace'))
                links = sorted(set(parser.links))
                pages[url] = {'url': url, 'title': parser.title.strip(), 'source': seed['id'],
                              'sha256': fetched['sha256'], 'retrievedAt': fetched['retrievedAt'],
                              'imageUrls': sorted(set(row['url'] for row in parser.images)),
                              'referenceLinks': [u for u in links if re.search(r'\.(pdf|svg)(\?|$)', u, re.I)]}
                selected = {}
                for row in parser.images:
                    if seed.get('imagePattern') and not re.search(seed['imagePattern'], row['url'], re.I):
                        continue
                    family = image_family(row['url'])
                    rank = row['rank'] + (1000000 if row['url'] == family else 0)
                    if family not in selected or rank > selected[family][0]:
                        selected[family] = (rank, row)
                for _, row in selected.values():
                    image_url = row['url']
                    if image_url not in candidates:
                        candidates[image_url] = {'imageUrl': image_url, 'source': seed['id'], 'sourcePages': [],
                                                'alt': row['alt'], 'sourceGroup': seed.get('sourceGroup', seed['id']),
                                                'author': seed.get('author'), 'rights': seed['rights']}
                    c = candidates[image_url]
                    if url not in c['sourcePages']:
                        c['sourcePages'].append(url)
                if depth < seed.get('depth', 0):
                    for link in links:
                        if urlsplit(link).netloc == urlsplit(url).netloc and re.search(seed['pagePattern'], link):
                            queue.append((link, depth+1))
                print('page', seed['id'], len(visited), len(candidates), flush=True)
            except Exception as error:
                errors.append({'url': url, 'source': seed['id'], 'error': str(error)})
                print('page-error', url, error, flush=True)
            save(path, {'pages': list(pages.values()), 'candidates': list(candidates.values()), 'errors': errors})


def existing_candidates():
    rows = []
    base = ROOT / 'scripts/inverse/fixtures'
    d = json.loads((base / 'web-photos/manifest.json').read_text())
    for p in d['photos']:
        rows.append({'imageUrl': p['url'], 'sourcePages': [p['sourcePage']], 'source': 'existing-web',
                     'sourceGroup': p['family'], 'existingFile': str((base / 'web-photos' / p['file']).relative_to(ROOT)),
                     'author': p.get('publisher'), 'rights': {'status': 'unknown', 'fact': d['rights']}, 'priorReview': 'photo'})
    d = json.loads((base / 'hunodan/sources.json').read_text())
    for p in d['images']:
        rows.append({'imageUrl': p['url'], 'sourcePages': [d['page']], 'source': 'hunodan', 'sourceGroup': 'hunodan',
                     'existingFile': p['file'], 'author': None, 'rights': {'status': 'unknown', 'fact': d['sourceCredit']},
                     'priorReview': 'mixed-photo-template'})
    d = json.loads((ROOT / 'scripts/inverse/photo-cases.json').read_text())
    for p in d['cases']:
        if not p.get('file'):
            continue
        rows.append({'imageUrl': p.get('url'), 'sourcePages': [p.get('sourcePage')] if p.get('sourcePage') else [],
                     'source': 'existing-hard', 'sourceGroup': p['id'].split('-')[0], 'existingFile': p['file'],
                     'author': None, 'rights': {'status': 'unknown', 'fact': 'Existing test fixture; no license assigned.'},
                     'priorReview': 'photo'})
    d = json.loads((ROOT / 'scripts/inverse/hard-photo-cases.json').read_text())
    rows.append({'imageUrl': None, 'sourcePages': [], 'source': 'user-collage', 'sourceGroup': 'user-pinterest-collage',
                 'existingFile': d['source']['file'], 'author': None, 'rights': {'status': 'unknown', 'fact': 'User-provided Pinterest collage; original author not established.'},
                 'priorReview': 'photo-collage'})
    pins = DEFAULT_OUTPUT / 'pinterest/imports.json'
    if pins.exists():
        for pin in json.loads(pins.read_text())['pins']:
            if pin['status'] != 'downloaded':
                continue
            rows.append({'imageUrl': pin['imageUrl'], 'sourcePages': [pin['url']], 'source': 'pinterest',
                         'sourceGroup': 'pinterest-pin-' + pin['url'].split('/')[-2], 'importFile': pin['file'],
                         'author': None, 'rights': {'status': 'unknown', 'fact': 'Pinterest uploader is not assumed to be the photographer or rights holder; original source rights remain unverified.'},
                         'observedSourceLinks': pin['observedSourceLinks'], 'pinTitle': pin.get('title'),
                         'publicPinRetrievedAt': pin['retrievedAt']})
    return rows


def merge_origin(asset, origin):
    """Retain newly discovered page/rights evidence when resuming a cached URL."""
    identity = lambda o: tuple(o.get(k) for k in ('imageUrl', 'existingFile', 'importFile', 'source'))
    for old in asset['origins']:
        if identity(old) != identity(origin):
            continue
        old['sourcePages'] = sorted(set(old.get('sourcePages', [])) | set(origin.get('sourcePages', [])))
        old['sourceGroups'] = sorted(set(old.get('sourceGroups', [old['sourceGroup']])) | set(origin.get('sourceGroups', [origin['sourceGroup']])))
        if old.get('rights') != origin.get('rights'):
            facts = old.setdefault('rightsHistory', [old.get('rights')])
            if origin.get('rights') not in facts:
                facts.append(origin.get('rights'))
            old['rights'] = origin.get('rights')
        for key, value in origin.items():
            if key not in old:
                old[key] = value
        return
    asset['origins'].append(origin)


def collect(args, fetcher):
    discovery = json.loads((args.output / 'discovery.json').read_text())
    path = args.output / 'assets.json'
    assets = json.loads(path.read_text()) if path.exists() else []
    by_hash = {r['sha256']: r for r in assets}
    candidates = existing_candidates() + discovery['candidates']
    failures = []
    for index, candidate in enumerate(candidates):
        url = candidate['imageUrl']
        try:
            if candidate.get('existingFile') or candidate.get('importFile'):
                data = (ROOT / candidate.get('existingFile', candidate.get('importFile'))).read_bytes()
                fetched = {'retrievedAt': None, 'importedAt': now(), 'finalUrl': url}
            else:
                data, fetched = fetcher.fetch(url)
            sha = digest(data)
            if sha not in by_hash:
                info = metadata(data)
                if min(info['width'], info['height']) < 100 or info['width']*info['height'] < 30000:
                    continue
                suffix = {'JPEG': '.jpg', 'PNG': '.png', 'WEBP': '.webp'}.get(info['format'], '.img')
                file = 'assets/' + sha + suffix
                (args.output / 'assets').mkdir(exist_ok=True)
                (args.output / file).write_bytes(data)
                by_hash[sha] = {'id': 'real-' + sha[:16], 'sha256': sha, 'file': file, 'bytes': len(data),
                                **info, 'kind': 'unknown', 'reviewStatus': 'pending-visual-review', 'origins': []}
            row = by_hash[sha]
            origin = {**candidate, **{k:v for k,v in fetched.items() if k in ('retrievedAt','importedAt','finalUrl')}}
            merge_origin(row, origin)
            print('asset', index + 1, len(by_hash), row['id'], flush=True)
        except Exception as error:
            failures.append({'candidate': candidate, 'error': str(error)})
            print('asset-error', url, str(error), flush=True)
        if (index + 1) % 25 == 0:
            save(path, list(by_hash.values()))
            save(args.output / 'download-errors.json', failures)
    save(path, list(by_hash.values()))
    save(args.output / 'download-errors.json', failures)


def review(args):
    assets = json.loads((args.output / 'assets.json').read_text())
    labels_file = ROOT / 'scripts/inverse/datasets/real-review.json'
    labels = json.loads(labels_file.read_text()) if labels_file.exists() else {}
    for i, row in enumerate(assets):
        row['reviewIndex'] = i
        row.update(labels.get(row['id'], {}))
    folder = args.output / 'review'
    folder.mkdir(exist_ok=True)
    for start in range(0, len(assets), 48):
        canvas = Image.new('RGB', (1200, 8*160), 'white')
        draw = ImageDraw.Draw(canvas)
        for j, row in enumerate(assets[start:start+48]):
            im = ImageOps.exif_transpose(Image.open(args.output / row['file'])).convert('RGB')
            im.thumbnail((190, 125))
            x,y=(j%6)*200,(j//6)*160
            canvas.paste(im, (x+(190-im.width)//2,y))
            draw.text((x+3,y+126),f"{start+j}: {row['origins'][0]['source'][:21]}",fill='black')
            draw.text((x+3,y+140),row['kind'][:28],fill='black')
        canvas.save(folder / f'contact-{start:04d}.jpg', quality=88)
    # Similarity is only a REVIEW suggestion: same motifs are not automatically merged.
    pairs = []
    for i,a in enumerate(assets):
        for b in assets[i+1:]:
            if abs(a['width']/a['height'] - b['width']/b['height']) > .04:
                continue
            distance = bin(int(a['dhash256'],16) ^ int(b['dhash256'],16)).count('1')
            if distance <= 16:
                rgb_error = sum(abs(x-y) for ap,bp in zip(a['thumbnailRgb'],b['thumbnailRgb']) for x,y in zip(ap,bp)) / (256*3*255)
                pairs.append({'a':a['id'],'b':b['id'],'dhashDistance':distance,'meanThumbnailRgbError':rgb_error})
    save(args.output / 'near-duplicate-candidates.json',pairs)
    save(args.output / 'review-assets.json',assets)
    print(json.dumps({'assets':len(assets),'kinds':dict(Counter(a['kind'] for a in assets)), 'nearDuplicateCandidates':len(pairs)},indent=2))


def export(args):
    review(args)
    assets = json.loads((args.output / 'review-assets.json').read_text())
    rights_path = ROOT / 'scripts/inverse/datasets/real-rights.json'
    rights = json.loads(rights_path.read_text()) if rights_path.exists() else {}
    for row in assets:
        for origin in row['origins']:
            for page in origin['sourcePages']:
                if page in rights:
                    origin.update(rights[page])
        row.pop('thumbnailRgb',None)
        row['localPath'] = str((args.output / row.pop('file')).relative_to(ROOT))
        row['exactDuplicateGroup'] = row['sha256']
        row.setdefault('nearDuplicateGroup', row['id'])
        row['sourceGroups'] = sorted({g for o in row['origins'] for g in o.get('sourceGroups', [o['sourceGroup']])})
        existing = any(o.get('existingFile') for o in row['origins'])
        host_groups = {'publisher:' + urlsplit(page).netloc.removeprefix('www.') for origin in row['origins'] for page in origin['sourcePages'] if 'pinterest.' not in urlsplit(page).netloc}
        host_groups.update('publisher:' + urlsplit(link).netloc.removeprefix('www.') for origin in row['origins'] for link in origin.get('observedSourceLinks', []))
        row['sourceGroups'] = sorted(set(row['sourceGroups']) | host_groups)
        row['splitStatus'] = 'qa-reserved' if existing else 'unassigned'
        row['trainingEligibility'] = 'excluded-existing-qa' if existing else 'pending-rights-family-and-instance-review'
        row.setdefault('familyId', None)
        row['familyReviewStatus'] = 'pending'
        row['imageSha256'] = row['sha256']
        row['groupId'] = row['nearDuplicateGroup']
        row['trainingRightsStatus'] = 'not-cleared'
        row['templatePairStatus'] = 'unverified'
    assign_split_groups(assets)
    discovery = json.loads((args.output / 'discovery.json').read_text())
    pages = {p['url']: p for p in discovery['pages']}
    for row in assets:
        links = {link for o in row['origins'] for page in o['sourcePages'] for link in pages.get(page, {}).get('referenceLinks', [])}
        row['unverifiedTemplateLinks'] = sorted(links)
        row['samePageTemplateAssetIds'] = sorted({other['id'] for other in assets if other['kind'] == 'template-render' and any(set(o['sourcePages']) & set(p['sourcePages']) for o in row['origins'] for p in other['origins'])})
    result = {'version':1, 'generatedAt':now(), 'assetRoot':str(args.output.relative_to(ROOT)),
              'description':'Original public-source files and existing fixtures; photographs are individually visually reviewed. Not a count of independent designs or labeled heart instances.',
              'counts':{'uniqueFileHashes':len(assets),'kinds':dict(Counter(a['kind'] for a in assets)),
                        'sourcePages':len(discovery['pages']), 'visuallyReviewedFiles':sum(a['reviewStatus'].startswith('visually-reviewed') for a in assets), 'reviewedPhotoFileHashes':sum(a['kind'] in ('photo','photo-multiple','photo-collage','mixed-photo-template') for a in assets), 'photoNearDuplicateGroups':len({a['nearDuplicateGroup'] for a in assets if a['kind'] in ('photo','photo-multiple','photo-collage','mixed-photo-template')}), 'qaReservedFiles':sum(a['splitStatus']=='qa-reserved' for a in assets)},
              'splitPolicy':'Keep all files/crops from a source photo, near-duplicate group and motif family together. SourceGroups conservatively include publishers and UNVERIFIED source links observed in pin JSON; these possible connections can over-reserve QA and do not establish motif families, authorship or image origin. No random image-level split; family annotation remains pending.',
              'rightsPolicy':'Public accessibility and craft-template download permission do not establish training or redistribution rights. Rights facts are retained per origin; all assets remain not-cleared unless separately reviewed.',
              'assets': assets, 'pages':discovery['pages'], 'pinterestCollection':json.loads((args.output/'pinterest/imports.json').read_text()) if (args.output/'pinterest/imports.json').exists() else None, 'collectionErrors':discovery['errors'] + json.loads((args.output/'download-errors.json').read_text())}
    save(ROOT / 'docs/inverse/datasets/real-manifest.json', result)
    write_gallery(args.output, assets)
    print(json.dumps(result['counts'], indent=2))


def assign_split_groups(assets):
    """Conservatively join publisher/family groups and reviewed duplicate links."""
    parent = {a['id']: a['id'] for a in assets}
    def find(key):
        while parent[key] != key:
            parent[key] = parent[parent[key]]
            key = parent[key]
        return key
    def union(a, b):
        parent[find(b)] = find(a)
    groups = {}
    for row in assets:
        keys = ['near:' + row['nearDuplicateGroup']] + ['source:' + g for g in row['sourceGroups']]
        for key in keys:
            if key in groups:
                union(row['id'], groups[key])
            groups[key] = row['id']
    reserved = {find(a['id']) for a in assets if a['splitStatus'] == 'qa-reserved'}
    members = {}
    for row in assets:
        members.setdefault(find(row['id']), []).append(row['id'])
    for row in assets:
        group = find(row['id'])
        row['splitGroupId'] = 'real-split-' + digest('|'.join(sorted(members[group])).encode())[:16]
        if group in reserved:
            row['splitStatus'] = 'qa-reserved'
            row['trainingEligibility'] = 'excluded-existing-qa-or-connected-source-group'


def write_gallery(out, assets):
    cards = []
    for row in assets:
        src = Path(row['localPath']).relative_to(out.relative_to(ROOT))
        origins = ''.join('<li><a href="' + html.escape(o['sourcePages'][0]) + '">' + html.escape(o['source']) + '</a></li>' if o['sourcePages'] else '<li>user-provided source</li>' for o in row['origins'])
        cards.append('<article data-kind="' + row['kind'] + '"><a href="' + str(src) + '"><img loading="lazy" src="' + str(src) + '"></a><h3>' + str(row['reviewIndex']) + ' · ' + row['kind'] + '</h3><p>' + row['id'] + '<br>' + str(row['width']) + '×' + str(row['height']) + ' · ' + row['splitStatus'] + '</p><ul>' + origins + '</ul></article>')
    content = '<!doctype html><meta charset="utf-8"><title>Real heart photograph review</title><style>body{font:15px system-ui;margin:24px;background:#eee}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}article{background:white;padding:12px}img{width:100%;height:220px;object-fit:contain}h3{font-size:15px}p{font-size:12px;overflow-wrap:anywhere}</style><h1>Real heart photograph review</h1><p>Local research assets. Kind labels were visually reviewed; counts are source files, not independent designs. Templates, process shots and unrelated assets are retained separately. Rights and family/instance annotations remain incomplete.</p><p><label>Show <select id="kind"><option value="">All files</option><option value="photo">Photographs containing assembled hearts</option><option value="photo-process">Assembly process</option><option value="template-render">Templates / renders</option><option value="unrelated">Unrelated</option><option value="unknown">Unreviewed</option></select></label></p><main>' + ''.join(cards) + '</main><script>document.querySelector("#kind").onchange=e=>document.querySelectorAll("article").forEach(a=>{const k=e.target.value;a.hidden=k==="photo"?!["photo","photo-multiple","photo-collage","mixed-photo-template"].includes(a.dataset.kind):k&&a.dataset.kind!==k;});</script>'
    (out / 'index.html').write_text(content)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['discover','collect','review','export'])
    parser.add_argument('--output',type=Path,default=DEFAULT_OUTPUT)
    parser.add_argument('--seeds',type=Path,default=ROOT/'scripts/inverse/datasets/real-sources.json')
    parser.add_argument('--offline',action='store_true')
    args=parser.parse_args(); args.output.mkdir(exist_ok=True,parents=True)
    seeds=json.loads(args.seeds.read_text())
    lock = (args.output / '.collection.lock').open('a')
    if args.command in ('discover', 'collect'):
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    fetcher=Fetcher(args.output,args.offline)
    if args.command=='discover': discover(args,seeds,fetcher)
    elif args.command=='collect': collect(args,fetcher)
    elif args.command=='review': review(args)
    else: export(args)


if __name__=='__main__':
    main()
