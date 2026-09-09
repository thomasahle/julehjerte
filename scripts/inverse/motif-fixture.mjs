/** Original synthetic silhouettes for the border experiment and regressions. */
import {createCanvas,ImageData} from 'canvas';

/** A plain top hat drawn upright in the heart view. The browser test adds its
 * free border through the real Paint controls; no fitted cuts are supplied. */
export function topHatFixture(n=200,{quarterTurns=0}={}){
 const canvas=createCanvas(n,n),ctx=canvas.getContext('2d');
 ctx.fillStyle='white';ctx.fillRect(0,0,n,n);ctx.fillStyle='black';ctx.beginPath();
 if(quarterTurns){ctx.translate(n/2,n/2);ctx.rotate(quarterTurns*Math.PI/2);ctx.translate(-n/2,-n/2);}
 const outline=[[-.12,-.17],[.12,-.17],[.12,.09],[.19,.09],[.19,.16],[-.19,.16],[-.19,.09],[-.12,.09]];
 outline.forEach(([dx,dy],i)=>{const x=(.5+dx+dy)*n,y=(.5-dx+dy)*n;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
 ctx.closePath();ctx.fill();return canvas.toBuffer('image/png');
}

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
