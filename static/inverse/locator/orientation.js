/** Rotate already classified fields, without teaching the palette estimator
 * that padding around a photograph is a new background colour or transparency.
 * Coordinates here refer to pixel centres, as in the locator itself.
 */

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
  // Each pixel's source point and bilinear weights once for every channel:
  // toSource's and bilinear's arithmetic, in their order.
  const from=channels.map(name=>fields[name]),to=channels.map(name=>result[name]);
  const outside=channels.map(name=>name.endsWith('d')&&name.length===2?1e4:name==='chroma'?.5:0);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,dx=x+.5-w/2,dy=y+.5-h/2,sx=width/2+c*dx+s*dy-.5,sy=height/2-s*dx+c*dy-.5;
    if(sx<0||sy<0||sx>width-1||sy>height-1)for(let k=0;k<to.length;k++)to[k][i]=outside[k];
    else{
      const ix=Math.floor(sx),iy=Math.floor(sy),jx=Math.min(ix+1,width-1),jy=Math.min(iy+1,height-1),u=sx-ix,v=sy-iy;
      const p00=iy*width+ix,p01=iy*width+jx,p10=jy*width+ix,p11=jy*width+jx;
      for(let k=0;k<to.length;k++){const a=from[k];to[k][i]=(1-v)*((1-u)*a[p00]+u*a[p01])+v*((1-u)*a[p10]+u*a[p11]);}
    }
    const xx=Math.round(sx),yy=Math.round(sy);
    if(xx>=0&&xx<width&&yy>=0&&yy<height)result.mask[i]=fields.mask[yy*width+xx];
  }
  return{fields:result,toSource,degrees};
}
