/** Keep useful degree reductions without letting one genuine bend veto them.
 * Changed controls connected by a cubic, shared point or requested symmetry
 * move together. Image deltas come from the XOR of their old/new boundaries;
 * accepted groups update the working mask before the next group is scored.
 * This only proposes geometry. Refinement still renders and validates it.
 */
export function selectStraightProposal(graph,points,proposal,prob,n,{mask,weights=null,ns=32,ties=null,groups=null}={}){
  const changed=Uint8Array.from(points,(v,i)=>Number(v!==proposal[i]));
  if(!changed.some(Boolean))return null;
  const parent=Int32Array.from(points,(_,i)=>i);
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const join=indices=>{
    const active=indices.filter(i=>changed[i]);
    for(let j=1;j<active.length;j++)parent[root(active[j])]=root(active[0]);
  };
  for(const ids of graph.edges)join(ids.flatMap(i=>[2*i,2*i+1]));
  for(const group of [...(groups||[]),...(ties?.groups||[])])join(group.map(m=>typeof m==='number'?m:m[0]));
  for(const ids of ties?.withinCurve||[]){
    // A moving chord changes every within-curve reflection, not only the
    // endpoint pair. Usually straightening leaves these endpoints untouched.
    if([ids[0],ids.at(-1)].some(i=>changed[2*i]||changed[2*i+1]))join(ids.flatMap(i=>[2*i,2*i+1]));
    else for(let i=0;i<ids.length/2;i++){
      const a=ids[i],b=ids[ids.length-1-i];join([2*a,2*a+1,2*b,2*b+1]);
    }
  }
  const components=new Map();
  for(let i=0;i<changed.length;i++)if(changed[i]){
    const id=root(i);if(!components.has(id))components.set(id,{indices:[],segments:[]});
    components.get(id).indices.push(i);
  }
  const owner=ids=>{
    const index=ids.flatMap(i=>[2*i,2*i+1]).find(i=>changed[i]);
    return index===undefined?null:components.get(root(index));
  };
  const old=graph.sample(points,ns).samples,next=graph.sample(proposal,ns).samples,w=graph.width;
  const add=(component,ax,ay,bx,by)=>{
    if(ay>by)[ax,ay,bx,by]=[bx,by,ax,ay];
    if(ay!==by)component.segments.push([ax,ay,bx,by]);
  };
  graph.edges.forEach((ids,e)=>{
    if(!graph.visible[e])return;
    const component=owner(ids);if(!component)return;
    for(const samples of [old,next])for(let j=1;j<=ns;j++){
      const i=2*(e*(ns+1)+j);add(component,samples[i-2],samples[i-1],samples[i],samples[i+1]);
    }
  });
  // Include the same square closures as renderCurves if a projected proposal
  // also moved a path endpoint (e.g. a handle welded to an endpoint).
  graph.paths.forEach((path,pi)=>{
    for(const [entry,start]of [[path[0],true],[path.at(-1),false]]){
      const [e,d]=entry,k=start?(d===1?0:3):(d===1?3:0),id=graph.edges[e][k],component=owner([id]);
      if(!component)continue;
      const f=graph.family[pi],x=start?(f===0?w:0):w,y=start?(f===0?0:w):w;
      for(const values of [points,proposal])add(component,values[2*id],values[2*id+1],x,y);
    }
  });
  const working=mask.slice(),selected=points.slice();let accepted=0;
  // The renderer changes parity only after a crossing, including exact ties
  // with a pixel centre. Correct the arithmetic estimate using that same test.
  const firstAfter=x=>{
    let at=Math.max(0,Math.min(n,Math.floor(x*n/w-.5)+1));
    while(at>0&&(at-.5)*w/n>x)at--;
    while(at<n&&(at+.5)*w/n<=x)at++;
    return at;
  };
  for(const component of components.values()){
    const {segments}=component,touched=[];
    let bottom=Infinity,top=-Infinity;
    for(const s of segments){bottom=Math.min(bottom,s[1]);top=Math.max(top,s[3]);}
    const lo=Math.max(0,Math.floor(bottom*n/w-.5));
    const hi=Math.min(n,Math.ceil(top*n/w+.5));
    let delta=0;
    for(let y=lo;y<hi;y++){
      const yy=(y+.5)*w/n,crossings=[];
      for(const s of segments)if(yy>=s[1]&&yy<s[3])crossings.push(s[0]+(yy-s[1])*(s[2]-s[0])/(s[3]-s[1]));
      crossings.sort((a,b)=>a-b);
      for(let j=0;j+1<crossings.length;j+=2){
        const end=firstAfter(crossings[j+1]);
        for(let x=firstAfter(crossings[j]);x<end;x++){
          const i=y*n+x;touched.push(i);
          delta+=(weights?.[i]??1)*(working[i]===Number(prob[i]>.5)?1:-1);
        }
      }
    }
    if(delta>0)continue;
    for(const i of component.indices)selected[i]=proposal[i];
    for(const i of touched)working[i]^=1;
    accepted++;
  }
  return accepted?{points:selected,mask:working,accepted,groups:components.size}:null;
}
