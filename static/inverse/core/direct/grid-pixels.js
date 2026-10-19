/** Pixel loss and sampled-cut derivatives for the ordered grid initializer.
 * Keep the JavaScript implementation as the reference and fallback. */
import {numericalKernel} from '../numerical-kernel.js';
import {measuredKernel,sameArray} from '../kernel-choice.js';
import {nativeGridPixels} from './native-grid.js';
const same=(a,b)=>!!a&&!!b&&Object.is(a.loss,b.loss)&&sameArray(a.prediction,b.prediction)&&a.ds.every((g,f)=>sameArray(g,b.ds[f]));
const backend=measuredKernel(same,{key:w=>w.key,describe:w=>({resolution:w.n,counts:w.counts.slice(),weighted:w.weighted}),calibrateAcrossCalls:true});
export const gridLossKernelChoices=()=>backend.report();
export function gridPixels(samples,counts,target,n,phase,epsilon,{floor,coarseWeight,weights,mass,native='auto'}){
  const javascript=()=>javascriptGridPixels(samples,counts,target,n,phase,epsilon,{floor,coarseWeight,weights,mass});
  if(!native||!numericalKernel()?.grid_loss)return javascript();
  const accelerated=()=>nativeGridPixels(samples,counts,n,phase,epsilon,floor,target,weights,mass,coarseWeight)||javascript();
  if(native===true)return accelerated();
  const key=[Math.floor(Math.log2(n)),Math.floor(Math.log2(Math.max(1,counts[0]+counts[1]))),Number(!!weights),Number(epsilon<.02)].join(',');
  return backend.run({key,n,counts,weighted:!!weights},javascript,accelerated);
}
function javascriptGridPixels(samples,cutCounts,target,n,phase,epsilon,{floor,coarseWeight,weights,mass}){
  const products=[],derivatives=[],first=[],last=[];
  cutCounts.forEach((count,f)=>{
    const product=new Float64Array(n*n),derivative=new Float64Array(n*n*count),values=new Float64Array(count),prefix=new Float64Array(count+1);
    // Wide surrogates and very small cut counts cannot save enough work to
    // repay interval bookkeeping. Retain their ordinary dense loop.
    const sweep=count*(1-38*epsilon)>=3&&floor>=0&&epsilon>0&&Number.isFinite(epsilon)&&samples[f].every(Number.isFinite);
    const begin=sweep?new Uint32Array(n*n):null,end=sweep?new Uint32Array(n*n):null;
    if(sweep)for(let y=0;y<n;y++){
      let lo=0,hi=0;
      for(let x=0;x<n;x++){
        const index=y*n+x,position=(x+.5)/n;
        // Ordered cuts give one active interval. Outside it the existing
        // surrogate is exactly +/-1 and its derivative exactly zero. Keep
        // the same division/comparisons and multiply active factors in the
        // original order; only saturated factors and zero additions vanish.
        while(lo<count&&(position-samples[f][y*count+lo])/epsilon>19)lo++;
        hi=Math.max(lo,hi);
        while(hi<count&&(position-samples[f][y*count+hi])/epsilon>=-19)hi++;
        begin[index]=lo;end[index]=hi;prefix[lo]=1;
        for(let i=lo;i<hi;i++){const q=(position-samples[f][y*count+i])/epsilon;values[i]=q>19?1:q< -19?-1:Math.tanh(q);prefix[i+1]=prefix[i]*values[i];}
        let suffix=(count-hi)%2?-1:1;product[index]=prefix[hi]*suffix;
        for(let i=hi-1;i>=lo;i--){derivative[index*count+i]=-prefix[i]*suffix*(1-values[i]*values[i])/epsilon;suffix*=values[i];}
      }
    }else for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      prefix[0]=1;const index=y*n+x;
      for(let i=0;i<count;i++){const q=((x+.5)/n-samples[f][y*count+i])/epsilon;values[i]=q>19?1:q< -19?-1:Math.tanh(q);prefix[i+1]=prefix[i]*values[i];}
      product[index]=prefix[count];let suffix=1;
      for(let i=count-1;i>=0;i--){derivative[index*count+i]=-prefix[i]*suffix*(1-values[i]*values[i])/epsilon;suffix*=values[i];}
    }
    products.push(product);derivatives.push(derivative);first.push(begin);last.push(end);
  });
  const prediction=new Float64Array(n*n),dPred=new Float64Array(n*n),pool=8,m=Math.ceil(n/pool),coarse=new Float64Array(m*m),counts=new Uint16Array(m*m),coarseMass=weights?new Float64Array(m*m):null;let loss=0;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=y*n+x,p=(1-phase*products[0][i]*products[1][x*n+y])/2,d=p-target[i],b=Math.floor(y/pool)*m+Math.floor(x/pool);
    prediction[i]=p;counts[b]++;
    if(weights){const w=weights[i];dPred[i]=2*w*d/mass;loss+=w*d*d/mass;coarse[b]+=w*d;coarseMass[b]+=w;}
    else{dPred[i]=2*d/(n*n);loss+=d*d/(n*n);coarse[b]+=d;}
  }
  // Each pooled cell has the mean importance of its constituent pixels.
  // Ignored cells contribute neither to its residual nor its normalization.
  // Mean (rather than total) importance preserves the original equal-block
  // objective even when a partial edge block has fewer than 8×8 pixels.
  let pooledMass=0;
  if(weights)for(let i=0;i<coarse.length;i++)pooledMass+=coarseMass[i]/counts[i];
  for(let i=0;i<coarse.length;i++){
    if(weights){if(!coarseMass[i])continue;coarse[i]/=coarseMass[i];loss+=coarseWeight*(coarseMass[i]/counts[i])*coarse[i]*coarse[i]/pooledMass;}
    else{coarse[i]/=counts[i];loss+=coarseWeight*coarse[i]*coarse[i]/coarse.length;}
  }
  const ds=cutCounts.map(c=>new Float64Array(n*c));
  const [countA,countB]=cutCounts,[da,db]=derivatives,[ga,gb]=ds,[firstA,firstB]=first,[lastA,lastB]=last;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=y*n+x,j=x*n+y,b=Math.floor(y/pool)*m+Math.floor(x/pool),g=dPred[i]+(weights?2*coarseWeight*coarse[b]*weights[i]/(pooledMass*counts[b]):2*coarseWeight*coarse[b]/(coarse.length*counts[b]));
    const a=-phase*.5*g*products[1][j],bb=-phase*.5*g*products[0][i];
    const gaOffset=y*countA,gbOffset=x*countB,daOffset=i*countA,dbOffset=j*countB;
    for(let k=firstA?firstA[i]:0,stop=lastA?lastA[i]:countA;k<stop;k++)ga[gaOffset+k]+=a*da[daOffset+k];
    for(let k=firstB?firstB[j]:0,stop=lastB?lastB[j]:countB;k<stop;k++)gb[gbOffset+k]+=bb*db[dbOffset+k];
  }
  return{loss,ds,prediction};
}
