import fs from 'node:fs/promises';
import {createCanvas,loadImage} from 'canvas';
export const yellowStarFile=new URL('./fixtures/yellow-star-photo.png',import.meta.url);
// Manually reviewed square in the user's photo, inset to exclude the background.
// These are test crop coordinates, not ground-truth cutting paths.
export const yellowStarQuad=[[287.3957,85.9435],[152.7077,204.9355],[284.5349,334.9099],[411.0917,207.9211]];
export async function yellowStarInput(){
  const bytes=await fs.readFile(yellowStarFile),im=await loadImage(bytes),canvas=createCanvas(im.width,im.height),ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
  return {type:'pixels',rgba:ctx.getImageData(0,0,im.width,im.height).data,imageWidth:im.width,imageHeight:im.height,quad:yellowStarQuad.map(p=>[...p])};
}
