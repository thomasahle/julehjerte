/** Evaluation only. Isolate boundary geometry from candidate-junction placement.
 * No cutting-path ownership or known hidden connector is passed to the solver.
 */
import {Cubic,distance,dot,sub,segmentDistance,realRoots01,splitLong} from '../../../static/inverse/core/bezier.js';
import {keyPoint} from '../../../static/inverse/core/geometry.js';
import {buildGraph} from '../../../static/inverse/core/graph.js';
import {preprocessMask} from '../../../static/inverse/core/input.js';

const polynomial=p=>[p[0],3*(p[1]-p[0]),3*(p[2]-2*p[1]+p[0]),p[3]-3*p[2]+3*p[1]-p[0]];
const evaluate=(p,t)=>((p[3]*t+p[2])*t+p[1])*t+p[0];

/** Diagnostic ray sampler of the cubic geometry, without adaptive chords.
 * Split at y extrema, then bisect each monotone interval. A fixed 1e-9 mm
 * pixel-centre tie convention avoids ulp-dependent membership at a boundary.
 * Final template acceptance still uses the independent exported SVG renderer.
 */
export function sampleCubicBoundary(target,n){
  const intervals=[],left=new Map(),width=target.width;
  for(const curve of target.curves){
    const x=polynomial(curve.p.map(p=>p[0])),y=polynomial(curve.p.map(p=>p[1]));
    const ts=[0,...realRoots01([y[1],2*y[2],3*y[3]]),1];
    for(let i=1;i<ts.length;i++){const lo=ts[i-1],hi=ts[i];intervals.push({x,y,lo,hi,lowY:evaluate(y,lo),highY:evaluate(y,hi)});}
    for(const p of [curve.p[0],curve.p[3]])if(Math.abs(p[0])<1e-6){const key=p[1].toFixed(6);left.set(key,(left.get(key)||0)+1);}
  }
  const leftTransitions=[...left].filter(([y,count])=>count%2&&+y>1e-6&&+y<width-1e-6).map(([y])=>+y);
  const mask=new Uint8Array(n*n);
  for(let row=0;row<n;row++){
    const y=(row+.5)*width/n+1e-9,crossings=[];
    for(const interval of intervals){
      if((interval.lowY>y)===(interval.highY>y))continue;
      let lo=interval.lo,hi=interval.hi;
      for(let j=0;j<48;j++){const mid=(lo+hi)/2;if((evaluate(interval.y,mid)>y)===(interval.lowY>y))lo=mid;else hi=mid;}
      crossings.push(evaluate(interval.x,(lo+hi)/2));
    }
    crossings.sort((a,b)=>a-b);let parity=target.phase,index=0;
    for(const transition of leftTransitions)if(transition<=y)parity^=1;
    for(let col=0;col<n;col++){
      const x=(col+.5)*width/n;while(index<crossings.length&&crossings[index]<x-1e-9){parity^=1;index++;}mask[row*n+col]=parity;
    }
  }
  return mask;
}

export function closestCurvePoint(curve,point){
  const coefficient=[0,1].map(k=>{
    const p=curve.p.map(q=>q[k]);
    return[p[0]-point[k],3*(p[1]-p[0]),3*(p[2]-2*p[1]+p[0]),p[3]-3*p[2]+3*p[1]-p[0]];
  });
  const polynomial=Array(6).fill(0);
  for(const axis of coefficient)for(let i=0;i<4;i++)for(let j=1;j<4;j++)polynomial[i+j-1]+=axis[i]*j*axis[j];
  return[0,1,...realRoots01(polynomial)].map(t=>({t,point:curve.point(t),distance:distance(curve.point(t),point)})).sort((a,b)=>a.distance-b.distance||a.t-b.t)[0];
}

/** Reference positions only add subdivision points on the existing boundary.
 * They never pull a traced boundary toward the reference, nor add a connector.
 */
export function projectJunctions(curves,points,maxDistance){
  if(!Number.isFinite(maxDistance)||maxDistance<0)throw new Error('Use a finite nonnegative projection distance.');
  const cuts=curves.map(()=>[0,1]),projections=[];
  for(const point of points){
    const nearest=curves.map((curve,index)=>({...closestCurvePoint(curve,point),curve:index})).sort((a,b)=>a.distance-b.distance||a.curve-b.curve)[0];
    if(!nearest||nearest.distance>maxDistance){projections.push({source:point,matched:false,distance:nearest?.distance});continue;}
    cuts[nearest.curve].push(nearest.t);projections.push({source:point,matched:true,...nearest});
  }
  const parts=curves.flatMap((curve,index)=>{
    const ts=[0];for(const t of cuts[index].sort((a,b)=>a-b))if(t<1-1e-10&&t-ts.at(-1)>1e-10)ts.push(t);ts.push(1);
    return ts.slice(1).map((hi,i)=>curve.subcurve(ts[i],hi));
  });
  return{curves:parts,projections,addedSegments:parts.length-curves.length};
}

/** Remove only straight degree-two interior anchors. Curved subdivisions,
 * corners, crossings, and border endpoints remain. This is deliberately a
 * partial junction ablation, not a complete boundary-only oracle.
 */
