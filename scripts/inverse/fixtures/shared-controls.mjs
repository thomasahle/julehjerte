/** Deliberately couple equal control coordinates for projection regressions.
 * Production graphs no longer infer this constraint from coordinates alone.
 * Call only on a fresh graph, before compiling any sampler or symmetry cache.
 */
export function weldEqualFixturePoints(graph){
  const keys=new Map(),mapping=[],points=[],fixed=[];
  for(let i=0;i<graph.points.length;i+=2){
    const key=[graph.points[i],graph.points[i+1]].map(v=>Math.round(v*1e7)).join(',');
    if(!keys.has(key)){keys.set(key,points.length/2);points.push(graph.points[i],graph.points[i+1]);fixed.push(0,0);}
    const id=keys.get(key);mapping.push(id);fixed[2*id]|=graph.fixed[i];fixed[2*id+1]|=graph.fixed[i+1];
  }
  graph.edges=graph.edges.map(ids=>ids.map(i=>mapping[i]));
  graph.points=Float64Array.from(points);graph.fixed=Uint8Array.from(fixed);
  return graph;
}
