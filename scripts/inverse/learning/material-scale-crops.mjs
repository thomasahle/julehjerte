/** Paired full-photo cropping from frozen 256px/512px learned fields. No fitting. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {detectForegroundCrop} from './foreground-crop.mjs';
import {supportedCropOutline} from '../../../static/inverse/core/crop.js';
import {materialMask} from './material-fields.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.run&&args.output&&Object.keys(args).every(k=>['run','output'].includes(k)));
const run=path.resolve(args.run),output=path.resolve(args.output),hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=await fs.readFile(path.join(run,'report.json')),study=JSON.parse(bytes);
assert.equal(study.schema,'material-inference-scale-1');assert.equal(study.status,'complete');
const probe=path.resolve(study.plan.probe),raw=await fs.readFile(path.join(probe,'manifest.json'));
assert.equal(hash(raw),study.plan.probeManifestSha256);const manifest=JSON.parse(raw);
const byId=new Map(study.rows.map(r=>[r.id,r]));
assert.deepEqual(manifest.rows.map(r=>r.id),study.plan.ids);
await fs.mkdir(output,{recursive:false});
const report={schema:'material-inference-scale-crops-1',status:'running',studyReportSha256:hash(bytes),fineMode:study.fineMode??'native',rows:[],sourceHashes:{},
  scope:'Same nineteen full photographs, original held-out weights, 256px versus 512px inference, unchanged geometric support gates. No annotations or target masks enter cropping. Crops are proposals, not physical ground truth. No template fitting or app integration.',
  order:'Rotate inference-size arm order by photograph index. Existing two-second orientation retry budget retained; elapsed time is not a causal latency benchmark.'};
for(const file of [new URL(import.meta.url).pathname,'scripts/inverse/learning/foreground-crop.mjs','scripts/inverse/learning/material-fields.mjs','scripts/inverse/learning/locator-field-source.mjs',
  ...(await fs.readdir('static/inverse',{recursive:true})).filter(p=>/^(core|locator)\/.+\.js$/.test(p)).map(p=>'static/inverse/'+p)])report.sourceHashes[file]=hash(await fs.readFile(file));
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
async function field(base,asset,n){
  const file=path.resolve(base,asset.path);assert.ok(file.startsWith(base+path.sep));
  const data=await fs.readFile(file);assert.equal(hash(data),asset.sha256);assert.equal(data.length,n*n*4);
  return Float32Array.from({length:n*n},(_,i)=>data.readFloatLE(4*i));
}
await save();
try{
  for(const [index,input] of manifest.rows.entries()){
    const sourceBytes=await fs.readFile(input.file);assert.equal(hash(sourceBytes),input.photoSha256);
    const image=await loadImage(sourceBytes);assert.deepEqual([image.width,image.height],input.dimensions);
    const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const rgba=ctx.getImageData(0,0,image.width,image.height).data;
    const rgb=Buffer.alloc(image.width*image.height*3);for(let i=0;i<image.width*image.height;i++)for(let k=0;k<3;k++)rgb[i*3+k]=rgba[i*4+k];
    assert.equal(hash(rgb),input.decodedRGBSha256);
    const source={type:'pixels',imageWidth:image.width,imageHeight:image.height,rgba};
    for(const resolution of index%2?[512,256]:[256,512]){
      const assets=resolution===256?input.assets.candidate:byId.get(input.id).fields,base=resolution===256?probe:run;
      const body=await field(base,assets.body,resolution),material=await field(base,assets.material,resolution);
      const detected=await detectForegroundCrop(source,{probability:body,material,resolution,window:input.window});
      const row={id:input.id,resolution,status:detected.status,supported:supportedCropOutline(detected.proposal),elapsedMs:detected.elapsedMs,
        selectedCrop:detected.candidates[0]??null,reason:detected.reason??null,evidence:detected.proposal.evidence??null,attempts:detected.attempts};
      if(row.selectedCrop){
        const target=materialMask(material,resolution,input.window,row.selectedCrop.quad,400);
        row.targetMaskSha256=hash(target.mask);
        const c=createCanvas(400,400),context=c.getContext('2d'),pixels=context.createImageData(400,400);
        for(let i=0;i<target.mask.length;i++)pixels.data.set(target.mask[i]?[185,19,19,255]:[255,255,255,255],4*i);
        context.putImageData(pixels,0,0);const name=input.id+'-'+resolution+'-mask.png',png=c.toBuffer('image/png');
        await fs.writeFile(path.join(output,name),png);row.mask={path:name,sha256:hash(png)};
      }
      report.rows.push(row);await save();console.log(input.id,resolution,row.status,'supported',row.supported);
    }
  }
  report.summary=Object.fromEntries([256,512].map(n=>[n,{attempted:report.rows.filter(r=>r.resolution===n).length,supported:report.rows.filter(r=>r.resolution===n&&r.supported).length,proposals:report.rows.filter(r=>r.resolution===n&&r.selectedCrop).length}]));
  for(const [file,sha] of Object.entries(report.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
  report.status='complete';await save();console.log(JSON.stringify(report.summary));
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}
