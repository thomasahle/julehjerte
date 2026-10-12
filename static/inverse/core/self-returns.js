/** Supplement the broad self-clearance audit with short, non-adjacent returns.
 * The editor checks these spans even inside the engine's local arc exclusion.
 * Adjacent cubics and ordinary short bends remain exempt. This does not replace
 * crossing checks, the longer-range clearance audit or final editable validation.
 */
import {distance} from './bezier.js';
import {curvesOf} from './graph.js';
import {nearbyPairs} from './geometry.js';

function project(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
  return{t,point:[a[0]+t*dx,a[1]+t*dy]};
}
function closest(a,b,c,d){
  let best=null;
  const retain=(u,v,p,q)=>{const gap=distance(p,q);if(!best||gap<best.gap)best={u,v,gap};};
  for(const [p,u]of [[a,0],[b,1]]){const q=project(p,c,d);retain(u,q.t,p,q.point);}
  for(const [p,v]of [[c,0],[d,1]]){const q=project(p,a,b);retain(q.t,v,q.point,p);}
  return best;
}

export function shortSelfReturns(solution,cfg){
  // 1.5 units in the editor's 100-unit square. Never demand more than the
  // requested paper clearance when this engine is used independently.
  const width=solution.graph.target.width,margin=Math.min(cfg.nominalWidth,.015*width),local=cfg.localNeighborhoodFactor*cfg.nominalWidth,issues=[];
  if(!(margin>0)||local<2*margin)return issues;
  for(let family=0;family<2;family++)for(let slit=0;slit<solution.paths[family].length;slit++){
    const curves=curvesOf(solution,family,slit),segments=[];let arc=0;
    curves.forEach((curve,order)=>{
      const {points,ts}=curve.flatten(cfg.geometryTolerance,margin/5,true);
      for(let i=1;i<points.length;i++){
        const length=distance(points[i-1],points[i]);if(length<1e-10)continue;
        segments.push({p:[points[i-1],points[i]],ts:[ts[i-1],ts[i]],arc,length,order});arc+=length;
      }
    });
    const pairs=new Map();
    for(const [i,j]of nearbyPairs(segments.map(s=>s.p),margin)){
      // The broad phase orders pairs by spatial position, not path position.
      // Restore curve order before checking adjacency or signed arc distance.
      const [a,b]=segments[i].order<segments[j].order?[segments[i],segments[j]]:[segments[j],segments[i]];
      if(b.order<=a.order+1)continue;
      const key=`${a.order}:${b.order}`;
      const q=closest(...a.p,...b.p);if(q.gap>=margin)continue;
      const along=b.arc+q.v*b.length-a.arc-q.u*a.length;
      const parameters=[a.ts[0]+q.u*(a.ts[1]-a.ts[0]),b.ts[0]+q.v*(b.ts[1]-b.ts[0])];
      const points=[curves[a.order].point(parameters[0]),curves[b.order].point(parameters[1])];
      // Test actual curve points: a close chord alone must not reject a cubic
      // whose flattening error accounts for the apparent clearance deficit.
      const gap=distance(...points);if(gap>=margin)continue;
      const previous=pairs.get(key);
      if(!previous||gap<previous.distanceUpper)pairs.set(key,{family,slit,curves:[a.order,b.order],parameters,points,distanceUpper:gap,required:margin,arcSeparation:along});
    }
    let found=0;
    for(const pair of pairs.values()){
      // Assess the nearest pair on the cubics, not arbitrary samples farther
      // around the same bend. Otherwise subdivision creates false returns.
      if(pair.arcSeparation<2*margin||pair.arcSeparation>local)continue;
      if(pair.points.some(p=>[curves[0].p[0],curves.at(-1).p[3]].some(end=>distance(p,end)<.01*width)))continue;
      issues.push({...pair,edgeChain:solution.paths[family][slit].slice(pair.curves[0],pair.curves[1]+1).map(([edge])=>edge)});
      if(++found>=4)break;
    }
  }
  return issues;
}
