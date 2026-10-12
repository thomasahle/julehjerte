/** Rotate already classified fields, without teaching the palette estimator
 * that padding around a photograph is a new background colour or transparency.
 * Coordinates here refer to pixel centres, as in the locator itself.
 */
import {bilinear} from './math.js';

/** Silhouette covariance only orders hypotheses; outline fitting must verify
 * them. Both eigenvectors and both signs remain possible heart orientations. */
export function orientationHypotheses({mask,w,h}){
  let n=0,x=0,y=0,xx=0,xy=0,yy=0;
  for(let j=0;j<h;j++)for(let i=0;i<w;i++)if(mask[j*w+i]){n++;x+=i;y+=j;xx+=i*i;xy+=i*j;yy+=j*j;}
  if(n<100)return[];
  const angle=-Math.atan2(2*(xy-x*y/n),xx-x*x/n-yy+y*y/n)*90/Math.PI;
  const normalize=a=>(a%360+360)%360,out=[];
  for(const a of [angle,angle+180,angle+90,angle+270,...Array.from({length:16},(_,i)=>i*22.5)]){
    const value=normalize(a);
    if(value>1e-6&&value<360-1e-6&&out.every(v=>Math.min(Math.abs(v-value),360-Math.abs(v-value))>.5))out.push(value);
  }
  return out;
}

export function orientFields(fields,degrees){
  if(!Number.isFinite(degrees))throw new TypeError('Expected a finite orientation angle.');
  const angle=degrees*Math.PI/180,clean=v=>Math.abs(v)<1e-12?0:v;
  const c=clean(Math.cos(angle)),s=clean(Math.sin(angle)),{w:width,h:height}=fields;
  const w=Math.ceil(Math.abs(c)*width+Math.abs(s)*height),h=Math.ceil(Math.abs(s)*width+Math.abs(c)*height);
  const toSource=([x,y])=>{const dx=x+.5-w/2,dy=y+.5-h/2;return[width/2+c*dx+s*dy-.5,height/2-s*dx+c*dy-.5];};
  const result={...fields,w,h,mask:new Uint8Array(w*h)},channels=['paper','red','white','chroma','r','g','b','pd','rd','wd'];
  for(const name of channels)result[name]=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,[sx,sy]=toSource([x,y]);
    for(const name of channels)result[name][i]=bilinear(fields[name],width,height,sx,sy,name.endsWith('d')&&name.length===2?1e4:name==='chroma'?.5:0);
    const xx=Math.round(sx),yy=Math.round(sy);
    if(xx>=0&&xx<width&&yy>=0&&yy<height)result.mask[i]=fields.mask[yy*width+xx];
  }
  return{fields:result,toSource,degrees};
}
