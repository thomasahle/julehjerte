/** Known physical outline; the painted motif is not a cutting-template witness. */
import {createCanvas,loadImage} from 'canvas';
import {heartPhoto} from './crop-fixture.mjs';

export const framedCropCorners=[[190,80],[275,155],[190,230],[105,155]];
export const framedCropROI=[85,40,300,250];
export async function framedCropPhoto({depths=[.5,.5],end=[175,165,160],height=320}={}){
  const foreground=heartPhoto({background:'transparent',colours:['#ba1527','#e5d5d5'],lobeDepths:depths});
  const f=foreground.canvas.getContext('2d');f.save();f.transform(85,75,-85,75,190,80);
  f.fillStyle='#e5d5d5';f.fillRect(0,0,1,1);f.strokeStyle='#ba1527';f.lineWidth=.045;f.strokeRect(.07,.07,.86,.86);
  f.fillStyle='#ba1527';f.beginPath();f.arc(.5,.5,.27,0,2*Math.PI);f.fill();
  for(const[x,y]of[[0,0],[1,0],[1,1],[0,1]])f.fillRect(x?.88:.035,y?.88:.035,.085,.085);
  f.restore();const rgba=f.getImageData(0,0,380,320).data;
  const canvas=createCanvas(380,height),ctx=canvas.getContext('2d'),data=ctx.createImageData(380,height);
  for(let y=0;y<height;y++)for(let x=0;x<380;x++){
    const i=4*(y*380+x),alpha=rgba[i+3]/255,texture=4*Math.sin(.21*x)+3*Math.sin(.31*y);
    const background=[105,85,70].map((v,k)=>v+(end[k]-v)*x/379);
    for(let k=0;k<3;k++)data.data[i+k]=alpha*rgba[i+k]+(1-alpha)*(background[k]+texture);
    data.data[i+3]=255;
  }
  ctx.putImageData(data,0,0);ctx.drawImage(await loadImage(canvas.toBuffer('image/jpeg',{quality:.75})),0,0);
  return{type:'pixels',imageWidth:380,imageHeight:height,rgba:ctx.getImageData(0,0,380,height).data};
}