export function mergeStraightAnchors(curves,width){
  const edges=curves.map(curve=>new Cubic(curve.p)),removed=[];
  for(;;){
    const incident=new Map();
    edges.forEach((curve,index)=>{for(const end of [0,3]){const key=keyPoint(curve.p[end]);if(!incident.has(key))incident.set(key,[]);incident.get(key).push({index,end});}});
    let join=null;
    for(const entries of incident.values()){
      if(entries.length!==2||entries[0].index===entries[1].index)continue;
      const [a,b]=entries,ca=edges[a.index],cb=edges[b.index],point=ca.p[a.end];
      if(ca.flatness()>1e-8||cb.flatness()>1e-8)continue;
      if(Math.min(...point)<=1e-6||Math.max(...point)>=width-1e-6)continue;
      if(distance(point,cb.p[b.end])>1e-8)continue;
      const start=ca.p[3-a.end],end=cb.p[3-b.end];
      if(distance(start,end)<1e-8||dot(sub(start,point),sub(end,point))>=0)continue;
      if([...ca.p,...cb.p].some(p=>segmentDistance(p,start,end)>1e-8))continue;
      join={indices:[a.index,b.index],curve:Cubic.line(start,end),point};break;
    }
    if(!join)break;
    removed.push(join.point);for(const index of join.indices.sort((a,b)=>b-a))edges.splice(index,1);edges.push(join.curve);
  }
  return{curves:edges,removed};
}

const copyTarget=(target,curves=target.curves)=>({...target,curves:curves.map(c=>new Cubic(c.p)),metadata:structuredClone(target.metadata)});
const mismatch=(a,b)=>a.reduce((sum,v,i)=>sum+Number(v!==b[i]),0);

export function boundaryAblationVariants({mask,n,reference,raw,cfg}){
  const variants=[],cleanSettings={...raw,fitTolerance:.25,smoothRadius:0,snapRadius:0,borderRadius:0,mixedBoundaries:true};
  const width=reference.graph.target.width,referencePoints=[...new Map(reference.graph.edges.filter(e=>e.visible).flatMap(e=>[e.curve.p[0],e.curve.p[3]]).map(p=>[keyPoint(p),p])).values()];
  const build=(name,oracle,prepare)=>{
    const at=performance.now(),variant={name,oracle};variants.push(variant);
    try{
      const {target,diagnostics={},before=target,node=true}=prepare();
      variant.diagnostics=diagnostics;variant.boundaryTarget=copyTarget(target);
      const original=sampleCubicBoundary(before,n),graph=buildGraph(copyTarget(target),cfg,{node});
      const after=sampleCubicBoundary(graph.target,n);
      variant.graph=graph;variant.diagnostics={...diagnostics,boundaryImageError:mismatch(after,mask)/mask.length,boundaryChangePixels:mismatch(after,original),preparationSeconds:(performance.now()-at)/1000};
    }catch(error){variant.buildError=error.message;variant.buildErrorStack=error.stack;variant.diagnostics={...variant.diagnostics,preparationSeconds:(performance.now()-at)/1000};}
  };
  let photo,clean;
  const photoTarget=()=>photo??=preprocessMask(mask,n,raw);
  const cleanTarget=()=>clean??=preprocessMask(mask,n,cleanSettings);
  const junctions=target=>{
    const projected=projectJunctions(target.curves,referencePoints,1);
    return{target:copyTarget(target,projected.curves),before:target,diagnostics:{maxProjectionDistanceMm:1,referenceJunctions:referencePoints.length,...projected,curves:undefined}};
  };
  build('raster-heuristic',false,()=>({target:photoTarget(),diagnostics:{preprocessing:raw}}));
  build('raster-reference-junctions','Reference visible-boundary vertices projected onto the photo-oriented trace; no boundary movement',()=>junctions(photoTarget()));
  build('raster-clean',false,()=>({target:cleanTarget(),diagnostics:{preprocessing:cleanSettings}}));
  build('raster-clean-reference-junctions','Reference visible-boundary vertices projected onto the clean trace; no boundary movement',()=>junctions(cleanTarget()));
  build('raster-clean-uniform-junctions',false,()=>({target:copyTarget(cleanTarget(),cleanTarget().curves.flatMap(c=>splitLong(c,8))),before:cleanTarget(),diagnostics:{maximumSpanMm:8}}));
  const exact={...reference.graph.target,curves:reference.graph.edges.filter(e=>e.visible).map(e=>e.curve)};
  build('exact-boundary-heuristic','Exact visible boundary geometry and reference subdivision',()=>({target:exact,node:false}));
  const merged=mergeStraightAnchors(exact.curves,width),minimal=copyTarget(exact,merged.curves);
  build('exact-boundary-merged-lines','Exact visible boundaries with straight degree-two interior anchors removed; curved anchors retained',()=>({target:minimal,before:exact,node:false,diagnostics:{removedStraightAnchors:merged.removed}}));
  build('exact-boundary-merged-lines-uniform','Exact visible boundaries with straight anchors removed and all curves subdivided at a bounded span; curved reference anchors retained',()=>({target:copyTarget(minimal,minimal.curves.flatMap(c=>splitLong(c,8))),before:exact,node:false,diagnostics:{removedStraightAnchors:merged.removed,maximumSpanMm:8}}));
  return variants;
}
