/** Optimization witnesses only. The independent geometry and paper audits
 * still decide whether the resulting cutting paths can be used. */
import {curvesOf} from '../graph.js';
import {distance} from '../bezier.js';
import {nearbyPairs} from '../geometry.js';
import {heartPathReturns} from '../return-search.js';
import {completeSelfReturns} from '../complete-self-returns.js';

function project(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
  return{t,p:[a[0]+t*dx,a[1]+t*dy]};
}
function closest(a,b,c,d){
  let best=null;
  const add=(u,v,p,q)=>{const gap=distance(p,q);if(!best||gap<best.gap)best={u,v,gap};};
  for(const [p,u]of [[a,0],[b,1]]){const q=project(p,c,d);add(u,q.t,p,q.p);}
  for(const [p,v]of [[c,0],[d,1]]){const q=project(p,a,b);add(q.t,v,q.p,p);}
  return best;
}

/** Locate nonlocal near-returns with Bézier parameters, so shared-control
 * derivatives can move both witnesses. Crossing segments need a different
 * repair; this proposal search must never be used as an intersection test. */
export function nonlocalClearanceWitnesses(solution,cfg,margin){
  const out=[],tol=cfg.geometryTolerance,local=cfg.localNeighborhoodFactor*cfg.nominalWidth;
  for(let family=0;family<2;family++)for(let slit=0;slit<solution.paths[family].length;slit++){
    const curves=curvesOf(solution,family,slit),segments=[];let arc=0;
    curves.forEach((curve,order)=>{
      const {points,ts}=curve.flatten(tol,margin/5,true);
      for(let i=1;i<points.length;i++){
        const length=distance(points[i-1],points[i]);if(length<1e-10)continue;
        segments.push({p:[points[i-1],points[i]],ts:[ts[i-1],ts[i]],mid:arc+length/2,r:length/2,order});arc+=length;
      }
    });
    const pairs=new Map();
    for(const [i,j]of nearbyPairs(segments.map(s=>s.p),margin+2*tol)){
      const [a,b]=segments[i].order<=segments[j].order?[segments[i],segments[j]]:[segments[j],segments[i]];
      if(Math.abs(a.mid-b.mid)-a.r-b.r<=local)continue;
      const q=closest(...a.p,...b.p);if(q.gap>=margin+2*tol)continue;
      const parameters=[a.ts[0]+q.u*(a.ts[1]-a.ts[0]),b.ts[0]+q.v*(b.ts[1]-b.ts[0])];
      const points=[curves[a.order].point(parameters[0]),curves[b.order].point(parameters[1])],gap=distance(...points),key=a.order+':'+b.order,old=pairs.get(key);
      if(!old||gap<old.distanceUpper)pairs.set(key,{family,slit,curves:[a.order,b.order],parameters,points,distanceUpper:gap,required:margin+4*tol});
    }
    // Recompute after every sweep; a bounded witness list is not a minimum-gap
    // certificate and never substitutes for the final complete validator.
    out.push(...[...pairs.values()].sort((a,b)=>a.distanceUpper-b.distanceUpper).slice(0,4));
  }
  return out;
}

export function clearanceWitnesses(solution,cfg,margin){
  // Keep the original editor witnesses too: increasing the search margin
  // changes the ordinary-bend exemptions, so the larger set is not a superset.
  const out=completeSelfReturns(solution);
  for(let family=0;family<2;family++)for(let slit=0;slit<solution.paths[family].length;slit++){
    const controls=curvesOf(solution,family,slit).map(curve=>curve.p);
    for(const issue of heartPathReturns(controls,margin))out.push({family,slit,...issue});
  }
  return out.concat(nonlocalClearanceWitnesses(solution,cfg,margin));
}
