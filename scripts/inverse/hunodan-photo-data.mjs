/** Photograph-only inputs for the automatic-crop track. The saved overlap
 * quads used by the speed benchmark are deliberately not exposed here. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createCanvas,loadImage} from 'canvas';
export {sha256} from './web-photo-data.mjs';
import {sha256} from './web-photo-data.mjs';

export const manifestURL=new URL('./fixtures/hunodan/speed-crops.json',import.meta.url);
export async function catalogue(){
 const data=JSON.parse(await fs.readFile(manifestURL));
 const photos=data.cases.map(c=>({id:c.id,file:c.source,sha256:c.sourceSha256,photoROI:c.photoROI,decodedPixelsSha256:c.decodedPixelsSha256,
  sourcePage:'https://www.hunodan.dk/julehjerter/julehjerter.html',family:'Hunodan',tags:['published-photograph','regular-design']}));
 return{photos,cases:photos.map(p=>({id:p.id,photo:p.id,roi:null,motif:p.id,track:'automatic-hunodan',regularity:'regular'}))};
}
export async function readPhoto(photo){
 const bytes=await fs.readFile(photo.file);assert.equal(sha256(bytes),photo.sha256,photo.id);
 const im=await loadImage(bytes),[x,y,x1,y1]=photo.photoROI;
 assert.ok(photo.photoROI.every(Number.isInteger)&&x>=0&&y>=0&&x1>x&&y1>y&&x1<=im.width&&y1<=im.height);
 const canvas=createCanvas(x1-x,y1-y),ctx=canvas.getContext('2d');ctx.drawImage(im,-x,-y);
 const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
 assert.equal(sha256(rgba),photo.decodedPixelsSha256,`Decoded photograph pixels differ: ${photo.id}`);
 return{type:'pixels',imageWidth:canvas.width,imageHeight:canvas.height,rgba};
}
