/** Fit straight spans to raster stairs, then intersect neighbouring lines.
 * RDP selects corners; least squares removes the bias from pinning each span
 * to whichever pixel corner RDP happened to retain. Chain endpoints stay fixed
 * so independently traced chains continue to meet at their original junctions.
 */
import {Cubic,fitPolyline,splitLong,rdp,distance,segmentDistance,cross,sub} from './bezier.js';

function fittedLine(points,tolerance){
  const mean=points.reduce((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length],[0,0]);
  // A long horizontal/vertical run can include one stair from the next edge.
  // Preserve its dominant coordinate instead of tilting it toward that outlier.
  for(const axis of [0,1]){
    const counts=new Map();
    for(const p of points){const k=p[axis].toFixed(7),bin=counts.get(k)||{value:p[axis],count:0};bin.count++;counts.set(k,bin);}
    const mode=[...counts.values()].sort((a,b)=>b.count-a.count)[0];
    if(mode.count>=.8*points.length&&points.every(p=>Math.abs(p[axis]-mode.value)<=tolerance)&&Math.abs(points.at(-1)[1-axis]-points[0][1-axis])>=4*tolerance){
      mean[axis]=mode.value;return{origin:mean,direction:axis===0?[0,1]:[1,0]};
    }
  }
  let xx=0,xy=0,yy=0;
  for(const p of points){const x=p[0]-mean[0],y=p[1]-mean[1];xx+=x*x;xy+=x*y;yy+=y*y;}
  const angle=.5*Math.atan2(2*xy,xx-yy);
  return{origin:mean,direction:[Math.cos(angle),Math.sin(angle)]};
}

export function fitPolygonal(points,tolerance){
  const simple=rdp(points,tolerance);
  if(simple.length<3||tolerance<=0)return simple;
  const indices=[];let at=0;
  for(const p of simple){while(points[at]!==p)at++;indices.push(at);}
  const lines=indices.slice(1).map((hi,i)=>fittedLine(points.slice(indices[i],hi+1),tolerance));
  const fitted=simple.map(p=>[...p]);
  for(let i=1;i<simple.length-1;i++){
    const a=lines[i-1],b=lines[i],den=cross(a.direction,b.direction);
    // Nearly parallel fits have an unstable intersection. Preserve that knot.
    if(Math.abs(den)<.05)continue;
    const t=cross(sub(b.origin,a.origin),b.direction)/den;
    const p=a.origin.map((v,k)=>v+t*a.direction[k]);
    if(distance(p,simple[i])<=tolerance)fitted[i]=p;
  }
  // Bound both the raster-to-line distance and the line-to-raster distance.
  // Fall back per span, preserving neighbouring shared corner coordinates.
  let changed=true;
  while(changed){changed=false;for(let i=1;i<indices.length;i++){
    if(fitted[i-1]===simple[i-1]&&fitted[i]===simple[i])continue;
    const raw=points.slice(indices[i-1],indices[i]+1),a=fitted[i-1],b=fitted[i];
    let good=raw.every(p=>segmentDistance(p,a,b)<=tolerance+1e-9);
    const samples=Math.max(1,Math.ceil(distance(a,b)/(tolerance*.5)));
    for(let j=0;good&&j<=samples;j++){
      const p=a.map((v,k)=>v+(b[k]-v)*j/samples);
      good=raw.some((q,k)=>k>0&&segmentDistance(p,raw[k-1],q)<=tolerance);
    }
    if(!good){fitted[i-1]=simple[i-1];fitted[i]=simple[i];changed=true;}
  }}
  return fitted;
}

/** Several consecutive gentle turns indicate an arc, not isolated corners.
 * Mark local spans that should retain cubic freedom in the boundary fit.
 * Degree-two joins exclude checker-grid intersections from this evidence.
 */
export function arcSegments(curves){
  const curved=new Set();
  const key=p=>p.map(v=>v.toFixed(5)).join(','),ends=new Map(),links=curves.map(()=>[]);
  for(const [i,c] of curves.entries())for(const p of [c.p[0],c.p[3]]){const k=key(p);if(!ends.has(k))ends.set(k,[]);ends.get(k).push(i);}
  for(const [k,ids] of ends)if(ids.length===2){
    const vectors=ids.map(i=>{const p=curves[i].p;return key(p[0])===k?sub(p[3],p[0]):sub(p[0],p[3]);});
    const [a,b]=vectors,angle=Math.atan2(-cross(a,b),-a[0]*b[0]-a[1]*b[1])*180/Math.PI;
    if(Math.abs(angle)>=5&&Math.abs(angle)<=35){links[ids[0]].push({to:ids[1],angle});links[ids[1]].push({to:ids[0],angle:-angle});}
  }
  for(let i=0;i<curves.length;i++)for(const first of links[i]){
    let previous=i,current=first.to,turn=first.angle,count=1;
    const seen=new Set([i,current]);
    for(;;){
      if(count>=3&&Math.abs(turn)>=35)for(const j of seen)curved.add(j);
      const next=links[current].find(e=>e.to!==previous&&Math.sign(e.angle)===Math.sign(turn));
      if(!next||seen.has(next.to))break;
      previous=current;current=next.to;turn+=next.angle;count++;seen.add(current);
    }
  }
  return curved;
}

/** A single boundary may contain both straight spans and smooth arcs. */
export function fitBoundary(points,tolerance,maxSpan=30,cornerDegrees=65,cornerSupport=0){
  if(points.length<2)return[];
  const knots=rdp(points,tolerance),poly=fitPolygonal(points,tolerance),lines=poly.slice(1).map((p,i)=>Cubic.line(poly[i],p)),arcs=arcSegments(lines);
  const indices=[];let at=0;for(const p of knots){while(points[at]!==p)at++;indices.push(at);}
  const result=[];
  for(let i=0;i<lines.length;){
    if(!arcs.has(i)){result.push(...splitLong(lines[i],maxSpan));i++;continue;}
    let end=i+1;while(arcs.has(end))end++;
    const raw=points.slice(indices[i],indices[end]+1);raw[0]=poly[i];raw[raw.length-1]=poly[end];
    result.push(...fitPolyline(raw,tolerance,maxSpan,cornerDegrees,cornerSupport));i=end;
  }
  return result;
}
