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

/** Diagnostic physical-paper prior: regular woven overlap contains paper even
 * where the motif changes color. Only enclosed background components are
 * filled; a notch or gap connected to the image exterior remains unchanged.
 * Handles/neighboring objects can also enclose holes, so this is not a promise
 * that every filled pixel belongs to the selected heart.
 */
export function fillForegroundHoles(f){
  const {w,h}=f,n=w*h;
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||f.paper?.length!==n||f.chroma?.length!==n||!f.paper.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new Error('Expected finite foreground fields.');
  const outside=new Uint8Array(n),queue=new Uint32Array(n);let head=0,tail=0;
  const visit=i=>{if(!outside[i]&&f.paper[i]<=.5){outside[i]=1;queue[tail++]=i;}};
  for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);}
  for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}
  while(head<tail){
    const i=queue[head++],x=i%w,y=Math.floor(i/w);
    // Eight-neighbor background preserves even a diagonal opening.
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)visit(i+dy*w+dx);
  }
  const paper=f.paper.slice(),red=new Float32Array(n),white=new Float32Array(n);let filledPixels=0;
  for(let i=0;i<n;i++){
    if(!outside[i]&&paper[i]<=.5){paper[i]=1;filledPixels++;}
    red[i]=paper[i]*f.chroma[i];white[i]=paper[i]*(1-f.chroma[i]);
  }
  return{...f,paper,red,white,mask:close(paper,w,h,2),pd:signedDistance(close(paper,w,h,1),w,h),rd:signedDistance(close(red,w,h,1),w,h),wd:signedDistance(close(white,w,h,1),w,h),
    refinement:{method:'enclosed-foreground-holes',applied:filledPixels>0,filledPixels,backgroundConnectivity:8},palette:{...f.palette,method:'offline-enclosed-foreground-holes'}};
}
