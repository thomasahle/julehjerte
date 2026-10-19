/** Shared-run connectivity, including geometric branches with independent IDs.
 * Used by simplification and coordinated junction moves. No coordinates change.
 */
export function sharedRunTopology(graph,points=graph.points,{deadline=Infinity}={}){
  const controls=graph.controls(points),adj=new Map(),pinned=new Set(),joins=new Map();
  // Independent paths may meet at a geometric branch without sharing an
  // optimization variable. Such a branch must still stop run simplification.
  const vertices=new Map(),vertex=new Map();
  for(const ids of graph.edges)for(const id of [ids[0],ids[3]]){
    const key=[points[2*id],points[2*id+1]].map(v=>Math.round(v*1e7)).join(',');
    if(!vertices.has(key))vertices.set(key,id);vertex.set(id,vertices.get(key));
  }
  const endpoint=(entry,start)=>vertex.get(graph.edges[entry[0]][start?(entry[1]===1?0:3):(entry[1]===1?3:0)]);
  const put=(v,e)=>{if(!adj.has(v))adj.set(v,new Set());adj.get(v).add(e);};
  graph.edges.forEach((ids,e)=>{put(vertex.get(ids[0]),e);put(vertex.get(ids[3]),e);});
  for(const path of graph.paths){pinned.add(endpoint(path[0],true));pinned.add(endpoint(path.at(-1),false));}
  for(const [a,b]of graph.joins){const v=endpoint(a,false);if(v!==endpoint(b,true)||a[0]===b[0])continue;joins.set(v,(joins.get(v)||0)+1);}
  const links=Array.from(graph.edges,()=>[]),signatures=graph.occurrences.map(o=>o.map(([pi])=>pi).sort((a,b)=>a-b).join(','));
  for(const [v,set]of adj){
    if(set.size!==2||pinned.has(v))continue;
    const [a,b]=set;if(graph.visible[a]||graph.visible[b]||signatures[a]!==signatures[b]||joins.get(v)!==graph.occurrences[a].length)continue;
    links[a].push(b);links[b].push(a);
  }
  const groups=new Int32Array(controls.length).fill(-1),runs=[];
  for(let i=0;i<controls.length;i++){
    if(performance.now()>=deadline)return null;
    if(groups[i]!==-1)continue;
    const component=[],stack=[i],id=runs.length;groups[i]=id;
    while(stack.length){const e=stack.pop();component.push(e);for(const next of links[e])if(groups[next]===-1){groups[next]=id;stack.push(next);}}
    const ends=[];
    for(const e of component)for(const v of [vertex.get(graph.edges[e][0]),vertex.get(graph.edges[e][3])])if(!links[e].some(other=>vertex.get(graph.edges[other][0])===v||vertex.get(graph.edges[other][3])===v))ends.push(v);
    let path=null;
    if(ends.length===2){
      let v=ends[0],previous=-1;path=[];
      for(let count=0;count<component.length;count++){
        const e=[...adj.get(v)].find(e=>groups[e]===id&&e!==previous);if(e===undefined)return null;
        const forward=vertex.get(graph.edges[e][0])===v;path.push(forward?controls[e]:controls[e].toReversed());
        previous=e;v=vertex.get(graph.edges[e][forward?3:0]);
      }
    }
    runs.push({edges:component,ends,path});
  }
  return{runs,groups,endpoint,vertex,adjacency:adj};
}
