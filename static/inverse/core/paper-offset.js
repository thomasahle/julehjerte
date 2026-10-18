/** Round polygon offsets of the unfolded paper. This numerical disk-centre
 * model is independent of the fitter's flattening and raster components.
 * It is not a physical strength or exact-area certificate.
 */
const assert={
  ok(value,message='Invalid paper geometry'){if(!value)throw new TypeError(message);},
  equal(a,b,message='Invalid paper geometry'){if(a!==b)throw new TypeError(message);}
};

function segmentDistance(p,a,b){
  const x=b[0]-a[0],y=b[1]-a[1],square=x*x+y*y;
  const t=square?Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/square)):0;
  return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*y);
}

function flatten(p,tolerance,depth=0){
  if(Math.max(segmentDistance(p[1],p[0],p[3]),segmentDistance(p[2],p[0],p[3]))<=tolerance)return [p[0],p[3]];
  assert.ok(depth<24,'Cubic subdivision exceeded its depth bound');
  const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const a=mid(p[0],p[1]),b=mid(p[1],p[2]),c=mid(p[2],p[3]),d=mid(a,b),e=mid(b,c),f=mid(d,e);
  return [...flatten([p[0],a,d,f],tolerance,depth+1).slice(0,-1),...flatten([f,e,c,p[3]],tolerance,depth+1)];
}

export function exportedPaperPaths(data,family,tolerance=.0005){
  assert.ok([0,1].includes(family));
  assert.ok(Number.isFinite(tolerance)&&tolerance>0&&tolerance<=.1);
  assert.equal(data.schema,'heartcurves-2');assert.equal(data.units,'mm');
  return data[family?'B_overlap_paths':'A_overlap_paths'].map(refs=>{
    assert.ok(refs.length>0,'Empty slit');
    let line=[];
    for(const ref of refs){
      let p=data.curves[ref.curve]?.control_points;
      assert.ok(p?.length===4&&p.every(q=>q.length===2&&q.every(Number.isFinite)),'Invalid cubic');
      assert.equal(typeof ref.reverse,'boolean');
      if(ref.reverse)p=p.toReversed();
      const points=flatten(p,tolerance);
      if(line.length){
        assert.ok(Math.hypot(...line.at(-1).map((v,i)=>v-points[0][i]))<1e-8,'Disconnected exported slit');
        line.push(...points.slice(1));
      }else line=points;
    }
    // Return owned points even for cubics that were already straight.
    return line.map(([x,y])=>family?[y,x]:[x,y]);
  });
}

function intervals(rings,y){
  const xs=[];
  for(const ring of rings)for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
  }
  xs.sort((a,b)=>a-b);assert.equal(xs.length%2,0);
  return Array.from({length:xs.length/2},(_,i)=>[xs[2*i],xs[2*i+1]]);
}

export function createOffsetPaperAudit(C){

  function pathList(lines){
    const out=new C.PathsD();
    try{
      for(const line of lines){
        const p=new C.PathD();
        try{
          // The pinned USINGZ build stores x,y,z triples. Zero z is unused.
          const coordinates=new Float64Array(line.length*3);
          for(let i=0;i<line.length;i++){coordinates[3*i]=line[i][0];coordinates[3*i+1]=line[i][1];}
          p.assign(coordinates);out.push_back(p);
        }finally{p.delete();}
      }
      return out;
    }catch(error){out.delete();throw error;}
  }

  function polygon(node){
    // polygon() returns a value copy. child() below is borrowed from its tree:
    // never delete a child separately from the owning tree.
    const p=node.polygon();
    try{
      const area=Math.abs(C.AreaPathD(p)),view=p.view(),points=[];
      for(let i=0;i<view.length;i+=3)points.push([view[i],view[i+1]]);
      return {area,points};
    }finally{p.delete();}
  }

  return function offsetPaperAudit(lines,width,radius,minArea,{arcTolerance=.0005,includePolygons=false}={}){
    assert.ok(Number.isFinite(width)&&width>0&&Number.isFinite(radius)&&radius>0&&radius<width/2);
    assert.ok(Number.isFinite(minArea)&&minArea>=0);
    assert.ok(Number.isFinite(arcTolerance)&&arcTolerance>0&&arcTolerance<=.1);
    assert.ok(lines.every(line=>line.length>=2&&line.every(p=>p.length===2&&p.every(Number.isFinite))));
    const unfolded=lines.map(p=>[...p,...p.slice(0,-1).toReversed().map(([x,y])=>[x,2*width-y])]);
    let input,axis,body,cuts,tree;
    try{
      input=pathList(unfolded);axis=pathList([[[width/2,0],[width/2,2*width]]]);
      body=C.InflatePathsD(axis,width/2-radius,C.JoinType.Round,C.EndType.Round,2,6,arcTolerance);
      cuts=C.InflatePathsD(input,radius,C.JoinType.Round,C.EndType.Round,2,6,arcTolerance);
      tree=new C.PolyPathD();C.BooleanOpOutD(C.ClipType.Difference,C.FillRule.NonZero,body,cuts,tree,6);
      const parts=[];
      function visit(node){
        if(!node.isHole()){
          const outer=polygon(node),rings=[outer.points];let area=outer.area;
          for(let i=0;i<node.count();i++){
            const hole=node.child(i);assert.ok(hole.isHole());
            const inner=polygon(hole);rings.push(inner.points);area-=inner.area;
          }
          // Descendant islands belong to their own components. The immediate
          // hole's full area is subtracted here, including those islands.
          const bounds=[Infinity,Infinity,-Infinity,-Infinity];
          for(const [x,y]of outer.points){bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);}
          const anchored=bounds[1]<-1.1*radius||bounds[3]>2*width+1.1*radius;
          parts.push({area,bounds,anchored,significant:area>=minArea,fold:anchored?intervals(rings,width):[],...(includePolygons?{rings}:{})});
        }
        for(let i=0;i<node.count();i++)visit(node.child(i));
      }
      for(let i=0;i<tree.count();i++)visit(tree.child(i));
      const ends=[0,width,...lines.map(p=>p.at(-1)[0])].sort((a,b)=>a-b);
      const foldIntervals=ends.slice(1).map((b,i)=>({interval:[ends[i],b],anchoredCoreLength:parts.filter(p=>p.anchored).flatMap(p=>p.fold)
        .reduce((sum,[c,d])=>sum+Math.max(0,Math.min(b,d)-Math.max(ends[i],c)),0)}));
      const floating=parts.filter(p=>!p.anchored&&p.significant);
      return {passed:!floating.length&&foldIntervals.every(f=>f.anchoredCoreLength>1e-8),coreArea:parts.reduce((s,p)=>s+p.area,0),parts,
        significantFloatingCount:floating.length,significantFloatingArea:floating.reduce((s,p)=>s+p.area,0),foldIntervals};
    }finally{tree?.delete();cuts?.delete();body?.delete();axis?.delete();input?.delete();}
  };
}
