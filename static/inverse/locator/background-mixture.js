/** Recover paper coverage from a mixture of two sheets and the background.
 * Whitening uses observed background variation. This is a photographic model,
 * not a calibrated camera model or a change to the motif mask used for fitting.
 */
import {close,signedDistance} from './fields.js';

export function backgroundMixtureFields(image,f){
 const bg=f?.palette?.backgroundModel;
 if(!bg)return f;
 const L=Array.from({length:3},()=>[0,0,0]);
 for(let r=0;r<3;r++)for(let c=0;c<=r;c++){
  let value=bg.covariance[r][c];
  for(let k=0;k<c;k++)value-=L[r][k]*L[c][k];
  if(r===c&&!(value>0))return f;
  L[r][c]=r===c?Math.sqrt(value):value/L[c][c];
 }
 const whiten=p=>{
  const z=[];
  for(let r=0;r<3;r++){let value=p[r]-bg.mean[r];for(let c=0;c<r;c++)value-=L[r][c]*z[c];z.push(value/L[r][r]);}
  return z;
 };
 const [a,b]=f.palette.colors.map(whiten),v=b.map((x,k)=>x-a[k]),den=v.reduce((s,x)=>s+x*x,0);
 if(!(den>1e-12))return f;
 const aa=a.reduce((s,x)=>s+x*x,0),ab=a.reduce((s,x,k)=>s+x*b[k],0),bb=b.reduce((s,x)=>s+x*x,0),det=aa*bb-ab*ab;
 if(!(det>1e-8*aa*bb))return f;
 const {w,h}=f,paper=new Float32Array(w*h),red=new Float32Array(w*h),white=new Float32Array(w*h);
 for(let i=0;i<paper.length;i++){
  const p=whiten([0,1,2].map(c=>image.data[4*i+c]/255)),pa=p.reduce((s,x,k)=>s+x*a[k],0),pb=p.reduce((s,x,k)=>s+x*b[k],0);
  const u=(bb*pa-ab*pb)/det,vv=(aa*pb-ab*pa)/det;
  let fraction;
  if(u>=0&&vv>=0&&u+vv<=1)fraction=u+vv;
  else{
   // Outside the colour triangle, use the nearest point on one of its edges.
   const ta=Math.max(0,Math.min(1,pa/aa)),tb=Math.max(0,Math.min(1,pb/bb)),d=p.map((x,k)=>x-a[k]);
   const tc=Math.max(0,Math.min(1,d.reduce((s,x,k)=>s+x*v[k],0)/den));
   const candidates=[{fraction:ta,point:a.map(x=>ta*x)},{fraction:tb,point:b.map(x=>tb*x)},{fraction:1,point:a.map((x,k)=>x+tc*v[k])}];
   for(const candidate of candidates)candidate.error=p.reduce((s,x,k)=>s+(x-candidate.point[k])**2,0);
   candidates.sort((a,b)=>a.error-b.error);fraction=candidates[0].fraction;
  }
  paper[i]=fraction*image.data[4*i+3]/255;
  red[i]=f.chroma[i]*paper[i];white[i]=(1-f.chroma[i])*paper[i];
 }
 return{...f,paper,red,white,mask:close(paper,w,h,2),pd:signedDistance(close(paper,w,h,1),w,h),rd:signedDistance(close(red,w,h,1),w,h),wd:signedDistance(close(white,w,h,1),w,h),
  palette:{...f.palette,paperForeground:{method:'constrained-three-colour-mixture-in-whitened-rgb'}}};
}
