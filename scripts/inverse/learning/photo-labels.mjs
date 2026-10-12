/** Evaluate a chosen crop in the unchanged synthetic material coordinates. */
import {homography,invert,multiply,project,SQUARE} from '../datasets/synthetic-photo.mjs';

export function labelsForCrop(labels,quad,canonical,n,width,height){
  const toPhoto=homography(SQUARE,quad),toCanonical=multiply(invert(labels.canonicalToPhoto),toPhoto),target=new Uint8Array(n*n),valid=new Uint8Array(n*n),size=canonical.width;
  if(size!==canonical.height)throw new Error('Canonical label must be square.');
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=y*n+x,point=[(x+.5)*100/n,(y+.5)*100/n],p=project(toCanonical,point),q=project(toPhoto,point);
    if(p.some(v=>v<0||v>100)||q[0]<0||q[1]<0||q[0]>width||q[1]>height)continue;
    valid[i]=1;
    const sx=Math.max(0,Math.min(size-1,p[0]*size/100-.5)),sy=Math.max(0,Math.min(size-1,p[1]*size/100-.5)),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(size-1,x0+1),y1=Math.min(size-1,y0+1),u=sx-x0,v=sy-y0;
    const at=(a,b)=>1-canonical.data[4*(b*size+a)]/255;
    target[i]=Number((1-v)*((1-u)*at(x0,y0)+u*at(x1,y0))+v*((1-u)*at(x0,y1)+u*at(x1,y1))>.5);
  }
  return{target,valid};
}
