/** Two strongly coloured papers in a cluttered scene. Learn chromaticity from
 * the selected region, independently of the surrounding background brightness.
 * This supplies registration fields only; both lobes and exposed lower edges
 * must still support the final physical-heart fit.
 */
import {close,signedDistance} from './fields.js';
import {quantile,sigmoid} from './math.js';

const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const neutral=[1/3,1/3,1/3];
// Per pixel without arrays (the loops below ran a second on a large
// photograph): the same arithmetic in the same order.
const hueDistance=(hues,i,c)=>Math.hypot(hues[3*i]-c[0],hues[3*i+1]-c[1],hues[3*i+2]-c[2]);
export function makeChromaticPaletteFields(image,{roi=[0,0,image.width,image.height]}={}){
 const {width:w,height:h,data}=image,n=w*h,r=new Float32Array(n),g=new Float32Array(n),b=new Float32Array(n),hues=new Float32Array(n*3),pool=[];
 for(let i=0;i<n;i++){
  const R=data[4*i]/255,G=data[4*i+1]/255,B=data[4*i+2]/255,sum=Math.max(.001,R+G+B),hr=R/sum,hg=G/sum,hb=B/sum;
  r[i]=R;g[i]=G;b[i]=B;hues[3*i]=hr;hues[3*i+1]=hg;hues[3*i+2]=hb;
  const x=i%w,y=Math.floor(i/w);
  if(i%3===0&&x>=roi[0]&&x<roi[2]&&y>=roi[1]&&y<roi[3]&&data[4*i+3]>200&&Math.max(R,G,B)>.15&&Math.hypot(hr-neutral[0],hg-neutral[1],hb-neutral[2])>.18)pool.push(i);
 }
 if(pool.length<200)return null;
 const hueAt=i=>Array.from(hues.subarray(3*i,3*i+3));
 const spreads=[0,1,2].map(c=>quantile(pool.map(i=>hues[3*i+c]),.9)-quantile(pool.map(i=>hues[3*i+c]),.1));
 const axis=spreads.indexOf(Math.max(...spreads)),order=pool.slice().sort((a,b)=>hues[3*a+axis]-hues[3*b+axis]);
 let centers=[.2,.8].map(q=>hueAt(order[Math.floor(order.length*q)])),groups;
 for(let step=0;step<16;step++){
  groups=[[],[]];const sums=[[0,0,0],[0,0,0]];
  for(const i of pool){const k=Number(hueDistance(hues,i,centers[1])<hueDistance(hues,i,centers[0]));groups[k].push(i);for(let c=0;c<3;c++)sums[k][c]+=hues[3*i+c];}
  if(groups.some(p=>p.length<Math.max(80,pool.length*.08)))return null;
  centers=sums.map((p,k)=>p.map(v=>v/groups[k].length));
 }
 const separation=distance(...centers);
 if(separation<.25||centers.some(p=>distance(p,neutral)<.16))return null;
 const spreadsByColor=groups.map((group,k)=>quantile(group.map(i=>distance(hueAt(i),centers[k])),.9));
 const radii=spreadsByColor.map(v=>Math.min(separation*.3,Math.max(.035,2*v)));
 const paper=new Float32Array(n),chroma=new Float32Array(n),red=new Float32Array(n),white=new Float32Array(n);
 for(let i=0;i<n;i++){
  const d0=hueDistance(hues,i,centers[0]),d1=hueDistance(hues,i,centers[1]);
  const opacity=data[4*i+3]/255,observed=opacity*sigmoid((Math.max(r[i],g[i],b[i])-.10)/.025);
  const p0=sigmoid((radii[0]-d0)/(radii[0]*.15))*observed,p1=sigmoid((radii[1]-d1)/(radii[1]*.15))*observed;
  paper[i]=Math.max(p0,p1);red[i]=p0;white[i]=p1;
  chroma[i]=sigmoid((d1-d0)/Math.max(.02,separation*.08));
 }
 return{w,h,r,g,b,paper,chroma,red,white,mask:close(paper,w,h,2),pd:signedDistance(close(paper,w,h,1),w,h),rd:signedDistance(close(red,w,h,1),w,h),wd:signedDistance(close(white,w,h,1),w,h),
  palette:{method:'two-chromatic-paper-colours',colors:groups.map(group=>[r,g,b].map(channel=>quantile(group.map(i=>channel[i]),.5))),chromaticity:centers,chromaticitySeparation:separation,chromaticitySpread:spreadsByColor,radii,sampleCounts:groups.map(p=>p.length)}};
}
