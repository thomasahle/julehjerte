/** Replays the local individual photos through automatic and rough-ROI fitting.
 * Stored quads supply rough selections and visual guides, not fitting controls.
 */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {detectHeartCrops,regionFromQuad} from '../../static/inverse/core/crop.js';
const runId=new Date().toISOString().replace(/[:.]/g,'-'),output=`tmp/inverse-palette/${runId}`;
await fs.mkdir(output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),catalog=JSON.parse(await fs.readFile('scripts/inverse/photo-cases.json')),results=[];
const sourceHashes={};for(const p of ['static/inverse/core/crop.js','static/inverse/locator/locator.js','static/inverse/locator/palette.js','static/inverse/locator/fields.js'])sourceHashes[p]=hash(await fs.readFile(p));
const contact=createCanvas(1120,230*catalog.cases.length),ctx=contact.getContext('2d');ctx.fillStyle='#f6f4ef';ctx.fillRect(0,0,contact.width,contact.height);
for(const [row,e]of catalog.cases.entries()){
  const file=`tmp/inverse-hard-photos/sources/${e.id}.png`,bytes=await fs.readFile(file),im=await loadImage(bytes),original=createCanvas(im.width,im.height);original.getContext('2d').drawImage(im,0,0);
  const r={id:e.id,file,sha256:hash(bytes),runs:[]};results.push(r);
  for(const [column,variant]of ['automatic','rough-roi','jpeg-75','half-resolution'].entries()){
    const scale=variant==='half-resolution'?.5:1,canvas=createCanvas(Math.round(im.width*scale),Math.round(im.height*scale)),c=canvas.getContext('2d');c.drawImage(original,0,0,canvas.width,canvas.height);
    if(variant==='jpeg-75')c.drawImage(await loadImage(canvas.toBuffer('image/jpeg',{quality:.75})),0,0);
    const input={imageWidth:canvas.width,imageHeight:canvas.height,rgba:c.getImageData(0,0,canvas.width,canvas.height).data};
    const roi=variant==='rough-roi'?regionFromQuad(input,e.quad):undefined,start=performance.now(),p=detectHeartCrops(input,{roi}),candidate=p.candidates[0];
    const quad=candidate?.quad.map(p=>[p[0]*im.width/canvas.width,p[1]*im.height/canvas.height]),base=r.runs[0]?.quad;
    r.runs.push({variant,status:p.status,seconds:(performance.now()-start)/1000,roi,quad,sourcePixelsSha256:hash(input.rgba),proposal:candidate?.locator,maximumCornerMovement:base&&quad?Math.max(...quad.map((p,i)=>Math.hypot(p[0]-base[i][0],p[1]-base[i][1]))):null});
    const imageScale=Math.min(260/canvas.width,185/canvas.height),x=column*280+10,y=row*230+36;ctx.drawImage(canvas,x,y,canvas.width*imageScale,canvas.height*imageScale);
    if(candidate){ctx.strokeStyle='#00a8ae';ctx.lineWidth=1.5;for(const arc of candidate.outline){ctx.beginPath();arc.forEach((p,i)=>{const q=[x+p[0]*imageScale,y+p[1]*imageScale];if(i)ctx.lineTo(...q);else ctx.moveTo(...q);});ctx.stroke();}ctx.strokeStyle='#ed00b3';ctx.beginPath();candidate.quad.forEach((p,i)=>{const q=[x+p[0]*imageScale,y+p[1]*imageScale];if(i)ctx.lineTo(...q);else ctx.moveTo(...q);});ctx.closePath();ctx.stroke();}
    ctx.fillStyle='#24363e';ctx.font='14px sans-serif';ctx.fillText(`${e.id} · ${variant}`,x,y-19);ctx.fillText(candidate?p.status:'No proposal',x,y-3);
    console.log(e.id,variant,p.status,!!candidate);
  }
}
await fs.writeFile(`${output}/contact.png`,contact.toBuffer('image/png'));
await fs.writeFile(`${output}/results.json`,JSON.stringify({runId,sourceHashes,criteria:'Proposal availability and source-coordinate stability only. Original cutting paths/corner ground truth are unknown; inspect the contact sheet.',results},null,2));
console.log(output);
