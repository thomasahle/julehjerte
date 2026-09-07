/** A second paper model for two coloured sheets on a plain background.
 * The original red/white model remains available for textured collage photos.
 * No target motif, previous crop or stored cutting path is used here.
 */
import {close,signedDistance} from './fields.js';
import {quantile,sigmoid} from './math.js';

const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
export function makePaletteFields(image,{pale=false}={}){
  const{width:w,height:h,data}=image,n=w*h,border=[];
  const rgb=i=>[0,1,2].map(c=>data[4*i+c]/255);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x<2||y<2||x>=w-2||y>=h-2)border.push(y*w+x);
  const transparent=border.filter(i=>data[4*i+3]<32).length/border.length>.8;
  const opaque=border.filter(i=>data[4*i+3]>200);
  if(!transparent&&opaque.length<border.length*.8)return null;
  const background=transparent?[0,0,0]:[0,1,2].map(c=>quantile(opaque.map(i=>data[4*i+c]/255),.5));
  const noise=transparent?0:quantile(opaque.map(i=>distance(rgb(i),background)),.8);
  if(noise>.12)return null;
  const threshold=Math.max(pale?.035:.10,noise*3),lightNeutral=Math.max(...background)-Math.min(...background)<.10&&Math.min(...background)>.8;
  const paper=new Float32Array(n),r=new Float32Array(n),g=new Float32Array(n),b=new Float32Array(n),pool=[];
  for(let i=0;i<n;i++){
    const color=rgb(i),alpha=data[4*i+3]/255;[r[i],g[i],b[i]]=color;
    let p=transparent?alpha:sigmoid((distance(color,background)-threshold)/.018)*alpha;
    // A soft grey drop shadow on white is background; dark paper still counts.
    if(!transparent&&lightNeutral){const saturation=Math.max(...color)-Math.min(...color),dark=1-Math.max(...color);p*=Math.max(sigmoid((saturation-(pale?.025:.10))/(pale?.008:.02)),sigmoid((dark-.32)/.04));}
    paper[i]=p;
    if(p>.95&&i%3===0)pool.push(color);
  }
  if(pool.length<100)return null;
  // Quantile seeds ignore the thin blurred fringe between paper and background.
  // Farthest-point seeds can spend a colour on that fringe instead of a sheet.
  const spreads=[0,1,2].map(c=>quantile(pool.map(p=>p[c]),.9)-quantile(pool.map(p=>p[c]),.1));
  const axis=spreads.indexOf(Math.max(...spreads)),sorted=[...pool].sort((a,b)=>a[axis]-b[axis]);
  let centers=[sorted[Math.floor(sorted.length*.2)],sorted[Math.floor(sorted.length*.8)]],counts;
  for(let step=0;step<20;step++){
    const sums=[[0,0,0],[0,0,0]];counts=[0,0];
    for(const p of pool){const k=Number(distance(p,centers[1])<distance(p,centers[0]));counts[k]++;for(let c=0;c<3;c++)sums[k][c]+=p[c];}
    if(counts.some(c=>c<pool.length*.08))return null;
    centers=sums.map((p,k)=>p.map(v=>v/counts[k]));
  }
  const separation=distance(...centers);if(separation<.18)return null;
  const red=new Float32Array(n),white=new Float32Array(n),chroma=new Float32Array(n);
  for(let i=0;i<n;i++){
    const p=rgb(i),a=distance(p,centers[0]),b=distance(p,centers[1]),z=sigmoid((b-a)/Math.max(.02,separation*.08));
    chroma[i]=z;red[i]=z*paper[i];white[i]=(1-z)*paper[i];
  }
  return{w,h,paper,red,white,chroma,r,g,b,mask:close(paper,w,h,2),pd:signedDistance(close(paper,w,h,1),w,h),rd:signedDistance(close(red,w,h,1),w,h),wd:signedDistance(close(white,w,h,1),w,h),palette:{method:'two-paper-colours-on-plain-background',pale,background,transparent,backgroundNoise:noise,colors:centers,separation}};
}
