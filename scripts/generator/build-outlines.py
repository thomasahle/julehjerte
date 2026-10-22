"""Rebuild the local motif catalogue; no image fitting or cut solver.
Requires shapely, svgpathtools. Sources/licences are vendored alongside these
assets. Curves are flattened within 0.05 icon units, then the SVG fill rule and
overlapping shapes are resolved before extracting contours. The fonts are not
built: the page reads their files (src/lib/generator/fontLibrary.ts).
"""
import json, math, subprocess, sys, shutil
from pathlib import Path
from xml.etree import ElementTree as ET
from shapely.geometry import Polygon, LineString
from shapely.ops import unary_union, polygonize
from svgpathtools import parse_path, Line

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'static/generator'
OUT.mkdir(exist_ok=True)

def area(r):
    return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(r,r[1:]+r[:1]))/2

def winding(p,r):
    x,y=p; n=0
    for a,b in zip(r,r[1:]+r[:1]):
        cross=(b[0]-a[0])*(y-a[1])-(x-a[0])*(b[1]-a[1])
        if a[1]<=y<b[1] and cross>0: n+=1
        if b[1]<=y<a[1] and cross<0: n-=1
    return n

def fill(rings,evenodd=False):
    lines=[LineString(r+[r[0]]) for r in rings if len(r)>2]
    faces=polygonize(unary_union(lines))
    inside=lambda n:n%2!=0 if evenodd else n!=0
    return unary_union([p for p in faces if inside(sum(winding(p.representative_point().coords[0],r) for r in rings))])

def contours(geom):
    if geom.is_empty: return []
    polys=[geom] if geom.geom_type=='Polygon' else list(geom.geoms)
    result=[]
    for p in polys:
        if p.geom_type!='Polygon': continue
        for ring in [p.exterior,*p.interiors]:
            r=[list(q) for q in ring.coords][:-1]
            if area(r)<0:r.reverse()
            result.append([[round(x,5),round(y,5)] for x,y in r])
    return result

def flatten(evalp,tol):
    result=[evalp(0)]
    def step(a,b,p,q,depth):
        mids=[a+(b-a)*v for v in [.25,.5,.75]]
        line=LineString([p,q]); err=max(line.distance(__import__('shapely').geometry.Point(evalp(t))) for t in mids)
        if err<=tol or depth>=14: result.append(q);return
        m=(a+b)/2;r=evalp(m);step(a,m,p,r,depth+1);step(m,b,r,q,depth+1)
    step(0,1,result[0],evalp(1),0)
    return result

def svg_geometry(art, tolerance=.05):
    root=ET.fromstring('<svg>'+art+'</svg>')
    def element(e,attrs):
        attrs={**attrs,**e.attrib}; tag=e.tag;paths=[]
        if tag in ['svg','g']:
            return unary_union([element(c,attrs) for c in e])
        if tag=='path':
            for sub in parse_path(e.attrib['d']).continuous_subpaths():
                pts=[]
                for seg in sub:
                    vals=flatten(lambda t:[seg.point(t).real,seg.point(t).imag],tolerance) if not isinstance(seg,Line) else [[seg.start.real,seg.start.imag],[seg.end.real,seg.end.imag]]
                    pts+=vals if not pts else vals[1:]
                if len(pts)>2 and pts[-1]==pts[0]:pts.pop()
                if len(pts)>1:paths.append(pts)
        elif tag in ['circle','ellipse']:
            cx=float(attrs.get('cx',0));cy=float(attrs.get('cy',0));rx=float(attrs.get('rx',attrs.get('r',0)));ry=float(attrs.get('ry',attrs.get('r',0)))
            n=max(32,math.ceil(math.pi*math.sqrt(max(rx,ry)/.1)))
            paths=[[[cx+rx*math.cos(i*2*math.pi/n),cy+ry*math.sin(i*2*math.pi/n)] for i in range(n)]]
        elif tag=='rect':
            x=float(attrs.get('x',0));y=float(attrs.get('y',0));w=float(attrs['width']);h=float(attrs['height']);paths=[[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]]
        else:raise ValueError(tag)
        geo=fill(paths,attrs.get('fill-rule')=='evenodd') if attrs.get('fill')!='none' else Polygon()
        if attrs.get('stroke') not in [None,'none']:
            width=float(attrs.get('stroke-width',1))
            strokes=[LineString(r).buffer(width/2,cap_style=3 if attrs.get('stroke-linecap')=='square' else 1,join_style=2) for r in paths]
            geo=unary_union([geo,*strokes])
        # Original simple motif white parts are composited separately below.
        return geo
    # Paint order matters: an explicitly paper-coloured element subtracts.
    result=Polygon()
    for e in root:
        g=element(e,{})
        result=result.difference(g) if 'var(' in e.attrib.get('fill','') else result.union(g)
    return result

def fitted(icon):
    # The sets pad their icons differently; fill the picker's box as the simple motifs do.
    box=max(icon['width'],icon['height'])
    x,y,X,Y=svg_geometry(icon['body'],.05 if box>=100 else box/5120).bounds;k=90/max(X-x,Y-y)
    return f'<g transform="translate({50-k*(x+X)/2:.2f} {50-k*(y+Y)/2:.2f}) scale({k:.4f})">{icon["body"]}</g>'

def build_motifs():
    library=json.loads((ROOT/'docs/design-start/assets/motif-library.js').read_text().split(' = ',1)[1].rstrip(';\n'))
    simple=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {motifs} from './docs/design-start/motifs.mjs';console.log(JSON.stringify(motifs))"],cwd=ROOT))
    icons={}
    tabler=json.loads((ROOT/'scripts/generator/vendor/tabler-filled.json').read_text())
    items=[{**item,'box':100,'package':'juleflet'} for item in simple]
    # Christmas motifs and animals picked from several open sets; see SOURCES.txt.
    curated=json.loads((ROOT/'scripts/generator/vendor/curated.json').read_text())
    items += [{'id':c['id'],'art':fitted(c),'name':c['id'].split('-',1)[1].replace('-',' ').title(),'box':100,'package':c['package'],**({'author':c['author']} if 'author' in c else {})} for c in curated]
    items += [{'id':'ph-'+k,'art':v,'name':k.replace('-',' ').title(),'box':256,'package':'phosphor'} for k,v in library['icons'].items()]
    items += [{'id':'tb-'+k,'art':v,'name':k.replace('-',' ').title(),'box':24,'package':'tabler'} for k,v in tabler['icons'].items()]
    raw={c['id']:(c['body'],max(c['width'],c['height'])) for c in curated}
    for item in items:
        art,box=raw.get(item['id'],(item['art'],item['box']))
        geo=svg_geometry(art,.05 if box >= 100 else box/5120); x,y,X,Y=geo.bounds;scale=1/max(X-x,Y-y)
        rings=contours(geo)
        icons[item['id']]={'name':item['name'],'contours':[[[round((a-(x+X)/2)*scale,5),round((b-(y+Y)/2)*scale,5)] for a,b in r] for r in rings]}
    (OUT/'motifs').mkdir(exist_ok=True)
    for name,data in icons.items(): (OUT/'motifs'/f'{name}.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    (OUT/'motifs.json').unlink(missing_ok=True)
    (OUT/'catalog.json').write_text(json.dumps(items,ensure_ascii=False,separators=(',',':')))
    shutil.copyfile(ROOT/'docs/design-start/assets/phosphor-LICENSE.txt',OUT/'phosphor-LICENSE.txt')
    print(f'Wrote {len(icons)} motifs')

if __name__ == '__main__':
    build_motifs()
