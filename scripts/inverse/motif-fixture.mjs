/** Original synthetic silhouettes for the border experiment and regressions. */
import {createCanvas,ImageData} from 'canvas';

export function motifFixture(shape,{cells=4,n=240,offset=0}={}){
 const c=createCanvas(n,n),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,n,n);ctx.fillStyle='black';
 const points=shape==='hat'?[[.25,.72],[.38,.66],[.47,.25],[.65,.2],[.55,.37],[.64,.66],[.75,.72],[.7,.78],[.3,.78]]:[[.28,.44],[.5,.22],[.72,.44],[.66,.44],[.66,.78],[.34,.78],[.34,.44]];
 ctx.beginPath();
 if(shape==='circle')ctx.arc(.52*n,.58*n,.18*n,0,2*Math.PI);
 else points.forEach(([x,y],i)=>i?ctx.lineTo(x*n+offset,y*n+offset):ctx.moveTo(x*n+offset,y*n+offset));
 ctx.closePath();ctx.fill();
 const raw=ctx.getImageData(0,0,n,n).data,motif=Uint8Array.from({length:n*n},(_,i)=>Number(raw[4*i]<128)),mask=motif.slice(),original=c.toBuffer('image/png'),border=.18;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(Math.min(x,y,n-1-x,n-1-y)<border*n)mask[y*n+x]=(Math.floor(x/n*cells)+Math.floor(y/n*cells))%2;
 for(let i=0;i<n*n;i++){const v=mask[i]?0:255;raw.set([v,v,v,255],4*i);}ctx.putImageData(new ImageData(raw,n,n),0,0);
 return{input:{type:'pixels',imageWidth:n,imageHeight:n,rgba:raw},motif,mask,original,border,png:c.toBuffer('image/png')};
}
