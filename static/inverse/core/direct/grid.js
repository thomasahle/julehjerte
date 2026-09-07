/** Port of calibrated_direct_fit.py: positive-gap B-splines and analytic
 * gradients of the annealed joint parity surrogate. No target contours.
 */
import {Adam,basisTable,splineBasis,splineKnots,randomNormal,resize} from './math.js';

export function gridModel(counts,k=16,seed=0,initial=null){
  const normal=randomNormal(seed),offsets=[0,k*(counts[0]+1)],size=offsets[1]+k*(counts[1]+1);
  return{counts:[...counts],k,offsets,z:initial?Float64Array.from(initial):Float64Array.from({length:size},()=>normal()*.06)};
}
export function gridControls(model,floor=.008){
  return model.counts.map((count,f)=>{
    const c=new Float64Array(model.k*count),soft=new Float64Array(model.k*(count+1)),range=1-(count+1)*floor;
    if(range<=0)throw new Error('Too many strips for the requested width.');
    for(let j=0;j<model.k;j++){
      const off=model.offsets[f]+j*(count+1);let max=-Infinity,sum=0;
      for(let i=0;i<=count;i++)max=Math.max(max,model.z[off+i]);
      for(let i=0;i<=count;i++){const value=Math.exp(model.z[off+i]-max);soft[j*(count+1)+i]=value;sum+=value;}
      let cumulative=0;for(let i=0;i<=count;i++){soft[j*(count+1)+i]/=sum;cumulative+=floor+range*soft[j*(count+1)+i];if(i<count)c[j*count+i]=cumulative;}
    }return{c,soft,range};
  });
}
export function gridSamples(controls,model,basis,n){
  return model.counts.map((count,f)=>{const a=new Float64Array(n*count);for(let y=0;y<n;y++)for(let j=0;j<model.k;j++){const b=basis[y*model.k+j];if(!b)continue;for(let i=0;i<count;i++)a[y*count+i]+=b*controls[f].c[j*count+i];}return a;});
}
function controlGradient(model,controls,dc){
  const grad=new Float64Array(model.z.length);
  model.counts.forEach((count,f)=>{for(let j=0;j<model.k;j++){
    const suffix=new Float64Array(count+1);let sum=0;
    for(let i=count-1;i>=0;i--){sum+=dc[f][j*count+i];suffix[i]=sum;}
    let mean=0;for(let i=0;i<=count;i++)mean+=suffix[i]*controls[f].soft[j*(count+1)+i];
    for(let i=0;i<=count;i++)grad[model.offsets[f]+j*(count+1)+i]=controls[f].range*controls[f].soft[j*(count+1)+i]*(suffix[i]-mean);
  }});return grad;
}
function addSmoothness(model,controls,dc){
  let loss=0;
  model.counts.forEach((count,f)=>{
    const c=controls[f].c,g=dc[f],slopeWeight=.015/(2*(model.k-1)*count),bendWeight=.04/(2*(model.k-2)*count);
    for(let j=1;j<model.k;j++)for(let i=0;i<count;i++){const a=j*count+i,b=a-count,d=c[a]-c[b];loss+=slopeWeight*d*d;g[a]+=2*slopeWeight*d;g[b]-=2*slopeWeight*d;}
    for(let j=2;j<model.k;j++)for(let i=0;i<count;i++){const a=j*count+i,b=a-count,d=a-2*count,v=c[a]-2*c[b]+c[d];loss+=bendWeight*v*v;g[a]+=2*bendWeight*v;g[b]-=4*bendWeight*v;g[d]+=2*bendWeight*v;}
  });return loss;
}
/** Ordered initializer gradients. Exclusion products handle zero tanh factors
 * without division, including exactly aligned grid boundaries.
 */
