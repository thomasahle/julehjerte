import {makeFields,close,signedDistance} from './fields.js';
import {quantile,sigmoid} from './math.js';

/** Registration-only fallback for red/pale paper against a darker background
 * with a similar hue. Learn three RGB clusters inside the rough selection;
 * compare pixels with the paper-colour segment and the background cluster.
 * Brightness is deliberately retained. This does not change the photograph or
 * the colour-mixture target used for template fitting.
 */
export function makeRGBBackgroundFields(image,{roi=[0,0,image.width,image.height]}={}){
 const f=makeFields(image),{w,h}=f,pools=[[],[],[]],samples=[];
 for(let i=0;i<w*h;i++){
  const x=i%w,y=Math.floor(i/w);
  if(x<roi[0]||x>=roi[2]||y<roi[1]||y>=roi[3]||image.data[4*i+3]<200)continue;
  if(f.red[i]>.95)pools[0].push(i);
  if(f.white[i]>.95&&f.red[i]<.05)pools[1].push(i);
  if(f.paper[i]<.05)pools[2].push(i);
  if(i%3===0)samples.push([f.r[i],f.g[i],f.b[i]]);
 }
 // Missing colours/background give no evidence for this hypothesis. Keep the
 // other automatic detectors, including those for transparent or pale photos.
 if(pools.some(p=>p.length<100))return null;
 let colors=pools.map(pool=>[f.r,f.g,f.b].map(ch=>quantile(pool.map(i=>ch[i]),.5)));
 for(let step=0;step<16;step++){
  const sums=[[0,0,0],[0,0,0],[0,0,0]],counts=[0,0,0];
  for(const p of samples){
   let winner=0,best=Infinity;
   for(let k=0;k<3;k++){
    const c=colors[k],d=0+(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2;
    if(d<best){best=d;winner=k;}
   }
   counts[winner]++;
   for(let j=0;j<3;j++)sums[winner][j]+=p[j];
  }
  if(counts.some(n=>n<100))return null;
  colors=sums.map((sum,k)=>sum.map(v=>v/counts[k]));
 }
 const vector=colors[1].map((v,k)=>v-colors[0][k]),den=vector.reduce((s,v)=>s+v*v,0);
 if(den<.18**2)return null;
 // Per pixel without arrays: the same arithmetic in the same order.
 const [base,,ground]=colors,[v0,v1,v2]=vector;
 const paper=f.paper.map((v,i)=>{
  const R=f.r[i],G=f.g[i],B=f.b[i],bg=Math.hypot(R-ground[0],G-ground[1],B-ground[2]);
  const d0=R-base[0],d1=G-base[1],d2=B-base[2],t=Math.max(0,Math.min(1,(0+d0*v0+d1*v1+d2*v2)/den));
  return Math.min(v,sigmoid((bg-Math.hypot(d0-t*v0,d1-t*v1,d2-t*v2))/.02));
 });
 const red=f.red.map((v,i)=>Math.min(v,paper[i])),white=f.white.map((v,i)=>Math.min(v,paper[i]));
 return{...f,paper,red,white,mask:close(paper,w,h,2),
  pd:signedDistance(close(paper,w,h,1),w,h),rd:signedDistance(close(red,w,h,1),w,h),wd:signedDistance(close(white,w,h,1),w,h),
  backgroundSegmentation:{method:'rgb-paper-segment-background',colors,seedCounts:pools.map(p=>p.length),samples:samples.length}};
}
