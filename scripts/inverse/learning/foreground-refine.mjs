/** Offline RGB refinement seeded only by a frozen foreground prediction.
 * The RGB distance is empirical, not a calibrated camera likelihood. A bounded
 * correction cannot replace a very confident prior with color evidence alone.
 */
import {close,signedDistance} from '../../../static/inverse/locator/fields.js';
import {quantile,sigmoid} from '../../../static/inverse/locator/math.js';
import {colorDifferenceMetric} from '../../../static/inverse/locator/background.js';

function colorModel(samples){
  const median=[0,1,2].map(k=>quantile(samples.map(p=>p[k]),.5));
  const distances=samples.map(p=>Math.hypot(...p.map((v,k)=>v-median[k]))),radius=quantile(distances,.85),core=samples.filter((_,i)=>distances[i]<=radius);
  const center=[0,1,2].map(k=>core.reduce((sum,p)=>sum+p[k],0)/core.length);
  const covariance=Array.from({length:3},(_,j)=>[0,1,2].map(k=>core.reduce((sum,p)=>sum+(p[j]-center[j])*(p[k]-center[k]),0)/core.length+(j===k?.015**2:0)));
  const metric=colorDifferenceMetric(covariance);
  return{center,covariance,distance:p=>metric(p.map((v,k)=>v-center[k]))};
}

export function refineForegroundRGB(fields){
  const f=fields,{w,h}=f,n=w*h,pools=[[],[],[]];
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||['paper','chroma','r','g','b'].some(k=>f[k]?.length!==n||!f[k].every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw new Error('Expected finite RGB and foreground fields.');
  for(let i=0;i<n;i+=3){
    const p=[f.r[i],f.g[i],f.b[i]];
    if(f.paper[i]>.95){if(f.chroma[i]>.9)pools[0].push(p);if(f.chroma[i]<.1)pools[1].push(p);}
    if(f.paper[i]<.05)pools[2].push(p);
  }
  if(pools.some(p=>p.length<50))return{...f,refinement:{method:'neural-seeded-rgb',applied:false,reason:'Insufficient confident examples of both papers and background',counts:pools.map(p=>p.length)}};
  const models=pools.map(colorModel),delta=models[0].center.map((v,k)=>v-models[1].center[k]);
  const covariance=models[0].covariance.map((row,j)=>row.map((v,k)=>(v+models[1].covariance[j][k])/2)),metric=colorDifferenceMetric(covariance),denominator=metric(delta)**2;
  if(!Number.isFinite(denominator)||denominator<1e-8)return{...f,refinement:{method:'neural-seeded-rgb',applied:false,reason:'Indistinguishable paper colors'}};
  const paper=new Float32Array(n),red=new Float32Array(n),white=new Float32Array(n);
  let changedPixels=0;
  for(let i=0;i<n;i++){
    const p=[f.r[i],f.g[i],f.b[i]],v=p.map((v,k)=>v-models[1].center[k]);
    const t=Math.max(0,Math.min(1,(metric(v)**2+denominator-metric(v.map((x,k)=>x-delta[k]))**2)/(2*denominator)));
    const mixed=metric(v.map((x,k)=>x-t*delta[k])),distances=models.map(m=>m.distance(p));
    const margin=Math.max(-3,Math.min(3,(distances[2]-Math.min(distances[0],distances[1],mixed))/2));
    const prior=Math.max(.0001,Math.min(.9999,f.paper[i]));
    paper[i]=sigmoid(Math.log(prior/(1-prior))+margin);
    red[i]=paper[i]*f.chroma[i];white[i]=paper[i]*(1-f.chroma[i]);
    changedPixels+=Number((paper[i]>.5)!==(f.paper[i]>.5));
  }
  return{...f,paper,red,white,mask:close(paper,w,h,2),pd:signedDistance(close(paper,w,h,1),w,h),rd:signedDistance(close(red,w,h,1),w,h),wd:signedDistance(close(white,w,h,1),w,h),
    refinement:{method:'neural-seeded-rgb',applied:true,changedPixels,counts:pools.map(p=>p.length),models:models.map(({center,covariance})=>({center,covariance})),maximumLogOddsCorrection:3},
    palette:{...f.palette,method:'offline-neural-seeded-rgb'}};
}
