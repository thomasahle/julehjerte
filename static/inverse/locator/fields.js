import {sigmoid,clamp,quantile} from './math.js';
/** Boundary finding needs a PAPER mask, not a red-versus-white mask. */
export function makeFields(image){
 const{width:w,height:h,data}=image,n=w*h,paper=new Float32Array(n),red=new Float32Array(n),white=new Float32Array(n),chroma=new Float32Array(n),r=new Float32Array(n),g=new Float32Array(n),b=new Float32Array(n);
 for(let i=0;i<n;i++){
  // Weight segmentation by alpha; transparent pixels must not become paper.
  const a=data[4*i+3]/255,R=data[4*i]/255,G=data[4*i+1]/255,B=data[4*i+2]/255,sum=R+G+B+.001,nr=R/sum;
  r[i]=R;g[i]=G;b[i]=B;
  let rp=sigmoid(((R-G)/(R+G+.001)-.30)/.035)*sigmoid((R-.19)/.04);
  let wp=sigmoid((G-.59)/.045)*sigmoid((.16-(R-G)/sum)/.035)*sigmoid((nr-.313)/.008);
  let mix=sigmoid(((B-G)/sum+.013)/.004)*sigmoid((R-.35)/.04)*sigmoid((nr-.315)/.006);
  paper[i]=(1-(1-rp)*(1-wp)*(1-mix))*a;
  // Conditional paper palette probability; used at lobe diameters, not to mask artwork.
  const z=sigmoid(((R-G)/(R+G+.001)-.29)/.05);
  chroma[i]=z;red[i]=rp*a;white[i]=wp*a;
 }
 const pm=close(paper,w,h,1),rm=close(red,w,h,1),wm=close(white,w,h,1);
 const pd=signedDistance(pm,w,h),rd=signedDistance(rm,w,h),wd=signedDistance(wm,w,h);
 return {w,h,paper,red,white,chroma,pd,rd,wd,mask:close(paper,w,h,2),r,g,b};
}
/** The mask `prob > .5` closed by a square of side 2·radius+1: dilated, then
 * eroded. Both stop at the image's edge (an eroded window repeating its edge
 * pixels holds no other values), so each is a row pass then a column pass. */
export function close(prob,w,h,radius){const n=w*h,m=new Uint8Array(n);for(let i=0;i<n;i++)m[i]=prob[i]>.5?1:0;
 return square(square(m,w,h,radius,true),w,h,radius,false);
}
/** Each pixel 1 where any (`any`) or every pixel of its square window within
 * the image is 1. */
function square(mask,w,h,radius,any){
 const pass=(src,dst,lines,length,along,across)=>{
  for(let line=0;line<lines;line++){
   const o=line*across;let sum=0;
   for(let k=0;k<Math.min(length,radius);k++)sum+=src[o+k*along];
   for(let k=0;k<length;k++){
    if(k+radius<length)sum+=src[o+(k+radius)*along];
    if(k-radius>0)sum-=src[o+(k-radius-1)*along];
    dst[o+k*along]=any?(sum>0?1:0):(sum===Math.min(length-1,k+radius)-Math.max(0,k-radius)+1?1:0);
   }
  }
 };
 const rows=new Uint8Array(w*h),out=new Uint8Array(w*h);
 pass(mask,rows,h,w,1,w);pass(rows,out,w,h,w,1);
 return out;
}
/** Small enclosed omissions in a physical-paper registration mask. Eight-way
 * background connectivity preserves diagonal openings to the image exterior.
 * This never edits the photograph or the red/white artwork classification.
 */
