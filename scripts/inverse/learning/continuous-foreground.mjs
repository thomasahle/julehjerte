/** Experimental saliency post-processing. Geometry is a registration objective,
 * never a cutting certificate. Original RGB and component masks remain intact.
 */
import {close,signedDistance} from '../../../static/inverse/locator/fields.js';
import {sigmoid} from '../../../static/inverse/locator/math.js';

const squared=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
function weightedQuantile(sorted,mass,fraction){
 let sum=0;for(const point of sorted){sum+=point[3];if(sum>=mass*fraction)return point;}
 return sorted.at(-1);
}
export function confidencePalette({paper,r,g,b}){
 const pool=[];let mass=0;
 // A fixed confidence power replaces the discontinuous p > .95 admission.
 // Sampling locations remain independent of the prediction and photograph.
 for(let i=0;i<paper.length;i+=3){
  const p2=paper[i]*paper[i],p4=p2*p2,weight=p4*p4;
  if(weight>0){pool.push([r[i],g[i],b[i],weight]);mass+=weight;}
 }
 if(mass<100)return null;
 const ranked=[0,1,2].map(c=>[...pool].sort((a,b)=>a[c]-b[c]));
 const spreads=ranked.map((sorted,c)=>weightedQuantile(sorted,mass,.9)[c]-weightedQuantile(sorted,mass,.1)[c]);
 const sorted=ranked[spreads.indexOf(Math.max(...spreads))];
 let centers=[.2,.8].map(q=>weightedQuantile(sorted,mass,q).slice(0,3));
 for(let step=0;step<20;step++){
  const sums=[[0,0,0],[0,0,0]],masses=[0,0];
  for(const p of pool){const k=Number(squared(p,centers[1])<squared(p,centers[0]));masses[k]+=p[3];for(let c=0;c<3;c++)sums[k][c]+=p[c]*p[3];}
  if(masses.some(m=>m<mass*.08))return null;
  centers=sums.map((sum,k)=>sum.map(v=>v/masses[k]));
 }
 const separation=Math.sqrt(squared(...centers));
 return separation<.18?null:{method:'offline-confidence-weighted-foreground',colors:centers,separation,sampleMass:mass,confidencePower:8};
}

function grayscaleClose(probability,w,h,radius){
 const dilated=new Float32Array(w*h),closed=new Float32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let value=0;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
   const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h)value=Math.max(value,probability[yy*w+xx]);
  }dilated[y*w+x]=value;
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let value=1;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
   const xx=Math.max(0,Math.min(w-1,x+dx)),yy=Math.max(0,Math.min(h-1,y+dy));value=Math.min(value,dilated[yy*w+xx]);
  }closed[y*w+x]=value;
 }
 return closed;
}

export function subpixelPaperDistance(probability,w,h,{radius=1}={}){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||probability.length!==w*h||
  !Number.isInteger(radius)||radius<0||radius>3||!probability.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new TypeError('Expected a finite probability rectangle and radius from zero to three.');
 const q=grayscaleClose(probability,w,h,radius),d=new Float32Array(w*h).fill(1e4),diagonal=Math.SQRT2;
 for(let i=0;i<d.length;i++)if(q[i]===.5)d[i]=0;
 // Place distance seeds at interpolated edge crossings, instead of jumping
 // between integer pixels when an almost-half probability changes sign.
 const seed=(a,b)=>{
  if((q[a]>.5)===(q[b]>.5)||q[a]===q[b])return;
  const t=Math.abs((q[a]-.5)/(q[b]-q[a]));d[a]=Math.min(d[a],t);d[b]=Math.min(d[b],1-t);
 };
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x+1<w)seed(i,i+1);if(y+1<h)seed(i,i+w);}
 // Eight-neighbour chamfer propagation, matching the existing objective's
 // distance approximation. This is not an exact Euclidean distance transform.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;let value=d[i];if(x)value=Math.min(value,d[i-1]+1);
  if(y){value=Math.min(value,d[i-w]+1);if(x)value=Math.min(value,d[i-w-1]+diagonal);if(x+1<w)value=Math.min(value,d[i-w+1]+diagonal);}d[i]=value;
 }
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
  const i=y*w+x;let value=d[i];if(x+1<w)value=Math.min(value,d[i+1]+1);
  if(y+1<h){value=Math.min(value,d[i+w]+1);if(x)value=Math.min(value,d[i+w-1]+diagonal);if(x+1<w)value=Math.min(value,d[i+w+1]+diagonal);}d[i]=value;
 }
 for(let i=0;i<d.length;i++)if(q[i]<.5)d[i]=-d[i];
 const horizontal=new Float32Array(d.length),out=new Float32Array(d.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)horizontal[y*w+x]=(d[y*w+Math.max(0,x-1)]+2*d[y*w+x]+d[y*w+Math.min(w-1,x+1)])/4;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)out[y*w+x]=(horizontal[Math.max(0,y-1)*w+x]+2*horizontal[y*w+x]+horizontal[Math.min(h-1,y+1)*w+x])/4;
 return out;
}

export function continuousForeground(fields,{palette=false,distance=false}={}){
 if(!fields)return null;
 let result={...fields};
 if(palette){
  const colors=confidencePalette(fields);if(!colors)return null;
  const red=new Float32Array(fields.paper.length),white=new Float32Array(red.length),chroma=new Float32Array(red.length);
  for(let i=0;i<red.length;i++){
   const p=[fields.r[i],fields.g[i],fields.b[i]],a=Math.sqrt(squared(p,colors.colors[0])),b=Math.sqrt(squared(p,colors.colors[1]));
   const z=sigmoid((b-a)/Math.max(.02,colors.separation*.08));chroma[i]=z;red[i]=z*fields.paper[i];white[i]=(1-z)*fields.paper[i];
  }
  result={...result,red,white,chroma,palette:colors,rd:signedDistance(close(red,fields.w,fields.h,1),fields.w,fields.h),wd:signedDistance(close(white,fields.w,fields.h,1),fields.w,fields.h)};
 }
 if(distance)result.pd=subpixelPaperDistance(fields.paper,fields.w,fields.h);
 return result;
}
