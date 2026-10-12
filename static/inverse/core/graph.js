import {Cubic,unit,sub,add,mul,dot,norm,distance} from './bezier.js';
import {nodeCurves,keyPoint,bbox,boxDistance,lineSimple,improperIntersection,lineDistance} from './geometry.js';
import {curveKey,transposedKey} from './symmetry.js';
import {guidePortals,guidePairs} from './portals.js';
export function reindex(graph){const points=[],lookup=new Map();function vertex(p){const key=keyPoint(p,5);if(!lookup.has(key)){lookup.set(key,points.length);points.push([...p]);}return lookup.get(key);}for(const e of graph.edges){e.u=vertex(e.curve.p[0]);e.v=vertex(e.curve.p[3]);}graph.points=points;graph.incident=points.map(()=>[]);graph.edges.forEach((e,i)=>{graph.incident[e.u].push(i);graph.incident[e.v].push(i);});return graph;}
/** Visible edges locally incident to each vertex, independent of tiny boundary
 * subdivisions. Reach a neighbouring vertex only through a short visible arc;
 * spatial proximity or an optional hidden connector is not adjacency.
 * Control-polygon lengths bound arc length from above, so a curved detour cannot
 * turn into a shortcut. Full intersection and final paper checks still apply.
 */
export function visibleEndpointNeighborhoods(graph,radius){
  const lengths=graph.edges.map(e=>e.visible?e.curve.p.slice(1).reduce((sum,p,i)=>sum+distance(e.curve.p[i],p),0):Infinity);
  return graph.points.map((_,start)=>{
    const near=new Set(),costs=new Map([[start,0]]),queue=[start];
    for(let head=0;head<queue.length;head++){
      const v=queue[head],cost=costs.get(v);
      for(const index of graph.incident[v]){
        const edge=graph.edges[index];if(!edge.visible)continue;
        near.add(index);
        const next=edge.u===v?edge.v:edge.u,proposed=cost+lengths[index];
        if(proposed<=radius&&proposed<(costs.get(next)??Infinity)){
          costs.set(next,proposed);queue.push(next);
        }
      }
    }
    return near;
  });
}
/** A curve whose control hull fits one vertex cell has no resolvable graph
 * extent. A real closed curve needs distinct intermediate vertices instead.
 * Subdivide recursively because its midpoint can also return to its start.
 */