export function fillSmallMaskHoles(mask,w,h,{maxArea,canFill=()=>true}){
 const n=w*h;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||mask.length!==n||!Number.isFinite(maxArea)||maxArea<0)throw new Error('Expected a rectangular mask and nonnegative hole area.');
 const out=mask.slice(),seen=new Uint8Array(n),queue=new Uint32Array(n);let filledPixels=0,filledComponents=0;
 for(let start=0;start<n;start++)if(!mask[start]&&!seen[start]){
  let head=0,tail=1,border=false;queue[0]=start;seen[start]=1;
  while(head<tail){
   const i=queue[head++],x=i%w,y=Math.floor(i/w);
   border||=x===0||y===0||x===w-1||y===h-1;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h){
    const j=i+dy*w+dx;if(!mask[j]&&!seen[j]){seen[j]=1;queue[tail++]=j;}
   }
  }
  if(border||tail>maxArea)continue;
  let observed=true;for(let i=0;i<tail&&observed;i++)observed=canFill(queue[i]);
  if(!observed)continue;
  for(let i=0;i<tail;i++)out[queue[i]]=1;
  filledPixels+=tail;filledComponents++;
 }
 return{mask:out,filledPixels,filledComponents};
}
/** Chamfer distance (8-neighbour), used only as a registration objective, not a geometric certificate. */
function distance(mask,w,h,inside){const n=w*h,d=new Float32Array(n),sq=Math.SQRT2;for(let i=0;i<n;i++)d[i]=(!!mask[i])===inside?1e4:0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;let a=d[i];if(x)a=Math.min(a,d[i-1]+1);if(y){a=Math.min(a,d[i-w]+1);if(x)a=Math.min(a,d[i-w-1]+sq);if(x+1<w)a=Math.min(a,d[i-w+1]+sq);}d[i]=a;}
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;let a=d[i];if(x+1<w)a=Math.min(a,d[i+1]+1);if(y+1<h){a=Math.min(a,d[i+w]+1);if(x)a=Math.min(a,d[i+w-1]+sq);if(x+1<w)a=Math.min(a,d[i+w+1]+sq);}d[i]=a;}return d;}
function blur(a,w,h){let b=new Float32Array(a.length),c=new Float32Array(a.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++)b[y*w+x]=(a[y*w+clamp(x-1,0,w-1)]+2*a[y*w+x]+a[y*w+clamp(x+1,0,w-1)])/4;for(let y=0;y<h;y++)for(let x=0;x<w;x++)c[y*w+x]=(b[clamp(y-1,0,h-1)*w+x]+2*b[y*w+x]+b[clamp(y+1,0,h-1)*w+x])/4;return c;}
export function signedDistance(mask,w,h){const a=distance(mask,w,h,true),b=distance(mask,w,h,false);for(let i=0;i<a.length;i++)a[i]-=b[i];return blur(a,w,h);}
export function foregroundBox(f){const {w,h,mask}=f,seen=new Uint8Array(w*h),components=[];for(let i=0;i<mask.length;i++){if(!mask[i]||seen[i])continue;const queue=[i];seen[i]=1;let minx=w,miny=h,maxx=0,maxy=0;for(let k=0;k<queue.length;k++){const j=queue[k],x=j%w,y=Math.floor(j/w);minx=Math.min(minx,x);miny=Math.min(miny,y);maxx=Math.max(maxx,x);maxy=Math.max(maxy,y);for(const nb of [x?j-1:-1,x+1<w?j+1:-1,y?j-w:-1,y+1<h?j+w:-1])if(nb>=0&&mask[nb]&&!seen[nb]){seen[nb]=1;queue.push(nb);}}
 if(queue.length>100)components.push({area:queue.length,box:[minx,miny,maxx+1,maxy+1],pixels:queue});}
 components.sort((a,b)=>b.area-a.area);if(!components.length)return{status:'not_found',reason:'No red/white paper foreground'};
 const largest=components[0];if(components[1]?.area>largest.area*.35)return{status:'needs_selection',reason:'Multiple substantial foreground components'};
 const [x0,y0,x1,y1]=largest.box,rows=new Uint32Array(h);for(const i of largest.pixels)rows[Math.floor(i/w)]++;
 const mx=Math.max(...rows),good=[];for(let y=y0;y<y1;y++)if(rows[y]>.25*mx)good.push(y);
 const runs=[];for(const y of good){if(!runs.length||y-runs.at(-1).at(-1)>3)runs.push([y]);else runs.at(-1).push(y);}
 if(runs.length>1&&runs.filter(r=>r.length>.14*(y1-y0)).length>1)return{status:'needs_selection',reason:'Multiple heart-sized foreground bands'};
 // Keep the tip: only trim thin top handle. Large bottom clipping is detected separately.
 let top=y0;while(top<y1&&rows[top]<.30*mx)top++;
 if((x1-x0)/(y1-top)>1.55||largest.area/(w*h)>.78)return{status:'needs_selection',reason:'Crowded frame: select one heart with a rough rectangle'};
 return {status:'ok',box:[x0,top,x1,y1],area:largest.area,components:components.length};
}
