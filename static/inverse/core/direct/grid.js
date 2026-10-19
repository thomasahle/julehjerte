/** Port of calibrated_direct_fit.py: positive-gap B-splines and analytic
 * gradients of the annealed joint parity surrogate. No target contours.
 */
import {Adam,basisTable,splineBasis,splineKnots,randomNormal,resize} from './math.js';
import {imageWeights,resizeObjective} from './image-objective.js';
import {numericalKernel,nativeGridMask} from '../numerical-kernel.js';
import {measuredKernel,sameArray} from '../kernel-choice.js';
import {gridPixels} from './grid-pixels.js';

export function gridModel(counts,k=16,seed=0,initial=null){
  const normal=randomNormal(seed),offsets=[0,k*(counts[0]+1)],size=offsets[1]+k*(counts[1]+1);
  if(initial&&initial.length!==size)throw new Error(`Grid initialization has ${initial.length} parameters; ${k} controls and ${counts.join('+')} cuts require ${size}.`);
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
export function gridLoss(model,target,n,phase,epsilon,{floor=.008,coarseWeight=.4,smooth=true,clearance=0,weights=null,native='auto'}={}){
  const importance=imageWeights(weights,n*n);weights=importance?.values;
  phase*= (model.counts[0]+model.counts[1])%2?-1:1;
  const basis=basisTable(n,model.k),controls=gridControls(model,floor),samples=gridSamples(controls,model,basis,n);
  let {loss,ds,prediction}=gridPixels(samples,model.counts,target,n,phase,epsilon,{floor,coarseWeight,weights,mass:importance?.mass,native});
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
/** Positive-gap grids keep their sampled cuts ordered. Sweep each row once
 * instead of testing every cut at every pixel. Keep the strict comparison at
 * pixel centres: rounding a cut to a pixel index changes boundary ties.
 */
export function gridParity(samples,count,n,transpose=false){
  const parity=new Uint8Array(n*n);
  for(let y=0;y<n;y++){
    let cut=0;
    for(let x=0;x<n;x++){
      const position=(x+.5)/n;
      while(cut<count&&position>samples[y*count+cut])cut++;
      parity[transpose?x*n+y:y*n+x]=cut&1;
    }
  }
  return parity;
}
const maskKernel=measuredKernel(sameArray,{repetitions:8,minimumBatchMilliseconds:1,quickDecision:true});
export const gridMaskKernelChoices=()=>maskKernel.report();
export function gridMask(model,n,phase,floor=.008,{native='auto'}={}){
  const samples=gridSamples(gridControls(model,floor),model,basisTable(n,model.k),n);
  const javascript=()=>{
    const mask=gridParity(samples[0],model.counts[0],n),other=gridParity(samples[1],model.counts[1],n,true),bit=Number(phase===-1);
    for(let i=0;i<mask.length;i++)mask[i]^=other[i]^bit;
    return mask;
  };
  if(!native||!numericalKernel()?.grid_mask)return javascript();
  const accelerated=()=>nativeGridMask(samples,model.counts,n,phase)||javascript();
  return native===true?accelerated():maskKernel.run(n,javascript,accelerated);
}
export function mismatch(mask,prob,weights=null){
  const importance=imageWeights(weights,mask.length);
  if(!importance)return mask.reduce((s,v,i)=>s+Number(v!==Number(prob[i]>.5)),0)/mask.length;
  return mask.reduce((s,v,i)=>s+weights[i]*Number(v!==Number(prob[i]>.5)),0)/importance.mass;
}
export function gridPaths(model,width=100,floor=.008){
  const controls=gridControls(model,floor),breaks=[...new Set(splineKnots(model.k))];
  // Every cut uses the same spline intervals. Evaluate their bases once per
  // conversion; keep each cut's dot products and arithmetic order unchanged.
  const spans=breaks.slice(1).map((hi,j)=>{
    const lo=breaks[j];return{lo,hi,b0:splineBasis(lo,model.k),b1:splineBasis(hi,model.k),d0:splineBasis(lo,model.k,true),d1:splineBasis(hi,model.k,true),ys:[lo,lo+(hi-lo)/3,hi-(hi-lo)/3,hi]};
  });
  return model.counts.map((count,f)=>Array.from({length:count},(_,i)=>spans.map(({lo,hi,b0,b1,d0,d1,ys})=>{
    const dot=b=>b.reduce((s,v,k)=>s+v*controls[f].c[k*count+i],0),a=dot(b0),b=dot(b1),xs=[a,a+dot(d0)*(hi-lo)/3,b-dot(d1)*(hi-lo)/3,b];
    return xs.map((x,k)=>(f?[ys[k],x]:[x,ys[k]]).map(v=>v*width));
  })));
}
export function fitGrid(prob,size,counts,phase,{steps=280,k=16,initial=null,seed=0,floor=.008,clearance=0,resolution=96,optimizationTarget=null,optimizationObjective=null,weights=null,deadline=Infinity,onProgress=()=>{},preferCheckpoint=null,maximumCheckpointPriority=null}={}){
  if(optimizationTarget&&optimizationObjective)throw new Error('Supply only one grid optimization objective.');
  if(optimizationObjective){
    if(optimizationObjective.probability?.length!==resolution*resolution)throw new Error('Optimization objective must match the grid resolution.');
    if(imageWeights(weights,prob.length)&&optimizationObjective.weights==null)throw new Error('Weighted grid objectives must include their resampled weights.');
    imageWeights(optimizationObjective.weights,resolution*resolution);
  }
  if(optimizationTarget&&optimizationTarget.length!==resolution*resolution)throw new Error('Optimization target must match the grid resolution.');
  if(optimizationTarget&&imageWeights(weights,prob.length))throw new Error('Weighted grids must resample their target and weights together.');
  // A jointly resampled native objective avoids changing the image pyramid
  // merely because a small portion of the source is unobserved.
  const resized=optimizationObjective||(weights?resizeObjective(prob,size,resolution,weights):null),target=optimizationTarget||resized?.probability||resize(prob,size,resolution),model=gridModel(counts,k,seed,initial),adam=new Adam(model.z.length,initial ? .015 : .04);
  // A caller may supply a boolean preference or an ordered finite priority.
  // Keep the lowest image error within the highest attained class; gradients
  // and deadlines do not change. Final curves still require independent checks.
  const deferred=maximumCheckpointPriority!==null;
  if(deferred&&(!preferCheckpoint||!Number.isFinite(maximumCheckpointPriority)))throw new Error('Deferred grid selection requires a preference and a finite priority bound.');
  const preferred=(candidate=model)=>{
    const value=preferCheckpoint?preferCheckpoint({model:candidate,phase,floor}):true;
    if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Grid checkpoint priority must be finite.');
    if(deferred&&Number(value)>maximumCheckpointPriority)throw new Error('Grid checkpoint priority exceeds its declared bound.');
    return Number(value);
  };
  let best={z:model.z.slice(),error:mismatch(gridMask(model,size,phase,floor),prob,weights),step:-1,preferred:deferred?0:preferred()},completed=0;
  const checkpoints=deferred?[best]:null;
  for(let step=0;step<steps;step++){
    if(step%10===0&&performance.now()>deadline)break;
    const progress=step/Math.max(1,steps-1),epsilon=initial?.length?(.012*(1-progress)**2+.003):(.035*(1-progress)**2+.004);
    const value=gridLoss(model,target,resolution,phase,epsilon,{floor,clearance,weights:resized?.weights});adam.update(model.z,value.gradient,3);completed++;
    if(step%30===0||step===steps-1){
      const error=mismatch(gridMask(model,size,phase,floor),prob,weights);
      if(deferred)checkpoints.push({z:model.z.slice(),error,step});
      else{const retained=preferred();if(retained>best.preferred||retained===best.preferred&&error<best.error)best={z:model.z.slice(),error,step,preferred:retained};}
      onProgress({step,error,loss:value.loss});
    }
  }
  if(deferred){
    // Check the most accurate saved iterate first. Once it earns the highest
    // possible class, no later (higher-error) iterate can displace it. This
    // is the same lexicographic selection as eager checks on a full trajectory,
    // but repeated geometry audits no longer interrupt the gradient allowance.
    best=null;
    for(const checkpoint of checkpoints.sort((a,b)=>a.error-b.error||a.step-b.step)){
      checkpoint.preferred=preferred({...model,z:checkpoint.z});
      if(!best||checkpoint.preferred>best.preferred)best=checkpoint;
      if(checkpoint.preferred===maximumCheckpointPriority)break;
    }
  }
  model.z=best.z;return{model,phase,floor,error:best.error,steps:completed};
}
