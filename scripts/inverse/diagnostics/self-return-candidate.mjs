/** Offline short-return proposal, never imported by the application.
 * Candidate distances use both curve branches, including adjacent cubics.
 * A stationary close pair or a close path turning at least 180 degrees counts
 * as a return. Exact subdivision should not create a new sharp bend.
 * These numerical predicates are experimental, not a paper-strength proof.
 * Broad crossing/clearance checks and editor validation remain separate.
 */
import {distance,dot,sub,cross,realRoots01} from '../../../static/inverse/core/bezier.js';
import {curvesOf} from '../../../static/inverse/core/graph.js';
import {nearbyPairs} from '../../../static/inverse/core/geometry.js';
const clamp=(t,a,b)=>Math.max(a,Math.min(b,t));
function project(p,a,b){const d=sub(b,a),t=clamp(dot(sub(p,a),d)/(dot(d,d)||1),0,1);return {t,point:[a[0]+t*d[0],a[1]+t*d[1]]};}
function closest(a,b,c,d){
 let best=null;const retain=(u,v,p,q)=>{const gap=distance(p,q);if(!best||gap<best.gap)best={u,v,gap};};
 for(const [p,u]of [[a,0],[b,1]]){const q=project(p,c,d);retain(u,q.t,p,q.point);}
 for(const [p,v]of [[c,0],[d,1]]){const q=project(p,a,b);retain(q.t,v,q.point,p);}
 return best;
}
function localMinimum(curves,index,t,delta){
 const directions=[];
 const add=(curve,at,sign)=>{
  let tangent=curve.derivative(at);
  if(Math.hypot(...tangent)<1e-9)tangent=sub(curve.point(Math.min(1,at+1e-4)),curve.point(Math.max(0,at-1e-4)));
  directions.push({tangent,sign});
 };
 if(t>1e-5)add(curves[index],t,-1);else if(index>0)add(curves[index-1],1,-1);
 if(t<1-1e-5)add(curves[index],t,1);else if(index+1<curves.length)add(curves[index+1],0,1);
 return directions.every(({tangent,sign})=>sign*dot(delta,tangent)>=-1e-3*Math.hypot(...delta)*Math.hypot(...tangent));
}
function totalTurning(curves,first,last,parameters){
 const directions=[];
 for(let index=first;index<=last;index++){
  const curve=curves[index],p=curve.p;
  const lo=index===first?parameters[0]:0,hi=index===last?parameters[1]:1;
  const d=[0,1].map(k=>[3*(p[1][k]-p[0][k]),6*(p[2][k]-2*p[1][k]+p[0][k]),3*(p[3][k]-3*p[2][k]+3*p[1][k]-p[0][k])]);
  const v=[0,1,2].map(i=>d.map(axis=>axis[i]));
  const turns=[cross(v[0],v[1]),2*cross(v[0],v[2]),cross(v[1],v[2])];
  // Axis roots prevent angle wrapping; curvature roots separate changes in
  // turn direction. These are floating-point polynomial roots, not a proof.
  const knots=[lo,...[...realRoots01(d[0]),...realRoots01(d[1]),...realRoots01(turns)].filter(t=>t>lo&&t<hi).sort((a,b)=>a-b),hi];
  const tangent=(t,side)=>{
   let value=curve.derivative(t);
   if(Math.hypot(...value)<1e-9){value=curve.second(t).map(x=>x*side);if(Math.hypot(...value)<1e-9)value=v[2];}
   return value;
  };
  if(lo===hi)directions.push(tangent(lo,lo===1?-1:1));
  for(let k=1;k<knots.length;k++)directions.push(tangent(knots[k-1],1),tangent(knots[k],-1));
 }
 return directions.slice(1).reduce((sum,d,i)=>sum+Math.abs(Math.atan2(cross(directions[i],d),dot(directions[i],d)))*180/Math.PI,0);
}
function polish(a,b,ta,tb,u,v){
 let cost=distance(a.point(u),b.point(v))**2;
 for(let iteration=0;iteration<20;iteration++){
  const delta=sub(a.point(u),b.point(v)),du=a.derivative(u),dv=b.derivative(v),gu=dot(delta,du),gv=-dot(delta,dv);
  const aa=dot(du,du)+dot(delta,a.second(u)),bb=dot(dv,dv)-dot(delta,b.second(v)),ab=-dot(du,dv),det=aa*bb-ab*ab;
  const nu=aa>0&&bb>0&&det>1e-12?(bb*gu-ab*gv)/det:gu/(dot(du,du)||1);
  const nv=aa>0&&bb>0&&det>1e-12?(aa*gv-ab*gu)/det:gv/(dot(dv,dv)||1);
  let accepted=false;
  for(let step=1;step>1e-6;step/=2){
   const pu=clamp(u-step*nu,...ta),pv=clamp(v-step*nv,...tb),next=distance(a.point(pu),b.point(pv))**2;
   if(next<cost-1e-16){u=pu;v=pv;cost=next;accepted=true;break;}
  }
  if(!accepted)break;
 }
 return [u,v];
}
export function experimentalSelfReturns(solution,cfg){
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
  const found=new Set();
  for(const [i,j]of nearbyPairs(segments.map(s=>s.p),margin)){
   const [a,b]=segments[i].arc<segments[j].arc?[segments[i],segments[j]]:[segments[j],segments[i]];
   if(b.arc+b.length-a.arc<2*margin||b.arc-a.arc-a.length>local)continue;
   const q=closest(...a.p,...b.p);if(q.gap>=margin)continue;
   const parameters=polish(curves[a.order],curves[b.order],a.ts,b.ts,a.ts[0]+q.u*(a.ts[1]-a.ts[0]),b.ts[0]+q.v*(b.ts[1]-b.ts[0]));
   const u=(parameters[0]-a.ts[0])/(a.ts[1]-a.ts[0]),v=(parameters[1]-b.ts[0])/(b.ts[1]-b.ts[0]);
   const along=b.arc+v*b.length-a.arc-u*a.length;if(along<2*margin||along>local)continue;
   const points=[curves[a.order].point(parameters[0]),curves[b.order].point(parameters[1])],gap=distance(...points);
   if(gap>=margin)continue;
   if(points.some(p=>[curves[0].p[0],curves.at(-1).p[3]].some(end=>distance(p,end)<.01*width)))continue;
   const delta=sub(...points);
   const stationary=localMinimum(curves,a.order,parameters[0],delta)&&localMinimum(curves,b.order,parameters[1],delta.map(v=>-v));
   const turning=stationary?null:totalTurning(curves,a.order,b.order,parameters);
   if(!stationary&&turning<180-1e-6)continue;
   const key=`${a.order}:${b.order}`;if(found.has(key))continue;found.add(key);
   issues.push({family,slit,curves:[a.order,b.order],parameters,points,distanceUpper:gap,required:margin,arcSeparation:along,stationary,totalTurning:turning,edgeChain:solution.paths[family][slit].slice(a.order,b.order+1).map(([edge])=>edge)});
   if(found.size>=4)break;
  }
 }
 return issues;
}
