"""Rebuild the local outline catalogue; no image fitting or cut solver.
Requires fonttools, shapely, svgpathtools. Sources/licences are vendored alongside
these assets. Curves are flattened within 0.0005 em / 0.05 icon units, then SVG
nonzero winding and overlapping shapes are resolved before extracting contours.
"""
import json, math, subprocess, sys, shutil
from pathlib import Path
from xml.etree import ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.basePen import BasePen
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

def fill(rings):
    lines=[LineString(r+[r[0]]) for r in rings if len(r)>2]
    faces=polygonize(unary_union(lines))
    return unary_union([p for p in faces if sum(winding(p.representative_point().coords[0],r) for r in rings)!=0])

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

class Pen(BasePen):
    def __init__(self,gs,em):super().__init__(gs);self.em=em;self.rings=[];self.r=[]
    def p(self,p):return [p[0]/self.em,-p[1]/self.em]
    def _moveTo(self,p):self.r=[self.p(p)]
    def _lineTo(self,p):self.r.append(self.p(p))
    def _curveToOne(self,b,c,d):
        a=self.r[-1];b,c,d=map(self.p,[b,c,d])
        self.r+=flatten(lambda t:[(1-t)**3*a[i]+3*(1-t)**2*t*b[i]+3*(1-t)*t*t*c[i]+t**3*d[i] for i in range(2)],.0005)[1:]
    def _qCurveToOne(self,b,c):
        a=self.r[-1];b,c=map(self.p,[b,c]);self.r+=flatten(lambda t:[(1-t)**2*a[i]+2*(1-t)*t*b[i]+t*t*c[i] for i in range(2)],.0005)[1:]
    def _closePath(self):
        if self.r and self.r[-1]==self.r[0]:self.r.pop()
        if len(self.r)>2:self.rings.append(self.r)
    def _endPath(self):self._closePath()

def build_fonts():
    fonts={}
    for name,weight in [('nunito',800),('breeserif',400),('oswald',600),('kalam',700),('cinzel',900),('righteous',400)]:
        f=TTFont(ROOT/f'docs/design-start/assets/fonts/{name}.ttf')
        if 'fvar' in f:f=instantiateVariableFont(f,{'wght':weight})
        gs=f.getGlyphSet();cmap=f.getBestCmap();em=f['head'].unitsPerEm;glyphs={}
        for ch in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÆØÅæøåÄÖÜäöüÉé0123456789+-&.! ':
            if ord(ch) not in cmap:continue
            g=gs[cmap[ord(ch)]];p=Pen(gs,em);g.draw(p)
            shape=fill(p.rings)
            # Cut-friendly variants for fonts whose original hairlines are thinner
            # than practical paper strips. Retain their original component/hole count.
            if name in ['cinzel','kalam'] and not shape.is_empty:
                expanded=shape.buffer(.04 if name=='cinzel' else .025,join_style=1).simplify(.0005,preserve_topology=True)
                if len(contours(expanded))==len(contours(shape)):shape=expanded
            glyphs[ch]={'advance':round(g.width/em,5),'contours':contours(shape)}
        fonts[name]={'glyphs':glyphs}
    (OUT/'fonts').mkdir(exist_ok=True)
    for name,data in fonts.items():
        (OUT/'fonts'/f'{name}.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
        sample=[];x=0
        for ch in 'Aa':
            g=data['glyphs'][ch]
            sample += [[[a+x,b] for a,b in r] for r in g['contours']];x+=g['advance']+.05
        pts=[p for r in sample for p in r];l=min(p[0] for p in pts);top=min(p[1] for p in pts);w=max(p[0] for p in pts)-l;h=max(p[1] for p in pts)-top
        d=''.join('M'+'L'.join(f'{a},{b}' for a,b in r)+'Z' for r in sample)
        (OUT/'fonts'/f'{name}-sample.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{l-.03} {top-.03} {w+.06} {h+.06}"><path fill="#40573c" fill-rule="evenodd" d="{d}"/></svg>')
    (OUT/'fonts.json').unlink(missing_ok=True)
    for name in fonts:
        shutil.copyfile(ROOT/f'docs/design-start/assets/fonts/{name}-OFL.txt',OUT/f'fonts/{name}-OFL.txt')

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
        geo=fill(paths) if attrs.get('fill')!='none' else Polygon()
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

def build_motifs():
    library=json.loads((ROOT/'docs/design-start/assets/motif-library.js').read_text().split(' = ',1)[1].rstrip(';\n'))
    simple=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {motifs} from './docs/design-start/motifs.mjs';console.log(JSON.stringify(motifs))"],cwd=ROOT))
    icons={}
    tabler=json.loads((ROOT/'scripts/generator/vendor/tabler-filled.json').read_text())
    items=[{**item,'box':100,'package':'juleflet'} for item in simple]
    items += [{'id':'ph-'+k,'art':v,'name':k.replace('-',' ').title(),'box':256,'package':'phosphor'} for k,v in library['icons'].items()]
    items += [{'id':'tb-'+k,'art':v,'name':k.replace('-',' ').title(),'box':24,'package':'tabler'} for k,v in tabler['icons'].items()]
    for item in items:
        geo=svg_geometry(item['art'],.05 if item['box'] >= 100 else item['box']/5120); x,y,X,Y=geo.bounds;scale=1/max(X-x,Y-y)
        rings=contours(geo)
        icons[item['id']]={'name':item['name'],'contours':[[[round((a-(x+X)/2)*scale,5),round((b-(y+Y)/2)*scale,5)] for a,b in r] for r in rings]}
    (OUT/'motifs').mkdir(exist_ok=True)
    for name,data in icons.items(): (OUT/'motifs'/f'{name}.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    (OUT/'motifs.json').unlink(missing_ok=True)
    (OUT/'catalog.json').write_text(json.dumps(items,ensure_ascii=False,separators=(',',':')))
    shutil.copyfile(ROOT/'docs/design-start/assets/phosphor-LICENSE.txt',OUT/'phosphor-LICENSE.txt')
    print(f'Wrote {len(icons)} motifs')

if __name__ == '__main__':
    if '--icons-only' not in sys.argv: build_fonts()
    if '--fonts-only' not in sys.argv: build_motifs()
