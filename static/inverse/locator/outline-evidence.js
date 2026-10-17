/** Contrast at the fitted physical boundary, independent of holes in a
 * registration mask. Values use the same RGB scale as lower-edge refinement.
 */
import {bilinear} from './math.js';
export function outlineContrast(f,points){
 const samples=points.map((p,i)=>{
  const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(length<1e-8)return 0;
  const nx=-(b[1]-a[1])/length,ny=(b[0]-a[0])/length;let best=0;
  for(let d=-1.5;d<=1.5;d+=.5){
   const x=p[0]+d*nx,y=p[1]+d*ny;
   if(x-1.2*Math.abs(nx)<0||x+1.2*Math.abs(nx)>f.w-1||y-1.2*Math.abs(ny)<0||y+1.2*Math.abs(ny)>f.h-1)continue;
   const delta=[f.r,f.g,f.b].map(ch=>bilinear(ch,f.w,f.h,x+1.2*nx,y+1.2*ny)-bilinear(ch,f.w,f.h,x-1.2*nx,y-1.2*ny));
   best=Math.max(best,Math.hypot(...delta));
  }
  return best;
 });
 return{support:samples.filter(v=>v>.065).length/Math.max(1,samples.length),samples,threshold:.065,searchRadiusPx:1.5,comparisonOffsetPx:1.2};
}
