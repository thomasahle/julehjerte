"""Independent polygon-offset diagnostic for the exported unfolded sheets.

Not used by fitting or acceptance. Cubics are independently subdivided, then
GEOS offsets approximate the nominal disk-centre core without a raster lattice.
"""
import argparse, hashlib, json, math
from pathlib import Path
import shapely
from shapely.geometry import LineString, Polygon, GeometryCollection
from shapely.ops import unary_union


def distance_to_segment(p, a, b):
    vx, vy = b[0]-a[0], b[1]-a[1]
    t = max(0., min(1., ((p[0]-a[0])*vx+(p[1]-a[1])*vy)/(vx*vx+vy*vy))) if vx*vx+vy*vy else 0.
    return math.hypot(p[0]-a[0]-t*vx, p[1]-a[1]-t*vy)


def flatten_cubic(points, tolerance, depth=0):
    if max(distance_to_segment(p, points[0], points[3]) for p in points[1:3]) <= tolerance:
        return [points[0], points[3]]
    if depth >= 24:
        raise ValueError('Independent cubic subdivision exceeded its depth bound')
    mid = lambda a,b: [(a[0]+b[0])/2, (a[1]+b[1])/2]
    a,b,c = [mid(points[i],points[i+1]) for i in range(3)]
    d,e = mid(a,b),mid(b,c)
    f = mid(d,e)
    return flatten_cubic([points[0],a,d,f],tolerance,depth+1)[:-1]+flatten_cubic([f,e,c,points[3]],tolerance,depth+1)


def read_paths(data, family, tolerance):
    paths=[]
    for refs in data[['A_overlap_paths','B_overlap_paths'][family]]:
        points=[]
        for ref in refs:
            p=data['curves'][str(ref['curve'])]['control_points']
            if ref['reverse']: p=p[::-1]
            poly=flatten_cubic(p,tolerance)
            if points:
                if math.dist(points[-1],poly[0])>1e-8: raise ValueError('Disconnected exported slit')
                points.extend(poly[1:])
            else: points=poly
        if family:points=[[y,x] for x,y in points]
        paths.append(points)
    return paths


def polygons(geometry):
    if isinstance(geometry, Polygon): return [geometry]
    if hasattr(geometry,'geoms'): return [p for g in geometry.geoms for p in polygons(g)]
    return []


def core_audit(paths, width, radius, min_area, tolerance, quad_segs):
    if radius<=0 or radius>=width/2:raise ValueError('Unsupported core radius')
    # The eroded uncut outline is the same capsule with a smaller radius.
    body=LineString([(width/2,0),(width/2,2*width)]).buffer(width/2-radius,quad_segs=quad_segs)
    unfolded=[p+[[x,2*width-y] for x,y in p[-2::-1]] for p in paths]
    cuts=unary_union([LineString(p).buffer(radius,quad_segs=quad_segs) for p in unfolded]) if paths else GeometryCollection()
    core=body.difference(cuts)
    if not core.is_valid:raise ValueError('GEOS produced an invalid offset geometry')
    parts=polygons(core);anchored=[];floating=[];summary=[]
    for p in parts:
        anchored_here=p.bounds[1]<-1.1*radius or p.bounds[3]>2*width+1.1*radius
        (anchored if anchored_here else floating).append(p)
        summary.append({'area':p.area,'bounds':list(p.bounds),'anchored':anchored_here,'significant':p.area>=min_area})
    anchor_union=unary_union(anchored)
    fold_cuts=sorted([0,width]+[p[-1][0] for p in paths])
    folds=[{'interval':[a,b],'anchoredCoreLength':anchor_union.intersection(LineString([(a,width),(b,width)])).length}
           for a,b in zip(fold_cuts,fold_cuts[1:])]
    orphan=[p for p in floating if p.area>=min_area]
    # This is continuous intersection length, not the raster's half-cell test.
    passed=not orphan and all(f['anchoredCoreLength']>1e-8 for f in folds)
    return {'passed':passed,'radius':radius,'minFeatureArea':min_area,'flattenTolerance':tolerance,'quadSegments':quad_segs,
            'coreArea':core.area,'parts':summary,'significantFloatingCount':len(orphan),'significantFloatingArea':sum(p.area for p in orphan),'foldIntervals':folds},core,unfolded


