/** Local witnesses for the same adaptive-polyline crossings rejected by the
 * final validator. A selected directed chain fixes its geometry, including
 * inexact joins, so changing unrelated slits cannot repair this witness.
 */
import {distance} from './bezier.js';
import {curvesOf} from './graph.js';
import {nearbyPairs,segmentHits,lineSimple} from './geometry.js';

/** A required curve that crosses itself cannot be assigned to either sheet.
 * Require exact joins and both travel directions before making this statement
 * independently of the adjacent path; otherwise leave it to chain validation.
 */
export function visibleSelfIntersectionIssue(graph,cfg){
  for(const [edge,item]of graph.edges.entries())if(item.visible){
    const curve=item.curve;
    if(lineSimple(curve.flatten(cfg.geometryTolerance))||lineSimple(curve.reversed().flatten(cfg.geometryTolerance)))continue;
    const exactJoins=[item.u,item.v].every((vertex,end)=>graph.incident[vertex].every(index=>{
      const neighbor=graph.edges[index],point=neighbor.curve.p[neighbor.u===vertex?0:3],expected=curve.p[end?3:0];
      return point[0]===expected[0]&&point[1]===expected[1];
    }));
    if(exactJoins)return{type:'visible_edge_self_intersection',edge,geometryTolerance:cfg.geometryTolerance,
      message:'A required boundary curve crosses itself in both travel directions. Hidden connectors cannot repair this segmentation.'};
  }
  return null;
}

export function selfIntersectionChains(solution,cfg,issues=null){
  const found=[];
  for(let family=0;family<2;family++)for(let slit=0;slit<solution.paths[family].length;slit++){
    if(issues&&!issues.some(issue=>issue.type==='self_intersection'&&issue.family===family&&issue.slit===slit))continue;
    const path=solution.paths[family][slit],curves=curvesOf(solution,family,slit),segments=[];
    let previous=null;
    curves.forEach((curve,order)=>{
      const points=curve.flatten(cfg.geometryTolerance);
      for(let i=1;i<points.length;i++)segments.push({a:i===1&&previous?previous:points[i-1],b:points[i],order});
      previous=points.at(-1);
    });
    let shortest=null;
    for(const pair of nearbyPairs(segments.map(s=>[s.a,s.b]),1e-9)){
      const [i,j]=pair[0]<pair[1]?pair:[pair[1],pair[0]],a=segments[i],b=segments[j],hits=segmentHits(a.a,a.b,b.a,b.b);
      if(!hits.length||j===i+1&&hits.every(h=>!h.overlap&&distance(h.point,a.b)<1e-7))continue;
      // pathPolyline uses the preceding curve's endpoint at a join. Include
      // that predecessor so the witness cannot depend on an omitted join.
      const first=Math.max(0,a.order-1),last=b.order;
      const directedChain=path.slice(first,last+1).map(([edge,forward])=>[edge,forward]);
      const edgeChain=[...new Set(directedChain.map(([edge])=>edge))];
      if(!shortest||edgeChain.length<shortest.edgeChain.length)shortest={family,slit,edgeChain,directedChain,curves:[first,last],point:hits[0].point};
    }
    if(shortest)found.push(shortest);
  }
  return found;
}
