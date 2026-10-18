/** Cubics include straight spans as a lower-dimensional geometry proposal.
 * The same proposal and image/geometry checks apply to every input.
 */
import {segmentDistance,realRoots01} from '../bezier.js';

export function primitiveComplexity(graph,points){
  let curved=0;
  for(const ids of graph.edges){
    const p=ids.map(i=>[points[2*i],points[2*i+1]]);
    if(p.slice(1,3).some(h=>segmentDistance(h,p[0],p[3])>1e-7))curved++;
  }
  return{curved,straight:graph.edges.length-curved};
}

// Handles bound a curve's deviation but can overestimate it substantially,
// especially for opposite-sign handles. Find the extrema of its signed cubic
// distance to the endpoint chord. Reject longitudinal overshoot conservatively:
// a small perpendicular distance alone must not erase a return or collapsed cut.
function curveDeviation(p){
  const dx=p[3][0]-p[0][0],dy=p[3][1]-p[0][1],length=Math.hypot(dx,dy);
  if(length<1e-10)return Infinity;
  const handles=p.slice(1,3),along=handles.map(h=>((h[0]-p[0][0])*dx+(h[1]-p[0][1])*dy)/length);
  if(along.some(v=>v<0||v>length))return Infinity;
  const [a,b]=handles.map(h=>((h[0]-p[0][0])*dy-(h[1]-p[0][1])*dx)/length);
  return Math.max(0,...realRoots01([a,2*(b-2*a),3*(a-b)]).map(t=>Math.abs(3*(1-t)*t*((1-t)*a+t*b))));
}

export function straightProposal(graph,points,resolution,{measureCurve=false}={}){
  const proposed=points.slice(),tolerance=graph.width/Math.max(128,resolution);
  let changed=false;
  for(const ids of graph.edges){
    const p=ids.map(i=>[points[2*i],points[2*i+1]]);
    const error=measureCurve?curveDeviation(p):Math.max(...p.slice(1,3).map(h=>segmentDistance(h,p[0],p[3])));
    if(error<=1e-7||error>tolerance)continue;
    for(let k=1;k<=2;k++)for(let axis=0;axis<2;axis++)if(!graph.fixed[2*ids[k]+axis])proposed[2*ids[k]+axis]=(1-k/3)*p[0][axis]+k/3*p[3][axis];
    changed=true;
  }
  return changed?proposed:null;
}

export function primitiveCost(graph,points,resolution){
  // Two pixels of evidence per curved span pays for its extra handle freedom.
  // Genuine arcs can earn that freedom through their image-error reduction.
  return primitiveComplexity(graph,points).curved*2/Math.max(256,resolution)**2;
}
