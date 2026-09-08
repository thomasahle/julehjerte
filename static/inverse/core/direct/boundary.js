/** Boundary-motion derivative of the continuous joint-parity area loss.
 * This is not a derivative of discrete scanline membership decisions. It
 * therefore retains normal forces on exactly horizontal cuts. Shared curves
 * cancel before integration, rather than blending antialiased sheet masks.
 */
import {bernstein,dbernstein,bilinear} from './math.js';
import {polygonIndex} from './curves.js';
import {nativeBoundaryGradient} from './native.js';

const quadratureTables=new Map();
export function boundaryGradient(graph,points,prob,n,phase,{nquad=64,maskSamples=24,native=true}={}){
  const index=polygonIndex(graph,points,maskSamples),gradient=new Float64Array(points.length),w=graph.width;
  if(!quadratureTables.has(nquad))quadratureTables.set(nquad,{B:Array.from({length:nquad},(_,j)=>bernstein((j+.5)/nquad)),D:Array.from({length:nquad},(_,j)=>dbernstein((j+.5)/nquad))});
  const {B,D}=quadratureTables.get(nquad);
  if(native){const result=nativeBoundaryGradient(graph,points,prob,n,phase,index,quadratureTables.get(nquad));if(result)return result;}
  graph.edges.forEach((ids,e)=>{
    if(!graph.visible[e])return;const[pi,f,direction]=graph.occurrences[e][0];
    for(let j=0;j<nquad;j++){
      let x=0,y=0,vx=0,vy=0;
      for(let k=0;k<4;k++){x+=B[j][k]*points[2*ids[k]];y+=B[j][k]*points[2*ids[k]+1];vx+=D[j][k]*points[2*ids[k]];vy+=D[j][k]*points[2*ids[k]+1];}
      const other=index.contains(x,y,pi,phase),coefficient=(2*other-1)*direction*(f===0?1:-1);
      const cost=1-2*bilinear(prob,n,x*n/w-.5,y*n/w-.5),scale=cost*coefficient/(nquad*w*w);
      for(let k=0;k<4;k++){gradient[2*ids[k]]+=scale*vy*B[j][k];gradient[2*ids[k]+1]-=scale*vx*B[j][k];}
    }
  });return gradient;
}

/** Scalar area objective from independent row intersections and image CDFs.
 * Orthogonal averaging reduces row quadrature bias but is not used as the
 * backward derivative. The cubic controls are never chosen from target edges.
 */
export function boundaryValue(graph,points,prob,n,phase,{rows=192,ns=24,transpose=false}={}){
  const index=polygonIndex(graph,points,ns),w=graph.width,segments=transpose?index.segments.map(s=>[s[1],s[0],s[3],s[2]]):index.segments;
  let total=0,constant=0;for(const p of prob)constant+=p*p/prob.length;
  const cost=new Float64Array(n+2),cdf=new Float64Array(n+2),xs=Float64Array.from({length:n+2},(_,i)=>i===0?0:i===n+1?w:(i-.5)*w/n);
  for(let row=0;row<rows;row++){
    const y=(row+.5)*w/rows,crossings=[];
    for(const s of segments)if((s[1]>y)!==(s[3]>y))crossings.push(s[0]+(y-s[1])*(s[2]-s[0])/(s[3]-s[1]));
    crossings.sort((a,b)=>a-b);
    for(let i=1;i<=n;i++)cost[i]=1-2*(transpose?bilinear(prob,n,y*n/w-.5,i-1):bilinear(prob,n,i-1,y*n/w-.5));
    cost[0]=cost[1];cost[n+1]=cost[n];cdf[0]=0;
    for(let i=1;i<cdf.length;i++)cdf[i]=cdf[i-1]+(cost[i-1]+cost[i])*.5*(xs[i]-xs[i-1]);
    const integral=x=>{x=Math.max(0,Math.min(w,x));const j=Math.max(0,Math.min(n,Math.floor(x*n/w+.5))),dx=x-xs[j];return cdf[j]+cost[j]*dx+.5*(cost[j+1]-cost[j])*dx*dx/(xs[j+1]-xs[j]);};
    let area=0;for(let j=0;j<crossings.length;j++)area+=(j%2?1:-1)*integral(crossings[j]);
    total+=(phase===-1?cdf[n+1]-area:area)/(w*rows);
  }return constant+total;
}
