/** Frozen full-segment scan from 4379b66. This scalar-loss oracle must not use
 * row bins; it checks the index optimization separately from the gradient.
 */
import {bilinear} from '../../../static/inverse/core/direct/math.js';
import {polygonIndex} from '../../../static/inverse/core/direct/curves.js';
import {boundaryObjective} from '../../../static/inverse/core/direct/image-objective.js';

export function referenceBoundaryEvaluator(graph,prob,n,{rows=192,ns=24,transpose=false,weights=null}={}){
  const objective=boundaryObjective(prob,weights);prob=objective.target;
  const w=graph.width,stride=n+2,costs=new Float64Array(rows*stride),cdfs=new Float64Array(rows*stride);
  let constant=0;for(const p of prob)constant+=p*p/prob.length;
  const xs=Float64Array.from({length:stride},(_,i)=>i===0?0:i===n+1?w:(i-.5)*w/n);
  for(let row=0;row<rows;row++){
    const y=(row+.5)*w/rows,offset=row*stride,cost=costs.subarray(offset,offset+stride),cdf=cdfs.subarray(offset,offset+stride);
    for(let i=1;i<=n;i++)cost[i]=1-2*(transpose?bilinear(prob,n,y*n/w-.5,i-1):bilinear(prob,n,i-1,y*n/w-.5));
    cost[0]=cost[1];cost[n+1]=cost[n];cdf[0]=0;
    for(let i=1;i<cdf.length;i++)cdf[i]=cdf[i-1]+(cost[i-1]+cost[i])*.5*(xs[i]-xs[i-1]);
  }
  return(points,phase)=>{
    const index=polygonIndex(graph,points,ns),segments=transpose?index.segments.map(s=>[s[1],s[0],s[3],s[2]]):index.segments;
    let total=0;
    for(let row=0;row<rows;row++){
      const y=(row+.5)*w/rows,crossings=[],start=row*stride;
      for(const s of segments)if((s[1]>y)!==(s[3]>y))crossings.push(s[0]+(y-s[1])*(s[2]-s[0])/(s[3]-s[1]));
      crossings.sort((a,b)=>a-b);
      const integral=x=>{x=Math.max(0,Math.min(w,x));const j=Math.max(0,Math.min(n,Math.floor(x*n/w+.5))),dx=x-xs[j],i=start+j;return cdfs[i]+costs[i]*dx+.5*(costs[i+1]-costs[i])*dx*dx/(xs[j+1]-xs[j]);};
      let area=0;for(let j=0;j<crossings.length;j++)area+=(j%2?1:-1)*integral(crossings[j]);
      total+=(phase===-1?cdfs[start+n+1]-area:area)/(w*rows);
    }return constant+total+objective.offset;
  };
}