export function gridLoss(model,target,n,phase,epsilon,{floor=.008,coarseWeight=.4,smooth=true,clearance=0}={}){
  phase*= (model.counts[0]+model.counts[1])%2?-1:1;
  const basis=basisTable(n,model.k),controls=gridControls(model,floor),samples=gridSamples(controls,model,basis,n),products=[],derivatives=[];
  model.counts.forEach((count,f)=>{
    const product=new Float64Array(n*n),derivative=new Float64Array(n*n*count),values=new Float64Array(count),prefix=new Float64Array(count+1);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      prefix[0]=1;const index=y*n+x;
      for(let i=0;i<count;i++){values[i]=Math.tanh(((x+.5)/n-samples[f][y*count+i])/epsilon);prefix[i+1]=prefix[i]*values[i];}
      product[index]=prefix[count];let suffix=1;
      for(let i=count-1;i>=0;i--){derivative[index*count+i]=-prefix[i]*suffix*(1-values[i]*values[i])/epsilon;suffix*=values[i];}
    }products.push(product);derivatives.push(derivative);
  });
  const prediction=new Float64Array(n*n),dPred=new Float64Array(n*n),pool=8,m=Math.ceil(n/pool),coarse=new Float64Array(m*m),counts=new Uint16Array(m*m);let loss=0;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=y*n+x,p=(1-phase*products[0][i]*products[1][x*n+y])/2,d=p-target[i],b=Math.floor(y/pool)*m+Math.floor(x/pool);
    prediction[i]=p;dPred[i]=2*d/(n*n);loss+=d*d/(n*n);coarse[b]+=d;counts[b]++;
  }
  for(let i=0;i<coarse.length;i++){coarse[i]/=counts[i];loss+=coarseWeight*coarse[i]*coarse[i]/coarse.length;}
  const ds=model.counts.map(c=>new Float64Array(n*c));
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=y*n+x,j=x*n+y,b=Math.floor(y/pool)*m+Math.floor(x/pool),g=dPred[i]+2*coarseWeight*coarse[b]/(coarse.length*counts[b]);
    const a=-phase*.5*g*products[1][j],bb=-phase*.5*g*products[0][i];
    for(let k=0;k<model.counts[0];k++)ds[0][y*model.counts[0]+k]+=a*derivatives[0][i*model.counts[0]+k];
    for(let k=0;k<model.counts[1];k++)ds[1][x*model.counts[1]+k]+=bb*derivatives[1][j*model.counts[1]+k];
  }
  const dc=model.counts.map((count,f)=>{
    const g=new Float64Array(model.k*count);for(let y=0;y<n;y++)for(let j=0;j<model.k;j++){const b=basis[y*model.k+j];if(b)for(let i=0;i<count;i++)g[j*count+i]+=b*ds[f][y*count+i];}return g;
  });
  if(smooth)loss+=addSmoothness(model,controls,dc);
  if(clearance)loss+=gridClearance(model,controls,dc,clearance);
  return{loss,gradient:controlGradient(model,controls,dc),prediction};
}

/** Bidirectional point-to-segment separation for ordered paths. Since the
 * independent coordinate is fixed, only segments within the clearance band
 * can be close. This bounds work without dropping potential close segments.
 */
