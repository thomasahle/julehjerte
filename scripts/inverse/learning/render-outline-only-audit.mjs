/** Photographic evidence panels; all source hashes come from the saved audit. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.deepEqual(Object.keys(args).sort(),['output','report']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const checked=async p=>{const b=await fs.readFile(p.path);assert.equal(hash(b),p.sha256,p.path);return b;};
const bytes=await fs.readFile(args.report),report=JSON.parse(bytes);assert.equal(report.status,'complete');
const plan=JSON.parse(await checked(report.plan)),probe=JSON.parse(await checked(plan.probe)),baseline=JSON.parse(await checked(plan.baseline));
const previous=JSON.parse(await checked(baseline.reports[0]));
await fs.mkdir(args.output,{recursive:false});
const index={schema:'outline-only-gallery-1',report:{path:args.report,sha256:hash(bytes)},pages:[],rows:[],
 scope:'Original photo; saved NN body probability (white=paper); current crop in cyan and diagnostic body-only crop in orange. These are proposals, not known corners or reconstructed templates.'};
const cell=420,height=390;
for(let first=0;first<report.rows.length;first+=5){
 const rows=report.rows.slice(first,first+5),canvas=createCanvas(cell*3,rows.length*height),ctx=canvas.getContext('2d');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font='15px sans-serif';
 for(let j=0;j<rows.length;j++){
  const r=rows[j],row=probe.rows.find(x=>x.id===r.id);assert.ok(row);
  const im=await loadImage(await checked({path:row.file,sha256:row.photoSha256}));
  const asset=row.assets['probability.f32'],data=await checked({path:path.join(path.dirname(plan.probe.path),asset.path),sha256:asset.sha256});
  const field=createCanvas(probe.resolution,probe.resolution),fc=field.getContext('2d'),pixels=fc.createImageData(probe.resolution,probe.resolution);
  for(let i=0;i<probe.resolution**2;i++){const p=Math.round(255*data.readFloatLE(4*i));pixels.data.set([p,p,p,255],4*i);}fc.putImageData(pixels,0,0);
  const scale=Math.min((cell-12)/im.width,(height-62)/im.height),w=im.width*scale,h=im.height*scale,y=j*height+48;
  const x=k=>k*cell+(cell-w)/2;
  ctx.fillStyle='#111';ctx.fillText(r.id,8,j*height+18);ctx.fillText('NN probability',cell+8,j*height+18);
  ctx.fillText(r.geometricProposal?'Supported geometric proposal':'Unresolved / incomplete coverage',cell*2+8,j*height+18);
  ctx.fillStyle='#555';ctx.fillText('Photo',8,j*height+38);ctx.fillText('Cyan: current. Orange: outline-only.',cell*2+8,j*height+38);
  ctx.drawImage(im,x(0),y,w,h);ctx.drawImage(field,x(1),y,w,h);ctx.drawImage(im,x(2),y,w,h);
  const quad=(q,color,dash=[])=>{
   if(!q)return;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash(dash);ctx.beginPath();
   q.forEach(([px,py],i)=>i?ctx.lineTo(x(2)+px*scale,y+py*scale):ctx.moveTo(x(2)+px*scale,y+py*scale));ctx.closePath();ctx.stroke();ctx.setLineDash([]);
  };
  const old=previous.rows.find(a=>a.id===r.id&&a.method==='fallback');
  quad(old.selectedCrop?.quad,'#00d8ff');
  quad(r.detection.candidates[0]?.quad??r.detection.proposal.evidence?.rejectedQuad,'#ff7a00',r.geometricProposal?[]:[5,4]);
  index.rows.push({id:r.id,page:index.pages.length+1,row:j+1,geometricProposal:r.geometricProposal});
 }
 const file=`page-${index.pages.length+1}.png`,png=canvas.toBuffer('image/png');
 await fs.writeFile(path.join(args.output,file),png);index.pages.push({file,sha256:hash(png),bytes:png.length});
}
assert.ok(index.pages.reduce((s,p)=>s+p.bytes,0)+bytes.length<=plan.maximumNewArtifactBytes);
await fs.writeFile(path.join(args.output,'manifest.json'),JSON.stringify(index,null,2)+'\n');
console.log(JSON.stringify({pages:index.pages.length,photos:index.rows.length,bytes:index.pages.reduce((s,p)=>s+p.bytes,0)}));