export function graphCurveParts(curve,stats=null,depth=0){
  const key=keyPoint(curve.p[0]);
  if(keyPoint(curve.p[3])!==key)return[curve];
  if(curve.p.every(p=>keyPoint(p)===key)){
    if(stats)stats.collapsedSegments++;
    return[];
  }
  if(depth>=24)throw new Error('Closed boundary cannot be resolved at graph vertex precision.');
  if(stats)stats.closedSplits++;
  return curve.split().flatMap(part=>graphCurveParts(part,stats,depth+1));
}
export function buildGraph(target,cfg,{onProgress=()=>{},node=true}={}){
  const start=performance.now(),noded=node?nodeCurves(target.curves,cfg.geometryTolerance):target.curves,portals=cfg.gridPortals?guidePortals(noded,target.width,cfg.geometryTolerance):{curves:noded,guides:[],added:0},curves=portals.curves,edges=[];
  const vertexNormalization={collapsedSegments:0,closedSplits:0,maximumEndpointMoveMm:0};
  for(const curve of curves)for(const part of graphCurveParts(curve,vertexNormalization))edges.push({curve:part,visible:true});
  if(edges.length>700)throw new Error('Too many boundary segments for this browser preset. Increase tracing tolerance or simplify the artwork.');
  const graph=reindex({target,edges}),{points,incident}=graph,w=target.width,tol=cfg.geometryTolerance;
  for(const e of edges){const p=e.curve.p.map(q=>[...q]),d0=sub(points[e.u],p[0]),d1=sub(points[e.v],p[3]);vertexNormalization.maximumEndpointMoveMm=Math.max(vertexNormalization.maximumEndpointMoveMm,norm(d0),norm(d1));p[0]=points[e.u];p[1]=add(p[1],d0);p[2]=add(p[2],d1);p[3]=points[e.v];e.curve=new Cubic(p);}
  target.curves=edges.map(e=>e.curve);const visibleCount=edges.length,lines=edges.map(e=>e.curve.flatten(tol)),boxes=lines.map(bbox),eligible=points.map((p,i)=>i).filter(v=>incident[v].length===2&&Math.min(...points[v])>1e-6&&Math.max(...points[v])<w-1e-6),pairs=guidePairs(points,eligible,portals.guides,tol),visiblePairs=new Set(edges.map(e=>[Math.min(e.u,e.v),Math.max(e.u,e.v)].join(',')));
  // Existing visible edges cannot also be optional connectors. Remove their
  // endpoints before taking the budget, or harmless boundary subdivisions can
  // consume every slot and exclude a necessary connection to another contour.
  for(const u of eligible){const adjacent=new Set(incident[u].map(i=>edges[i].u===u?edges[i].v:edges[i].u));const near=eligible.filter(v=>v!==u&&!adjacent.has(v)).map(v=>({v,d:distance(points[u],points[v])})).sort((a,b)=>a.d-b.d).slice(0,cfg.neighbors);for(const {v}of near)pairs.add([Math.min(u,v),Math.max(u,v)].join(','));}
  if(cfg.gridPortals){const corners=eligible.map(v=>{const outs=incident[v].slice(0,2).map(e=>edges[e].u===v?edges[e].curve.tangent(0):mul(edges[e].curve.tangent(1),-1));return{v,bisector:add(outs[0],outs[1])};}).filter(c=>norm(c.bisector)>.3);for(const a of corners){const candidates=corners.filter(b=>b.v!==a.v).map(b=>{const d=unit(sub(points[b.v],points[a.v])),alignment=Math.min(Math.abs(dot(d,unit(a.bisector))),Math.abs(dot(d,unit(b.bisector))));return{v:b.v,alignment,distance:distance(points[a.v],points[b.v])};}).filter(b=>b.alignment>=Math.cos(20*Math.PI/180)).sort((a,b)=>b.alignment-a.alignment||a.distance-b.distance).slice(0,2);for(const b of candidates)pairs.add([Math.min(a.v,b.v),Math.max(a.v,b.v)].join(','));}}
  const preferred=(v,toward)=>{const outs=incident[v].slice(0,2).map(i=>{const e=edges[i];return e.u===v?e.curve.tangent(0):mul(e.curve.tangent(1),-1);});let b=mul(add(outs[0],outs[1]),-1);if(norm(b)<.1)b=[-outs[0][1],outs[0][0]];b=unit(b);return dot(b,toward)<0?mul(b,-1):b;};
  const endpointEdges=visibleEndpointNeighborhoods(graph,2*tol);
  const clear=(c,u,v)=>{const g=c.flatten(tol),box=bbox(g);if(g.some(p=>Math.min(...p)<-1e-8||Math.max(...p)>w+1e-8)||!lineSimple(g))return false;for(let i=0;i<visibleCount;i++){if(boxDistance(box,boxes[i])>2*tol)continue;if(improperIntersection(g,lines[i],[points[u],points[v]],2*tol))return false;if(!endpointEdges[u].has(i)&&!endpointEdges[v].has(i)&&lineDistance(g,lines[i],2*tol)<=2*tol)return false;}return true;};
  let checked=0;for(const pair of [...pairs].sort()){if(visiblePairs.has(pair))continue;const[u,v]=pair.split(',').map(Number),a=points[u],b=points[v],d=distance(a,b);if(d<5*tol)continue;const variants=[Cubic.line(a,b)];if(cfg.connectorVariants>1){const ta=preferred(u,unit(sub(b,a))),tb=preferred(v,unit(sub(a,b)));for(const f of cfg.connectorVariants===2?[.24]:[.15,.32])variants.push(new Cubic([a,add(a,mul(ta,f*d)),add(b,mul(tb,f*d)),b]));}for(const c of variants)if(clear(c,u,v)){const i=edges.length;edges.push({u,v,curve:c,visible:false});incident[u].push(i);incident[v].push(i);}if(++checked%100===0)onProgress({stage:'connectors',checked,total:pairs.size});if(edges.length>2200)throw new Error('Candidate graph too large. Reduce connection neighbours or image detail.');}
  if(target.metadata.identicalSheets){const keys=new Set(edges.map(e=>curveKey(e.curve.p)));for(const e of [...edges]){const p=transposedKey(e.curve),key=curveKey(p);if(!keys.has(key)){if(e.visible)throw new Error('Identical-sheet boundary subdivision is inconsistent.');edges.push({curve:new Cubic(p),visible:false});keys.add(key);}}reindex(graph);const lookup=new Map(edges.map((e,i)=>[curveKey(e.curve.p),i]));graph.transpose=edges.map(e=>lookup.get(curveKey(transposedKey(e.curve))));}
  graph.guides=portals.guides;
  graph.metadata={visibleEdges:visibleCount,hiddenCandidates:edges.length-visibleCount,vertices:points.length,buildSeconds:(performance.now()-start)/1000,guidePortals:portals.added,guideCount:portals.guides.length,guideSkip:portals.skipped||null,vertexNormalization,candidateMethod:'border-inferred guide portals, nearest unconnected portal neighbours and tangent-shaped cubic variants; adaptive noding',delaunayCandidates:false};return graph;
}
/** Necessary boundary conditions, independent of optional hidden connectors.
 * Counts and spacing can reject a seed; passing them does not prove routability.
 */
