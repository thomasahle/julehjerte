/** Parameter identities come from connected path anchors and whole shared
 * cubics, not unrelated points which happen to have equal coordinates.
 * Retain the established 1e-7 mm keys for joining and sharing geometry.
 */
export function curveTopology(paths){
  const raw=[],keys=[],parent=[],shared=new Map();
  const point=p=>{const i=raw.length;raw.push(p);keys.push(p.map(v=>Math.round(v*1e7)).join(','));parent.push(i);return i;};
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const join=(a,b)=>{a=root(a);b=root(b);if(a!==b)parent[Math.max(a,b)]=Math.min(a,b);};
  const indices=paths.map(family=>family.map(path=>{
    let previous=null;
    const curves=path.map(c=>{
      const ids=c.map(point);
      if(previous!==null&&keys[previous]===keys[ids[0]])join(previous,ids[0]);
      previous=ids[3];
      const forward=ids.map(i=>keys[i]).join('|'),backward=ids.toReversed().map(i=>keys[i]).join('|');
      const canonical=forward<=backward?ids:ids.toReversed(),key=forward<=backward?forward:backward,other=shared.get(key);
      if(other)canonical.forEach((id,k)=>join(id,other[k]));else shared.set(key,canonical);
      return ids;
    });
    if(curves.length&&keys[previous]===keys[curves[0][0]])join(previous,curves[0][0]);
    return curves;
  }));
  const points=[],number=new Map(),compact=raw.map((p,i)=>{
    const id=root(i);
    if(!number.has(id)){number.set(id,points.length/2);points.push(...raw[id]);}
    return number.get(id);
  });
  return{points,indices:indices.map(f=>f.map(p=>p.map(c=>c.map(i=>compact[i]))))};
}
