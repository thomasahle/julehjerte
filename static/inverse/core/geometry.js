/** Tolerance-aware planar predicates on adaptive cubic chords.
 * These are floating-point checks, not exact algebraic curve predicates. */
import {Cubic,sub,add,mul,dot,cross,distance,segmentDistance,clamp,mix} from './bezier.js';
export const keyPoint=(p,digits=5)=>p.map(x=>{const s=x.toFixed(digits);return Number(s)===0?(0).toFixed(digits):s;}).join(',');
export function bbox(points){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const [x,y]of points){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return[x0,y0,x1,y1];}
export function boxDistance(a,b){return Math.hypot(Math.max(0,a[0]-b[2],b[0]-a[2]),Math.max(0,a[1]-b[3],b[1]-a[3]));}
export function segments(poly){return poly.slice(1).map((b,i)=>({a:poly[i],b,box:bbox([poly[i],b]),index:i}));}
export function segmentHits(a,b,c,d,eps=1e-9){
  const r=sub(b,a),s=sub(d,c),den=cross(r,s),q=sub(c,a),rr=dot(r,r),ss=dot(s,s);
  if(rr<eps*eps||ss<eps*eps)return[];
  if(Math.abs(den)>eps*Math.max(1,Math.sqrt(rr*ss))){const t=cross(q,s)/den,u=cross(q,r)/den;if(t>=-eps&&t<=1+eps&&u>=-eps&&u<=1+eps)return[{point:add(a,mul(r,clamp(t))),t:clamp(t),u:clamp(u),overlap:false}];return[];}
  if(Math.abs(cross(q,r))>eps*Math.max(1,Math.sqrt(rr)))return[];
  const t0=dot(q,r)/rr,t1=t0+dot(s,r)/rr,lo=Math.max(0,Math.min(t0,t1)),hi=Math.min(1,Math.max(t0,t1));if(hi<lo-eps)return[];
  return (hi-lo>eps?[lo,hi]:[(lo+hi)/2]).map(t=>{const p=add(a,mul(r,t));return{point:p,t,u:clamp(dot(sub(p,c),s)/ss),overlap:hi-lo>eps};});
}
export function segmentPairDistance(a,b,c,d){if(segmentHits(a,b,c,d).length)return 0;return Math.min(segmentDistance(a,c,d),segmentDistance(b,c,d),segmentDistance(c,a,b),segmentDistance(d,a,b));}
export function lineDistance(a,b,stopBelow=-1){let best=Infinity;const sa=segments(a),sb=segments(b);for(const s of sa)for(const t of sb){if(boxDistance(s.box,t.box)>=best)continue;best=Math.min(best,segmentPairDistance(s.a,s.b,t.a,t.b));if(best<=stopBelow)return best;}return best;}
export function lineHits(a,b){const hits=[],sa=segments(a),sb=segments(b);for(const s of sa)for(const t of sb){if(boxDistance(s.box,t.box)>1e-9)continue;for(const h of segmentHits(s.a,s.b,t.a,t.b))hits.push({...h,i:s.index,j:t.index});}return hits;}
export function lineSimple(poly){const ss=segments(poly);for(let i=0;i<ss.length;i++)for(let j=i+1;j<ss.length;j++){if(boxDistance(ss[i].box,ss[j].box)>1e-9)continue;const hits=segmentHits(ss[i].a,ss[i].b,ss[j].a,ss[j].b);if(!hits.length)continue;if(j===i+1&&hits.every(h=>!h.overlap&&distance(h.point,ss[i].b)<1e-7))continue;return false;}return true;}
export function improperIntersection(a,b,allowed=[],radius=.03){return lineHits(a,b).some(h=>!allowed.some(p=>distance(h.point,p)<=radius));}
export function* nearbyPairs(items,radius=0){const boxes=items.map((p,i)=>({box:bbox(p),i})).sort((a,b)=>a.box[0]-b.box[0]);for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length&&boxes[j].box[0]<=boxes[i].box[2]+radius;j++){if(boxDistance(boxes[i].box,boxes[j].box)<=radius)yield[boxes[i].i,boxes[j].i];}}
export function pointInRing(p,ring){let parity=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j],b=ring[i];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<a[0]+(p[1]-a[1])*(b[0]-a[0])/(b[1]-a[1]))parity^=1;}return parity;}
export function polygonArea(p){let a=0;for(let i=0;i<p.length;i++)a+=cross(p[i],p[(i+1)%p.length]);return a/2;}
export function nodeCurves(curves,tol=.01){
  const flattened=curves.map(c=>c.flatten(tol,Infinity,true)),cuts=curves.map(()=>[0,1]);
  for(const [i,j]of nearbyPairs(flattened.map(x=>x.points),tol))for(const hit of lineHits(flattened[i].points,flattened[j].points)){
    if(hit.overlap&&(curves[i].flatness()>1e-8||curves[j].flatness()>1e-8)){const same=curves[i].p.every((p,k)=>distance(p,curves[j].p[k])<1e-7),reverse=curves[i].p.every((p,k)=>distance(p,curves[j].p[3-k])<1e-7);if(!same&&!reverse)throw new Error('Partly overlapping nonlinear curves must be normalized before import.');}
    let t=flattened[i].ts[hit.i]+hit.t*(flattened[i].ts[hit.i+1]-flattened[i].ts[hit.i]),s=flattened[j].ts[hit.j]+hit.u*(flattened[j].ts[hit.j+1]-flattened[j].ts[hit.j]);
    for(let it=0;it<20;it++){const diff=sub(curves[i].point(t),curves[j].point(s)),a=curves[i].derivative(t),b=curves[j].derivative(s),det=cross(a,b);if(distance(diff,[0,0])<1e-10||Math.abs(det)<1e-14)break;const dt=-cross(diff,b)/det,ds=-cross(diff,a)/det;t=clamp(t+dt);s=clamp(s+ds);}
    if(distance(curves[i].point(t),curves[j].point(s))<1e-6){cuts[i].push(t);cuts[j].push(s);}
  }
  const unique=new Map();for(let i=0;i<curves.length;i++){const c=curves[i],vals=cuts[i].sort((a,b)=>a-b),merged=[0];for(const t of vals)if(distance(c.point(t),c.point(merged.at(-1)))>1e-5)merged.push(t);if(merged.at(-1)<1)merged[merged.length-1]=1;
    for(let k=1;k<merged.length;k++){if(merged[k]-merged[k-1]<1e-10)continue;const cc=c.subcurve(merged[k-1],merged[k]),keys=[cc.p,cc.p.slice().reverse()].map(ps=>ps.map(p=>keyPoint(p,6)).join(';')),key=keys.sort()[0];if(unique.has(key))unique.delete(key);else unique.set(key,cc);}}
  return [...unique.values()];
}
/** Optional repair for raster-ambiguous checkerboard junctions. All moves logged. */
export function snapJunctions(target,radius){
  if(!radius)return target;if(target.metadata.input!=='raster')throw new Error('Junction snapping applies only to raster input.');
  const lookup=new Map(),nodes=[];for(let e=0;e<target.curves.length;e++)for(const end of[0,1]){const p=target.curves[e].p[end?3:0],key=keyPoint(p,6);if(!lookup.has(key)){lookup.set(key,nodes.length);nodes.push({p,inc:[]});}nodes[lookup.get(key)].inc.push({e,end});}
  const elig=nodes.filter(n=>n.inc.length===2&&Math.min(...n.p)>radius&&Math.max(...n.p)<target.width-radius).filter(n=>{n.out=n.inc.map(({e,end})=>mul(target.curves[e].tangent(end),end?-1:1));return Math.abs(dot(...n.out))<.6;});
  const pairs=[];for(let i=0;i<elig.length;i++)for(let j=i+1;j<elig.length;j++){const d=distance(elig[i].p,elig[j].p);if(d<radius)pairs.push([d,i,j]);}pairs.sort((a,b)=>a[0]-b[0]);const used=new Set(),moves=[];
  for(const [,i,j]of pairs){if(used.has(i)||used.has(j))continue;const a=elig[i],b=elig[j];if(a.inc.some(x=>b.inc.some(y=>x.e===y.e)))continue;const opposite=Math.max(Math.min(-dot(a.out[0],b.out[0]),-dot(a.out[1],b.out[1])),Math.min(-dot(a.out[0],b.out[1]),-dot(a.out[1],b.out[0])));if(opposite<.92)continue;const center=mix(a.p,b.p,.5);for(const n of[a,b]){const delta=sub(center,n.p);for(const {e,end}of n.inc){const p=target.curves[e].p.map(q=>[...q]);for(const k of end?[2,3]:[0,1])p[k]=add(p[k],delta);target.curves[e]=new Cubic(p);}}used.add(i);used.add(j);moves.push({from:[a.p,b.p],to:center});}
  target.metadata.junctionRepairs=moves;return target;
}