export function inspectBoundaryEndpoints(graph, minimumWidth = 0) {
  const endpoints=[],w=graph.target.width;
  for(const k of[0,1]){
    const axis=k===0?1:0,sortaxis=1-axis,sources=[],sinks=[];
    graph.points.forEach((p,v)=>{
      if(graph.incident[v].filter(e=>graph.edges[e].visible).length%2){
        if(Math.abs(p[axis])<1e-5)sources.push(v);
        if(Math.abs(p[axis]-w)<1e-5)sinks.push(v);
      }
    });
    sources.sort((a,b)=>graph.points[a][sortaxis]-graph.points[b][sortaxis]);
    sinks.sort((a,b)=>graph.points[a][sortaxis]-graph.points[b][sortaxis]);
    endpoints.push({sources,sinks});
  }
  for(const [family,{sources,sinks}]of endpoints.entries())if(sources.length!==sinks.length){
    return{endpoints,issue:{type:'endpoint_count',family,startCount:sources.length,endCount:sinks.length,
      message:`Sheet ${family?'B':'A'} has ${sources.length} start transitions but ${sinks.length} end transitions. Opposite borders must agree.`}};
  }
  for(const [family,ends]of endpoints.entries())for(const side of ['sources','sinks']){
    if(!ends[side].length)continue;
    const positions=[0,...ends[side].map(v=>graph.points[v][family]),w];
    for(let i=1;i<positions.length;i++){
      const distance=positions[i]-positions[i-1];
      if(distance<minimumWidth-1e-6)return{endpoints,issue:{type:'endpoint_spacing',family,side:side==='sources'?'start':'end',
        positionsMm:positions.slice(i-1,i+1),distanceMm:distance,requiredMm:minimumWidth,
        outerMargin:i===1||i===positions.length-1,
        message:`Border transitions are closer than the required strip width. Sheet ${family?'B':'A'} ${side==='sources'?'start':'end'} border has ${distance.toFixed(3)} mm between transitions or the paper edge; ${minimumWidth.toFixed(3)} mm is required.`}};
    }
  }
  return{endpoints,issue:null};
}
export function boundaryEndpoints(graph){
  const {endpoints,issue}=inspectBoundaryEndpoints(graph);
  if(issue){const error=new Error(issue.message);error.boundaryIssue=issue;throw error;}
  return endpoints;
}
export function curvesOf(solution,k,p){return solution.paths[k][p].map(([e,forward])=>forward?solution.graph.edges[e].curve:solution.graph.edges[e].curve.reversed());}
export function solutionJSON(solution){const ids=[...new Set(solution.paths.flat(2).map(([e])=>e))].sort((a,b)=>a-b);return{schema:'heartcurves-2',units:'mm',square_width_mm:solution.graph.target.width,phase:solution.graph.target.phase,paper_colors:solution.graph.target.metadata.paperColors||['#bd1111','#ffffff'],curves:Object.fromEntries(ids.map(e=>[String(e),{control_points:solution.graph.edges[e].curve.p,visible_boundary:solution.graph.edges[e].visible}])),A_overlap_paths:solution.paths[0].map(p=>p.map(([e,f])=>({curve:String(e),reverse:!f}))),B_overlap_paths:solution.paths[1].map(p=>p.map(([e,f])=>({curve:String(e),reverse:!f}))),note:'Shared cuts are one control polygon referenced by both sheets; no physical assembly certificate.'};}
export function loadSolutionJSON(data){if(typeof data==='string')data=JSON.parse(data);if(data.schema!=='heartcurves-2'||data.units!=='mm')throw new Error('Unsupported saved-template schema.');const width=data.square_width_mm;if(!Number.isFinite(width)||width<20||width>300||![0,1].includes(data.phase))throw new Error('Invalid saved dimensions or colour phase.');const entries=Object.entries(data.curves||{});if(entries.length>4000)throw new Error('Saved template has too many curves.');const ids=new Map(),edges=entries.map(([id,x],i)=>{ids.set(id,i);if(typeof x.visible_boundary!=='boolean')throw new Error('Invalid boundary flag.');const c=new Cubic(x.control_points);if(c.p.some(p=>Math.min(...p)<-width||Math.max(...p)>2*width))throw new Error('Saved controls exceed the allowed bounds.');return{curve:c,visible:x.visible_boundary};});const paths=[data.A_overlap_paths,data.B_overlap_paths].map(f=>{if(!Array.isArray(f)||f.length>50)throw new Error('Invalid saved slit families.');return f.map(p=>{if(!Array.isArray(p)||p.length>4000)throw new Error('Invalid saved slit.');return p.map(item=>{if(!ids.has(item.curve)||typeof item.reverse!=='boolean')throw new Error('Unknown curve reference.');return[ids.get(item.curve),!item.reverse];});});});const target={width,phase:data.phase,curves:edges.filter(e=>e.visible).map(e=>e.curve),metadata:{input:'saved template pair',paperColors:data.paper_colors||['#bd1111','#ffffff']}},graph=reindex({target,edges,metadata:{imported:true}});return{graph,paths,report:{imported:true}};}
