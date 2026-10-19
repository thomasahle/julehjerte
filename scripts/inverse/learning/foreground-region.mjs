/** Offline rough-region proposal; a network outline is not a cutting boundary.
 * Reuses the locator's substantial-component guard, then adds 5% context.
 * Output coordinates are source pixel edges; the RGB locator still decides corners.
 */
export function foregroundRegion({probability,resolution,window,imageWidth,imageHeight}){
 if(!Number.isInteger(resolution)||resolution<2||resolution>1024||probability?.length!==resolution**2||
  !probability.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||
  !Array.isArray(window)||window.length!==4||window.some(v=>!Number.isFinite(v))||window[2]<=window[0]||window[3]<=window[1]||
  ![imageWidth,imageHeight].every(v=>Number.isInteger(v)&&v>=24)||imageWidth*imageHeight>24e6)
  throw new TypeError('Require a finite foreground probability grid and a valid photograph window.');
 const n=resolution,dx=(window[2]-window[0])/n,dy=(window[3]-window[1])/n;
 const mask=new Uint8Array(n*n),seen=new Uint8Array(n*n),queue=new Int32Array(n*n),components=[];
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const sx=window[0]+(x+.5)*dx,sy=window[1]+(y+.5)*dy;
  mask[y*n+x]=Number(probability[y*n+x]>.5&&sx>=0&&sy>=0&&sx<imageWidth&&sy<imageHeight);
 }
 for(let i=0;i<mask.length;i++){
  if(!mask[i]||seen[i])continue;
  let count=1,minX=n,minY=n,maxX=-1,maxY=-1;queue[0]=i;seen[i]=1;
  for(let read=0;read<count;read++){
   const index=queue[read],x=index%n,y=Math.floor(index/n);
   minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
   for(const next of [x?index-1:-1,x+1<n?index+1:-1,y?index-n:-1,y+1<n?index+n:-1])
    if(next>=0&&mask[next]&&!seen[next]){seen[next]=1;queue[count++]=next;}
  }
  if(count>=100)components.push({pixels:count,box:[minX,minY,maxX+1,maxY+1]});
 }
 components.sort((a,b)=>b.pixels-a.pixels);
 if(!components.length)return{status:'not-found',roi:null,reason:'No substantial predicted paper component.'};
 if(components[1]?.pixels>components[0].pixels*.35)
  return{status:'needs-selection',roi:null,reason:'Multiple substantial predicted paper components.',components:components.length};
 const component=components[0],bounds=component.box.map((v,i)=>window[i%2]+v*(i%2?dy:dx));
 const padding=.05*Math.max(bounds[2]-bounds[0],bounds[3]-bounds[1]);
 const roi=[Math.max(0,bounds[0]-padding),Math.max(0,bounds[1]-padding),Math.min(imageWidth,bounds[2]+padding),Math.min(imageHeight,bounds[3]+padding)];
 if(roi[2]-roi[0]<24||roi[3]-roi[1]<24)return{status:'not-found',roi:null,reason:'Predicted region is too small for the locator.'};
 return{status:'proposal',roi,componentPixels:component.pixels,components:components.length,
  bounds,paddingFraction:.05,threshold:.5,scope:'Rough search region only; no final crop corners or mask.'};
}
