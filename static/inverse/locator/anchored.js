/** Fallback for red/orange paper and a pale sheet against a textured scene.
 * Learn the pale paper from inside the main coloured component's convex hull.
 * The hull seeds lower edges only; cap colours and outlines validate the fit.
 */
import {makeFields,close,signedDistance} from './fields.js';
import {quantile,sigmoid} from './math.js';

function mainComponent(mask,w,h){
  const seen=new Uint8Array(mask.length),components=[];
  for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){
    const queue=[i];seen[i]=1;
    for(let k=0;k<queue.length;k++){
      const j=queue[k],x=j%w,y=Math.floor(j/w);
      for(const nb of[x?j-1:-1,x+1<w?j+1:-1,y?j-w:-1,y+1<h?j+w:-1])if(nb>=0&&mask[nb]&&!seen[nb]){seen[nb]=1;queue.push(nb);}
    }
    components.push(queue);
  }
  components.sort((a,b)=>b.length-a.length);
  if(!components.length||components[0].length<mask.length*.04||components[1]?.length>components[0].length*.35)return null;
  return components[0];
}
function hullMask(component,w,h){
  const left=new Int32Array(h).fill(w),right=new Int32Array(h).fill(-1),points=[];
  for(const i of component){const x=i%w,y=Math.floor(i/w);left[y]=Math.min(left[y],x);right[y]=Math.max(right[y],x);}
  for(let y=0;y<h;y++)if(right[y]>=left[y])points.push([left[y],y],[right[y],y]);
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half=ps=>{const hull=[];for(const p of ps){while(hull.length>1&&cross(hull.at(-2),hull.at(-1),p)<=0)hull.pop();hull.push(p);}return hull;};
  const hull=[...half(points).slice(0,-1),...half(points.toReversed()).slice(0,-1)],mask=new Uint8Array(w*h);
  for(let y=0;y<h;y++){
    const xs=[];
    for(let i=0;i<hull.length;i++){
      const a=hull[i],b=hull[(i+1)%hull.length];
      if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));
    }
    if(xs.length)for(let x=Math.ceil(Math.min(...xs));x<=Math.floor(Math.max(...xs));x++)mask[y*w+x]=1;
  }
  return mask;
}
export function makeAnchoredFields(image){
  const f=makeFields(image),{w,h}=f,component=mainComponent(close(f.red,w,h,3),w,h);
  if(!component)return null;
  const mask=hullMask(component,w,h),pool=[];
  for(let i=0;i<mask.length;i++)if(mask[i]&&f.red[i]<.05&&image.data[4*i+3]>200)pool.push(i);
  if(pool.length<Math.max(100,component.length*.10))return null;
  const paleColor=[f.r,f.g,f.b].map(ch=>quantile(pool.map(i=>ch[i]),.5));
  const radius=Math.max(.045,.12*Math.hypot(...paleColor)),white=new Float32Array(mask.length);
  for(let i=0;i<white.length;i++)white[i]=sigmoid((radius-Math.hypot(f.r[i]-paleColor[0],f.g[i]-paleColor[1],f.b[i]-paleColor[2]))/(radius*.15))*image.data[4*i+3]/255;
  f.wd=signedDistance(close(white,w,h,1),w,h);
  // Cap purity is conditional colour, independent of exposure and background.
  f.white=f.chroma.map((v,i)=>(1-v)*image.data[4*i+3]/255);
  f.mask=mask;f.pd=signedDistance(mask,w,h);
  f.anchored={method:'coloured-component-and-learned-pale-paper',paleColor,paleColorRadius:radius,colouredArea:component.length};
  return f;
}
