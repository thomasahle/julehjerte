/** Sampling envelope only: preserve gaps connected to the image exterior.
 * Original probabilities, colour fields and distance fields remain untouched.
 * This mask must never become a cutting target or a label for NN training.
 */
export function outerBoundaryMask(mask,w,h){
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||mask?.length!==w*h||!mask.every(v=>v===0||v===1))
    throw new TypeError('Expected a binary mask rectangle.');
  const exterior=new Uint8Array(mask.length),queue=new Uint32Array(mask.length);let head=0,tail=0;
  const visit=i=>{if(!mask[i]&&!exterior[i]){exterior[i]=1;queue[tail++]=i;}};
  for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);}
  for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}
  while(head<tail){
    const i=queue[head++],x=i%w,y=Math.floor(i/w);
    // Eight-connected background conservatively preserves diagonal openings.
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const xx=x+dx,yy=y+dy;
      if(xx>=0&&xx<w&&yy>=0&&yy<h)visit(yy*w+xx);
    }
  }
  return Uint8Array.from(exterior,v=>1-v);
}

const cache=new WeakMap();
export function outerBoundaryFields(fields){
  if(!cache.has(fields))cache.set(fields,{...fields,mask:outerBoundaryMask(fields.mask,fields.w,fields.h)});
  return cache.get(fields);
}
