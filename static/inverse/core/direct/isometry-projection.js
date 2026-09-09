/** Least-squares projection of 2D points linked by rigid affine maps.
 * Each relation is p[a] = map.L * p[b] + map.t. A spanning forest writes every
 * point in terms of one 2D root; cycles and fixed coordinates constrain only
 * that root. Thus each component needs at most two independent equations,
 * rather than a dense solve over all Bézier coordinates.
 */
export function isometryProjector(size,relations){
  const adjacency=Array.from({length:size},()=>[]);
  relations.forEach((r,i)=>{adjacency[r.a].push([r.b,i,true]);adjacency[r.b].push([r.a,i,false]);});
  const seen=new Uint8Array(size),tree=new Set(),components=[];
  for(let root=0;root<size;root++){
    if(seen[root])continue;
    seen[root]=1;const members=[root],steps=[];
    for(let k=0;k<members.length;k++)for(const[child,edge,inverse]of adjacency[members[k]]){
      if(seen[child])continue;
      seen[child]=1;members.push(child);tree.add(edge);steps.push({parent:members[k],child,edge,inverse});
    }
    components.push({members,steps,cycles:[]});
  }
  const owner=new Int32Array(size);components.forEach((c,i)=>c.members.forEach(p=>owner[p]=i));
  relations.forEach((r,i)=>{if(!tree.has(i))components[owner[r.a]].cycles.push(i);});
  const poses=new Float64Array(6*size),output=new Float64Array(2*size);
  return{relations,components,poses,output};
}

export function projectIsometries(compiled,values,{fixed=null,original=values,tangent=false}={}){
  const {relations,components,poses:p,output}=compiled;
  const offset=(map,axis)=>tangent?0:map.t[axis];
  for(const{members,steps,cycles}of components){
    const root=6*members[0];p.set([1,0,0,1,0,0],root);
    for(const{parent,child,edge,inverse}of steps){
      const {map}=relations[edge],L=map.L,s=6*parent,d=6*child;
      const a=L[0],b=inverse?L[2]:L[1],c=inverse?L[1]:L[2],e=L[3];
      const tx=offset(map,0),ty=offset(map,1),x=inverse?-a*tx-b*ty:tx,y=inverse?-c*tx-e*ty:ty;
      p[d]=a*p[s]+b*p[s+2];p[d+1]=a*p[s+1]+b*p[s+3];
      p[d+2]=c*p[s]+e*p[s+2];p[d+3]=c*p[s+1]+e*p[s+3];
      p[d+4]=a*p[s+4]+b*p[s+5]+x;p[d+5]=c*p[s+4]+e*p[s+5]+y;
    }
    // Orthonormal rows of the root's affine constraints. Dependent rows must
    // agree too; inconsistent maps fail without modifying any input point.
    const rows=[];
    const constrain=(x,y,value)=>{
      for(const[a,b,v]of rows){const dot=x*a+y*b;x-=dot*a;y-=dot*b;value-=dot*v;}
      const norm=Math.hypot(x,y);
      if(norm<1e-10)return Math.abs(value)<1e-7;
      if(rows.length===2)return false;
      rows.push([x/norm,y/norm,value/norm]);return true;
    };
    for(const edge of cycles){
      const r=relations[edge],a=6*r.a,b=6*r.b,L=r.map.L;
      for(let axis=0;axis<2;axis++){
        const u=L[2*axis],v=L[2*axis+1],k=2*axis;
        if(!constrain(p[a+k]-u*p[b]-v*p[b+2],p[a+k+1]-u*p[b+1]-v*p[b+3],u*p[b+4]+v*p[b+5]+offset(r.map,axis)-p[a+4+axis]))return false;
      }
    }
    let x=0,y=0;
    for(const id of members){
      const i=6*id,u=values[2*id]-p[i+4],v=values[2*id+1]-p[i+5];
      x+=p[i]*u+p[i+2]*v;y+=p[i+1]*u+p[i+3]*v;
      if(fixed)for(let axis=0;axis<2;axis++)if(fixed[2*id+axis]){
        if(!constrain(p[i+2*axis],p[i+2*axis+1],(tangent?0:original[2*id+axis])-p[i+4+axis]))return false;
      }
    }
    x/=members.length;y/=members.length;
    for(const[a,b,v]of rows){const correction=v-a*x-b*y;x+=a*correction;y+=b*correction;}
    for(const id of members){const i=6*id;output[2*id]=p[i]*x+p[i+1]*y+p[i+4];output[2*id+1]=p[i+2]*x+p[i+3]*y+p[i+5];}
  }
  // Preserve fixed coordinates bit-for-bit; the equations above already
  // checked their compatibility with all other constraints.
  if(fixed)for(let i=0;i<values.length;i++)if(fixed[i])output[i]=tangent?0:original[i];
  values.set(output);return true;
}
