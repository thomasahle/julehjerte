/** Float64 pixel surrogate. The caller supplies normalized image weights.
 * Scratch storage is reused, while every returned array owns its values. */
import {numericalKernel,kernelMemory} from '../numerical-kernel.js';
export function nativeGridPixels(samples,counts,n,phase,epsilon,floor,target,weights,mass,coarseWeight){
 const runtime=numericalKernel();
 if(!runtime?.grid_loss||!Number.isInteger(n)||n<1||n>512||![1,-1].includes(phase)||
   !Array.isArray(counts)||counts.length!==2||counts.some(c=>!Number.isInteger(c)||c<0||c>128)||
   !Array.isArray(samples)||samples.length!==2||samples.some((s,f)=>!(s instanceof Float64Array)||s.length!==n*counts[f])||
   target?.length!==n*n||weights&&(weights.length!==n*n||!Number.isFinite(mass)||mass<=0)||
   ![epsilon,floor,coarseWeight].every(Number.isFinite)||epsilon<=0||n*n*(counts[0]+counts[1]+12)*8>64*1024*1024)return null;
 const arena=kernelMemory(),alloc=arena.alloc;
 const [ca,cb]=counts,n2=n*n,pooled=Math.ceil(n/8)**2;
 const a=alloc(samples[0].byteLength),b=alloc(samples[1].byteLength),t=alloc(n2*8),w=weights?alloc(n2*8):0,
 pa=alloc(n2*8),pb=alloc(n2*8),da=alloc(n2*ca*8),db=alloc(n2*cb*8),fa=alloc(n2*4),la=alloc(n2*4),fb=alloc(n2*4),lb=alloc(n2*4),
 scratch=alloc(2*(ca+cb+1)*8),pred=alloc(n2*8),dp=alloc(n2*8),coarse=alloc(pooled*8),nums=alloc(pooled*4),cm=alloc(pooled*8),ga=alloc(n*ca*8),gb=alloc(n*cb*8);
 const {doubles:d}=arena.views();d.set(samples[0],a/8);d.set(samples[1],b/8);d.set(target,t/8);if(weights)d.set(weights,w/8);
 const sweep=counts.map((count,f)=>Number(count*(1-38*epsilon)>=3&&floor>=0&&epsilon>0&&Number.isFinite(epsilon)&&samples[f].every(Number.isFinite)));
 const loss=runtime.grid_loss(a,b,ca,cb,n,phase,epsilon,...sweep,t,w,mass||0,coarseWeight,pa,pb,da,db,fa,la,fb,lb,scratch,pred,dp,coarse,nums,cm,ga,gb);
 return {loss,prediction:d.slice(pred/8,pred/8+n2),ds:[d.slice(ga/8,ga/8+n*ca),d.slice(gb/8,gb/8+n*cb)]};
}