def drawing(core, unfolded, width, radius):
    def path(p):
        rings=[p.exterior,*p.interiors]
        return ' '.join('M '+' L '.join(f'{x:.6f},{y:.6f}' for x,y in ring.coords)+' Z' for ring in rings)
    shapes=[]
    for p in polygons(core):
        anchored=p.bounds[1]<-1.1*radius or p.bounds[3]>2*width+1.1*radius
        shapes.append(f'<path d="{path(p)}" fill="'+('#91b19b' if anchored else '#dc5349')+'" fill-rule="evenodd"/>')
    cuts=['<polyline points="'+' '.join(f'{x:.6f},{y:.6f}' for x,y in p)+'" fill="none" stroke="#222" stroke-width=".12"/>' for p in unfolded]
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="500" height="1200" viewBox="-5 {-width/2-5} {width+10} {3*width+10}"><rect x="-5" y="{-width/2-5}" width="{width+10}" height="{3*width+10}" fill="#faf8f4"/>'+''.join(shapes+cuts)+'</svg>'


def selfcheck():
    # Straight cuts leave every fold strip anchored. A two-millimetre strip
    # cannot contain the prescribed 2.5 mm diameter core.
    good=core_audit([[[25,0],[25,100]],[[75,0],[75,100]]],100,1.25,.25,.002,128)[0]
    narrow=core_audit([[[49,0],[49,100]],[[51,0],[51,100]]],100,1.25,.25,.002,128)[0]
    hook=[[[20,0],[20,40],[50,40],[50,60],[22,60],[22,42],[20,42],[20,100]]]
    pinched=core_audit(hook,100,1.25,.25,.002,128)[0]
    assert good['passed'],good
    assert not narrow['passed'] and narrow['foldIntervals'][1]['anchoredCoreLength']==0,narrow
    assert not pinched['passed'] and pinched['significantFloatingCount']==2,pinched
    return {'straightPass':True,'narrowStripFailsFold':True,'pinchedHookHasTwoFloatingCores':True}


def run(plan, output):
    output.mkdir(exist_ok=False)
    info={'schema':'independent-offset-paper-reference-1','shapelyVersion':shapely.__version__,'geosVersion':shapely.geos_version_string,'selfcheck':selfcheck(),'results':[],
          'limitations':['Polygonal GEOS approximation, not a physical strength certificate.','Continuous positive fold support is compared with the lattice half-cell threshold, not asserted identical.','Radius brackets expose numerical sensitivity; component statuses are not monotone in radius.']}
    for case in plan['cases']:
        if isinstance(case['geometry'], str):
            raw=Path(case['geometry']).read_bytes()
            assert hashlib.sha256(raw).hexdigest()==case['sha256']
            data=json.loads(raw)
        else:
            data=case['geometry']
            raw=json.dumps(data,separators=(',',':')).encode()
        w=data['square_width_mm'];cfg=case['settings'];radius=cfg['nominalWidth']/2
        row={'id':case['id'],'sha256':hashlib.sha256(raw).hexdigest(),'results':[]};folder=output/case['id'];folder.mkdir()
        for tolerance,quad in [(.002,256),(.0005,512)]:
            for family in [0,1]:
                paths=read_paths(data,family,tolerance)
                for delta in [-tolerance,0,tolerance]:
                    report,core,unfolded=core_audit(paths,w,radius+delta,cfg['minFeatureArea'],tolerance,quad)
                    row['results'].append({'family':family,'radiusDelta':delta,**report})
                    if delta==0 and tolerance==.0005:(folder/f'paper-{family}.svg').write_text(drawing(core,unfolded,w,radius))
        info['results'].append(row)
        (output/'results.json').write_text(json.dumps(info,indent=2)+'\n')
        print(case['id'],[(v['family'],v['passed'],v['significantFloatingArea']) for v in row['results'] if v['radiusDelta']==0],flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--plan',default='scripts/inverse/fixtures/paper-offset-cases.json');parser.add_argument('--output',required=True);args=parser.parse_args()
    run(json.loads(Path(args.plan).read_text()),Path(args.output))