export function gridClearance(model,controls,dc,margin,n=161,weight=30){
  const basis=new Float64Array(n*model.k);for(let j=0;j<n;j++)basis.set(splineBasis(j/(n-1),model.k),j*model.k);
  const samples=gridSamples(controls,model,basis,n),window=Math.ceil(margin*(n-1))+1;let loss=0;
  model.counts.forEach((count,f)=>{
    if(count<2)return;
    const ds=new Float64Array(n*count),scale=weight/(2*n*(count-1)),a=samples[f];
    for(let path=0;path<count-1;path++)for(const direction of[0,1])for(let j=0;j<n;j++){
      const from=path+direction,to=path+1-direction,px=a[j*count+from],py=j/(n-1);let best=Infinity,at=0,tbest=0,dxbest=0;
      for(let k=Math.max(0,j-window);k<Math.min(n-1,j+window);k++){
        const ux=a[k*count+to],uy=k/(n-1),vx=a[(k+1)*count+to]-ux,vy=1/(n-1),t=Math.max(0,Math.min(1,((px-ux)*vx+(py-uy)*vy)/(vx*vx+vy*vy))),dx=px-ux-t*vx,dy=py-uy-t*vy,d=dx*dx+dy*dy;
        if(d<best){best=d;at=k;tbest=t;dxbest=dx;}
      }
      const dist=Math.sqrt(best+1e-12);if(dist>=margin)continue;
      loss+=scale*((margin-dist)/margin)**2;
      const g=2*scale*(dist-margin)/(margin*margin)*dxbest/dist;
      ds[j*count+from]+=g;ds[at*count+to]-=(1-tbest)*g;ds[(at+1)*count+to]-=tbest*g;
    }
    for(let j=0;j<n;j++)for(let k=0;k<model.k;k++){const b=basis[j*model.k+k];if(b)for(let i=0;i<count;i++)dc[f][k*count+i]+=b*ds[j*count+i];}
  });return loss;
}
export function gridMask(model,n,phase,floor=.008){
  const samples=gridSamples(gridControls(model,floor),model,basisTable(n,model.k),n),mask=new Uint8Array(n*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    let v=Number(phase===-1);for(let j=0;j<model.counts[0];j++)v^=Number((x+.5)/n>samples[0][y*model.counts[0]+j]);for(let j=0;j<model.counts[1];j++)v^=Number((y+.5)/n>samples[1][x*model.counts[1]+j]);mask[y*n+x]=v;
  }return mask;
}
export const mismatch=(mask,prob)=>mask.reduce((s,v,i)=>s+Number(v!==Number(prob[i]>.5)),0)/mask.length;
export function gridPaths(model,width=100,floor=.008){
  const controls=gridControls(model,floor),breaks=[...new Set(splineKnots(model.k))];
  return model.counts.map((count,f)=>Array.from({length:count},(_,i)=>breaks.slice(1).map((hi,j)=>{
    const lo=breaks[j],b0=splineBasis(lo,model.k),b1=splineBasis(hi,model.k),d0=splineBasis(lo,model.k,true),d1=splineBasis(hi,model.k,true),dot=b=>b.reduce((s,v,k)=>s+v*controls[f].c[k*count+i],0),a=dot(b0),b=dot(b1),xs=[a,a+dot(d0)*(hi-lo)/3,b-dot(d1)*(hi-lo)/3,b],ys=[lo,lo+(hi-lo)/3,hi-(hi-lo)/3,hi];
    return xs.map((x,k)=>(f?[ys[k],x]:[x,ys[k]]).map(v=>v*width));
  })));
}
export function fitGrid(prob,size,counts,phase,{steps=280,k=16,initial=null,seed=0,floor=.008,clearance=0,resolution=96,deadline=Infinity,onProgress=()=>{}}={}){
  const target=resize(prob,size,resolution),model=gridModel(counts,k,seed,initial),adam=new Adam(model.z.length,initial ? .015 : .04);
  let best={z:model.z.slice(),error:mismatch(gridMask(model,size,phase,floor),prob),step:-1},completed=0;
  for(let step=0;step<steps;step++){
    if(step%10===0&&performance.now()>deadline)break;
    const progress=step/Math.max(1,steps-1),epsilon=initial?.length?(.012*(1-progress)**2+.003):(.035*(1-progress)**2+.004);
    const value=gridLoss(model,target,resolution,phase,epsilon,{floor,clearance});adam.update(model.z,value.gradient,3);completed++;
    if(step%30===0||step===steps-1){const error=mismatch(gridMask(model,size,phase,floor),prob);if(error<best.error)best={z:model.z.slice(),error,step};onProgress({step,error,loss:value.loss});}
  }
  model.z=best.z;return{model,phase,floor,error:best.error,steps:completed};
}
