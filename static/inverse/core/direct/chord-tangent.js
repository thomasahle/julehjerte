/** Tangent projection for endpoint-dependent chord symmetries.
 * A reflected point depends on its partner AND the two chord endpoints.
 * Sparse Jacobian rows describe those relations, together with square ties.
 * Projection solves A A^T lambda = A g and returns g - A^T lambda.
 */
export function chordTangentProjector(size,lists,square=[]){
  const relations=[],seen=new Set();
  const row=ids=>{
    const columns=[...new Set(ids.flatMap(id=>[2*id,2*id+1]))].sort((a,b)=>a-b);
    return{columns:Int32Array.from(columns),coefficients:new Float64Array(columns.length),slots:ids.flatMap(id=>[columns.indexOf(2*id),columns.indexOf(2*id+1)])};
  };
  lists.forEach((ids,path)=>{
    const first=ids[0],last=ids.at(-1);
    for(let k=0;k<ids.length/2;k++){
      let a=ids[k],b=ids[ids.length-1-k];
      // Reflecting the endpoints through their own chord is an identity, not
      // a constraint on their motion. Repeated endpoint handles are too.
      if((a===first&&b===last)||(a===last&&b===first))continue;
      if(a>b)[a,b]=[b,a];
      const key=[path,a,b].join(',');if(seen.has(key))continue;seen.add(key);
      relations.push({a,b,path,rows:[row([a,b,first,last]),row([a,b,first,last])]});
    }
  });
  for(const r of square)relations.push({...r,rows:[row([r.a,r.b]),row([r.a,r.b])]});
  const rows=relations.flatMap(r=>r.rows),m=rows.length,n=2*size;
  return{lists,relations,rows,frames:lists.map(()=>({})),output:new Float64Array(n),temporary:new Float64Array(n),rhs:new Float64Array(m),residual:new Float64Array(m),direction:new Float64Array(m),product:new Float64Array(m),lambda:new Float64Array(m),stats:null};
}

function buildJacobian(compiled,points,mode,fixed){
  const {frames,lists,relations}=compiled;
  for(let i=0;i<lists.length;i++){
    const first=lists[i][0],last=lists[i].at(-1),x0=points[2*first],y0=points[2*first+1],x1=points[2*last],y1=points[2*last+1];
    const length=Math.hypot(x1-x0,y1-y0);
    if(mode==='sym'&&length<1e-9)return false;
    Object.assign(frames[i],{mx:(x0+x1)/2,my:(y0+y1)/2,ux:(x1-x0)/length,uy:(y1-y0)/length,length});
  }
  for(const r of relations){
    let L,D0,D1;
    if(r.path===undefined)L=r.map.L;
    else if(mode==='anti'){L=[-1,0,0,-1];D0=D1=[1,0,0,1];}
    else{
      const {mx,my,ux,uy,length}=frames[r.path],xx=ux*ux,xy=ux*uy,yy=uy*uy;
      L=[1-2*xx,-2*xy,-2*xy,1-2*yy];
      const qx=points[2*r.b]-mx,qy=points[2*r.b+1]-my,along=ux*qx+uy*qy,vx=qx-along*ux,vy=qy-along*uy,k=-2/length;
      // dL (q-m) = K (dEndpoint1-dEndpoint0), while
      // (I-L) dm = uu^T (dEndpoint0+dEndpoint1).
      const K=[k*(along*(1-xx)+ux*vx),k*(-along*xy+ux*vy),k*(-along*xy+uy*vx),k*(along*(1-yy)+uy*vy)],C=[xx,xy,xy,yy];
      D0=C.map((v,i)=>v-K[i]);D1=C.map((v,i)=>v+K[i]);
    }
    for(let axis=0;axis<2;axis++){
      const {columns,coefficients:c,slots}=r.rows[axis];c.fill(0);
      c[slots[axis]]+=1;
      for(let j=0;j<2;j++){
        c[slots[2+j]]-=L[2*axis+j];
        if(D0){c[slots[4+j]]-=D0[2*axis+j];c[slots[6+j]]-=D1[2*axis+j];}
      }
      let norm=0;
      for(let j=0;j<c.length;j++){if(fixed?.[columns[j]])c[j]=0;norm+=c[j]*c[j];}
      norm=Math.sqrt(norm);
      for(let j=0;j<c.length;j++)c[j]=norm<1e-10?0:c[j]/norm;
    }
  }
  return true;
}

const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
function multiply(rows,x,out){
  for(let i=0;i<rows.length;i++){
    const {columns,coefficients}=rows[i];let sum=0;
    for(let j=0;j<columns.length;j++)sum+=coefficients[j]*x[columns[j]];
    out[i]=sum;
  }
}
function transposeMultiply(rows,x,out){
  out.fill(0);
  for(let i=0;i<rows.length;i++){
    const {columns,coefficients}=rows[i];
    for(let j=0;j<columns.length;j++)out[columns[j]]+=coefficients[j]*x[i];
  }
}

/** Atomic on failure. Fixed coordinates are zero in a tangent vector. */
export function projectChordTangent(compiled,values,points,mode,{fixed=null}={}){
  if(!values.every(Number.isFinite)||!points.every(Number.isFinite)||!buildJacobian(compiled,points,mode,fixed)){
    compiled.stats={iterations:0,passed:false,reason:'invalid_chord_or_gradient'};return false;
  }
  const {rows,output,temporary,rhs,residual:r,direction:d,product:q,lambda}=compiled;
  output.set(values);if(fixed)for(let i=0;i<output.length;i++)if(fixed[i])output[i]=0;
  const tolerance=2e-13*Math.max(1,Math.sqrt(dot(output,output))),limit=Math.min(2048,3*values.length);
  let iterations=0,error=Infinity;
  // Recompute the true residual between solves; recursive CG residuals can
  // become optimistic for redundant constraint rows.
  for(let restart=0;restart<3;restart++){
    multiply(rows,output,rhs);error=Math.sqrt(dot(rhs,rhs));
    if(error<=tolerance){compiled.stats={iterations,error,tolerance,passed:true};values.set(output);return true;}
    r.set(rhs);d.set(r);lambda.fill(0);let rr=dot(r,r);
    for(let step=0;step<limit&&rr>tolerance*tolerance;step++){
      transposeMultiply(rows,d,temporary);multiply(rows,temporary,q);
      const denominator=dot(d,q);if(!(denominator>0)||!Number.isFinite(denominator))break;
      const alpha=rr/denominator;
      for(let i=0;i<r.length;i++){lambda[i]+=alpha*d[i];r[i]-=alpha*q[i];}
      const next=dot(r,r),beta=next/rr;
      for(let i=0;i<d.length;i++)d[i]=r[i]+beta*d[i];
      rr=next;iterations++;
    }
    transposeMultiply(rows,lambda,temporary);
    for(let i=0;i<output.length;i++)output[i]-=temporary[i];
  }
  multiply(rows,output,rhs);error=Math.sqrt(dot(rhs,rhs));
  compiled.stats={iterations,error,tolerance,passed:error<=tolerance};
  if(error>tolerance||!Number.isFinite(error))return false;
  values.set(output);return true;
}
