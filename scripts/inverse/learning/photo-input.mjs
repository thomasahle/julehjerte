/** Portable preprocessing for the offline MobileNet experiments.
 * Matches real_annotations.photo_tensor: an antialiased triangle prefilter,
 * then a continuous pixel-edge letterbox with bilinear sampling.
 * Byte rounding follows Pillow 11.1's RGB resize/affine behavior:
 * https://github.com/python-pillow/Pillow/blob/11.1.0/src/libImaging/Resample.c
 * https://github.com/python-pillow/Pillow/blob/11.1.0/src/libImaging/Geometry.c
 * Input must already be decoded, oriented, opaque RGB; no browser APIs needed.
 */
const precision=2**22;

function taps(input,output){
 const ratio=input/output,support=Math.max(1,ratio);
 return Array.from({length:output},(_,x)=>{
  const center=(x+.5)*ratio,start=Math.max(0,Math.trunc(center-support+.5));
  const end=Math.min(input,Math.trunc(center+support+.5)),weights=[];let sum=0;
  for(let i=start;i<end;i++){const w=Math.max(0,1-Math.abs((i-center+.5)/support));weights.push(w);sum+=w;}
  return{start,weights:weights.map(w=>Math.trunc(.5+w/sum*precision))};
 });
}

function resize(rgb,width,height,w,h){
 let horizontal=rgb;
 if(w!==width){
  horizontal=new Uint8Array(w*height*3);const columns=taps(width,w);
  for(let y=0;y<height;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){
   const {start,weights}=columns[x];let sum=precision/2;
   for(let k=0;k<weights.length;k++)sum+=rgb[3*(y*width+start+k)+c]*weights[k];
   horizontal[3*(y*w+x)+c]=Math.min(255,Math.floor(sum/precision));
  }
 }
 if(h===height)return horizontal;
 const output=new Uint8Array(w*h*3),rows=taps(height,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){
  const {start,weights}=rows[y];let sum=precision/2;
  for(let k=0;k<weights.length;k++)sum+=horizontal[3*((start+k)*w+x)+c]*weights[k];
  output[3*(y*w+x)+c]=Math.min(255,Math.floor(sum/precision));
 }
 return output;
}

export function photoInput(rgb,width,height,resolution=256){
 if(![width,height,resolution].every(v=>Number.isInteger(v)&&v>0)||width*height>24e6||resolution>1024)
  throw new RangeError('Expected positive image dimensions, at most 24 megapixels and resolution <=1024.');
 if(!(rgb instanceof Uint8Array||rgb instanceof Uint8ClampedArray)||rgb.length!==width*height*3)
  throw new TypeError('Expected one packed RGB byte triplet per source pixel.');
 const scale=resolution/Math.max(width,height),offset=[(resolution-width*scale)/2,(resolution-height*scale)/2];
 const w=scale<1?Math.ceil(width*scale):width,h=scale<1?Math.ceil(height*scale):height;
 const filtered=scale<1?resize(rgb,width,height,w,h):rgb,output=new Uint8Array(resolution**2*3).fill(127);
 // Preserve coefficient evaluation order: premature cancellation of scale can
 // move a value just below an integer before the final byte truncation.
 const sx=w/width,sy=h/height,ax=sx/scale,ay=sy/scale,bx=-offset[0]*sx/scale,by=-offset[1]*sy/scale;
 const clip=(v,n)=>Math.min(n-1,Math.max(0,v));
 for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
  const px=ax*(x+.5)+bx,py=ay*(y+.5)+by;
  if(px<0||px>=w||py<0||py>=h)continue;
  const ix=Math.floor(px-.5),iy=Math.floor(py-.5),dx=px-.5-ix,dy=py-.5-iy;
  const x0=clip(ix,w),x1=clip(ix+1,w),y0=clip(iy,h),y1=clip(iy+1,h);
  for(let c=0;c<3;c++){
   const a=filtered[3*(y0*w+x0)+c],b=filtered[3*(y0*w+x1)+c];
   const d=filtered[3*(y1*w+x0)+c],e=filtered[3*(y1*w+x1)+c];
   const top=a+(b-a)*dx,bottom=d+(e-d)*dx;
   output[3*(y*resolution+x)+c]=top+(bottom-top)*dy;
  }
 }
 return{rgb:output,scale,offset,window:[-offset[0]/scale,-offset[1]/scale,(resolution-offset[0])/scale,(resolution-offset[1])/scale]};
}
