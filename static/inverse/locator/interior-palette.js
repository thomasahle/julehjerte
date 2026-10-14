/** Recover a pale sheet whose tint is too weak for the initial paper mask.
 * Sample its colour inside the dominant coloured component's convex hull.
 * The hull selects samples only: it never supplies the final paper boundary.
 * Normalized RGB separates the learned tint from neutral background shading.
 */
import {makePaperForeground} from './palette.js';
import {mainComponent,hullMask} from './anchored.js';
import {close,signedDistance} from './fields.js';
import {quantile,sigmoid} from './math.js';

const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const normalize=color=>{
  const sum=Math.max(.001,color.reduce((a,b)=>a+b,0));
  return color.map(v=>v/sum);
};

export function makeInteriorPaletteFields(image){
  const f=makePaperForeground(image,{pale:true})||makePaperForeground(image,{pale:true,correlated:true});
  if(!f||f.transparent)return null;
  const {w,h,background}=f,backgroundHue=normalize(background),colored=new Float32Array(w*h);
  const rgb=i=>[f.r[i],f.g[i],f.b[i]];
  // A single strongly tinted region is enough to start; requiring an existing
  // two-colour fit would fail precisely when the pale sheet was missed.
  for(let i=0;i<colored.length;i++)colored[i]=f.paper[i]*sigmoid((distance(normalize(rgb(i)),backgroundHue)-.06)/.01);
  const component=mainComponent(close(colored,w,h,3),w,h);
  if(!component)return null;
  const hull=hullMask(component,w,h),pool=[];
  for(let i=0;i<hull.length;i++){
    if(hull[i]&&colored[i]<.05&&image.data[4*i+3]>200)pool.push(i);
  }
  if(pool.length<Math.max(100,component.length*.10))return null;
  const pale=[0,1,2].map(c=>quantile(pool.map(i=>rgb(i)[c]),.5));
  const paleHue=normalize(pale);
  const hueSeparation=distance(paleHue,backgroundHue);
  // If tint provides no useful separation, brightness alone cannot recover
  // a white sheet against white or distinguish it from a cast shadow.
  if(hueSeparation<.004)return null;
  const hueSpread=quantile(pool.map(i=>distance(normalize(rgb(i)),paleHue)),.8);
  const hueRadius=Math.max(.01,3*hueSpread),colorSamples=component.filter(i=>colored[i]>.8);
  if(colorSamples.length<100)return null;
  const color=[0,1,2].map(c=>quantile(colorSamples.map(i=>rgb(i)[c]),.5));
  const separation=distance(color,pale);
  if(separation<.18)return null;
  const paper=new Float32Array(w*h),chroma=new Float32Array(w*h);
  const red=new Float32Array(w*h),white=new Float32Array(w*h);
  for(let i=0;i<paper.length;i++){
    const p=rgb(i),hue=normalize(p),d=distance(hue,paleHue);
    const dBackground=distance(hue,backgroundHue),alpha=image.data[4*i+3]/255;
    const paleProbability=Math.min(
      sigmoid((dBackground-d)/(hueSeparation*.15)),
      sigmoid((hueRadius-d)/(hueRadius*.15))
    )*alpha;
    paper[i]=Math.max(colored[i],paleProbability);
    const z=sigmoid((distance(p,pale)-distance(p,color))/Math.max(.02,separation*.08));
    chroma[i]=z;red[i]=z*paper[i];white[i]=(1-z)*paper[i];
  }
  return {w,h,r:f.r,g:f.g,b:f.b,paper,chroma,red,white,
    mask:close(paper,w,h,2),pd:signedDistance(close(paper,w,h,1),w,h),
    rd:signedDistance(close(red,w,h,1),w,h),wd:signedDistance(close(white,w,h,1),w,h),
    palette:{method:'two-paper-colours-from-interior-chromaticity',pale:true,
      background,transparent:false,backgroundNoise:f.noise,
      colors:[color,pale],separation,paleHue,backgroundHue,hueSeparation,
      paleHueSpread:hueSpread,hueRadius,interiorSamples:pool.length,colouredArea:component.length}
  };
}
