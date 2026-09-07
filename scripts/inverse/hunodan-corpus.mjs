/** Prepare photograph-only inputs for all published Hunodan template pairs. */
import fs from'node:fs/promises';import{createHash}from'node:crypto';import{createCanvas,loadImage}from'canvas';
import{detectHeartCrops}from'../../static/inverse/core/crop.js';import{rectify}from'../../static/inverse/core/input.js';
const root='scripts/inverse/fixtures/hunodan',catalog=JSON.parse(await fs.readFile(`${root}/sources.json`)),out=`tmp/inverse-hunodan/${new Date().toISOString().replace(/[:.]/g,'-')}-crops`;
await fs.mkdir(out,{recursive:true});const rows=[],hash=b=>createHash('sha256').update(b).digest('hex'),locatorSha256={};
for(const file of ['static/inverse/core/crop.js','static/inverse/locator/locator.js','static/inverse/locator/palette.js','static/inverse/locator/fields.js','static/inverse/locator/math.js','static/inverse/locator/grid-refine.js','scripts/inverse/hunodan-corpus.mjs'])locatorSha256[file]=hash(await fs.readFile(file));
const contact=createCanvas(1200,Math.ceil(catalog.images.length/4)*365),ctx=contact.getContext('2d');ctx.fillStyle='#f3f4ef';ctx.fillRect(0,0,contact.width,contact.height);
for(const[i,e]of catalog.images.entries()){
 const im=await loadImage(e.file),flag=e.id.startsWith('hjfla'),roi=flag?[0,Math.round(im.height*.52),im.width,im.height]:[Math.floor(im.width*.36),0,im.width,im.height],c=createCanvas(roi[2]-roi[0],roi[3]-roi[1]),cx=c.getContext('2d');cx.drawImage(im,-roi[0],-roi[1]);
 const input={type:'pixels',imageWidth:c.width,imageHeight:c.height,rgba:cx.getImageData(0,0,c.width,c.height).data},crop=detectHeartCrops(input),candidate=crop.candidates[0];
 const row={id:e.id,source:e.file,sourceSha256:e.sha256,photoROI:roi,photoFile:`${out}/${e.id}-photo.png`,decodedPixelsSha256:hash(input.rgba),crop};rows.push(row);await fs.writeFile(row.photoFile,c.toBuffer('image/png'));
 const x=i%4*300,y=Math.floor(i/4)*365,scale=Math.min(290/c.width,290/c.height);ctx.fillStyle='#172b33';ctx.font='16px sans-serif';ctx.fillText(`${e.id} · ${crop.status}`,x+5,y+19);ctx.drawImage(c,x+5,y+29,c.width*scale,c.height*scale);
 if(candidate){input.quad=candidate.quad;ctx.strokeStyle='#e600b0';ctx.lineWidth=1.5;ctx.beginPath();candidate.quad.forEach((p,j)=>{if(j)ctx.lineTo(x+5+p[0]*scale,y+29+p[1]*scale);else ctx.moveTo(x+5+p[0]*scale,y+29+p[1]*scale);});ctx.closePath();ctx.stroke();
  const n=300,rgb=rectify(input.rgba,c.width,c.height,n,candidate.quad),cc=createCanvas(n,n),ct=cc.getContext('2d'),pixels=ct.createImageData(n,n);for(let j=0;j<n*n;j++){pixels.data.set(rgb.slice(j*3,j*3+3),j*4);pixels.data[j*4+3]=255;}ct.putImageData(pixels,0,0);await fs.writeFile(`${out}/${e.id}-rectified.png`,cc.toBuffer('image/png'));
 }
 console.log(e.id,crop.status,!!candidate);
}
await fs.writeFile(`${out}/contact.jpg`,contact.toBuffer('image/jpeg',{quality:.92}));await fs.writeFile(`${out}/cases.json`,JSON.stringify({locatorSha256,description:'All 27 paired sources. Only the photograph region is exposed to the locator and reconstructors. Published templates remain validation references.',cases:rows},null,2));console.log(out);
