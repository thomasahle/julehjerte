/** Verify the migrated upload path against the predeclared fifty-case policy.
 * Cached legacy crops and real-browser model outputs isolate the integration;
 * separate browser QA exercises uncached detection, actual ONNX and the UI.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {detectPhotoCrops} from '../../../static/inverse/neural/photo-crop.js';
import {supportedBodyOutline,supportedCropOutline} from '../../../static/inverse/core/crop.js';
import {prepare} from '../../../static/inverse/core/engine.js';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.deepEqual(Object.keys(args).sort(),['output','plan']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const checked=async p=>{const b=await fs.readFile(p.path);assert.equal(hash(b),p.sha256,p.path);return b;};
const planBytes=await fs.readFile(args.plan),plan=JSON.parse(planBytes);
assert.equal(plan.schema,'outline-upload-migration-plan-1');
const fresh=JSON.parse(await checked(plan.freshReconstruction));
const report={schema:'outline-upload-replay-1',status:'running',plan:{path:args.plan,sha256:hash(planBytes)},
 sourceHashes:{},rows:[],scope:'Cached production crops and actual-browser NN fields; all 50 current or newly fitted crops must match the predeclared selections and classified targets exactly. No timed solver repeats or source copies.'};
for(const root of ['static/inverse/core','static/inverse/locator','static/inverse/neural'])
 for(const name of await fs.readdir(root,{recursive:true})){
  const file=path.join(root,name);
  if((await fs.stat(file)).isFile())report.sourceHashes[file]=hash(await fs.readFile(file));
 }
report.sourceHashes['scripts/inverse/learning/replay-outline-upload.mjs']=hash(await fs.readFile(import.meta.filename));
await fs.writeFile(args.output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
const save=async()=>{
 const data=JSON.stringify(report,null,2)+'\n';assert.ok(Buffer.byteLength(data)<=plan.resources.newArtifactBudgetMiB*1024**2);
 await fs.writeFile(args.output,data);
};
try{
 for(let ci=0;ci<plan.referencePipelines.length;ci++){
  const baseline=JSON.parse(await checked(plan.referencePipelines[ci]));
  const oldPlan=JSON.parse(await checked(baseline.plan)),probe=JSON.parse(await checked(oldPlan.probe));
  const outline=JSON.parse(await checked(plan.referenceDiagnostics[ci]));
  for(const input of probe.rows){
   const expected=plan.expectedCases.find(r=>r.id===input.id);assert.ok(expected);
   const old=baseline.rows.find(r=>r.id===input.id&&r.method==='fallback');
   const original=baseline.rows.find(r=>r.id===input.id&&r.method==='production');
   const proposal=outline.rows.find(r=>r.id===input.id);
   const photo=await loadImage(await checked({path:input.file,sha256:input.photoSha256}));
   assert.deepEqual([photo.width,photo.height],input.dimensions);
   const canvas=createCanvas(photo.width,photo.height),ctx=canvas.getContext('2d');ctx.drawImage(photo,0,0);
   const rgba=ctx.getImageData(0,0,photo.width,photo.height).data,rgb=Buffer.alloc(photo.width*photo.height*3);
   for(let i=0;i<photo.width*photo.height;i++)for(let k=0;k<3;k++)rgb[3*i+k]=rgba[4*i+k];
   assert.equal(hash(rgb),input.decodedRGBSha256);
   const asset=input.assets['probability.f32'],bytes=await checked({path:path.join(path.dirname(oldPlan.probe.path),asset.path),sha256:asset.sha256});
   assert.equal(bytes.length,probe.resolution**2*4);
   const body={probability:Float32Array.from({length:bytes.length/4},(_,i)=>bytes.readFloatLE(4*i)),
    resolution:probe.resolution,window:input.window,modelSha256:probe.fieldOrigin.modelSha256};
   const detection=original.assets['detection.json'];
   const production=JSON.parse(await checked({path:path.join(path.dirname(plan.referencePipelines[ci].path),detection.path),sha256:detection.sha256}));
   const source={type:'pixels',rgba,imageWidth:photo.width,imageHeight:photo.height},started=performance.now();
   const actual=await detectPhotoCrops(source,{productionCrop:()=>production,predictBody:()=>body});
   const candidate=actual.candidates[0],row={id:input.id,seconds:(performance.now()-started)/1000,
    selected:actual.bodyReview?.selected,status:actual.status,quad:candidate?.quad??null,decision:actual.bodyReview};
   report.rows.push(row);
   assert.equal(row.selected==='outline',expected.selectOutline,input.id);
   const target=expected.selectOutline?fresh.rows.find(r=>r.id===input.id):old;assert.ok(target);
   const expectedQuad=expected.selectOutline?proposal.detection.candidates[0].quad:expected.originalQuad;
   assert.deepEqual(candidate?.quad??null,expectedQuad,input.id);
   assert.deepEqual(candidate?.quad??null,target.selectedCrop?.quad??null,input.id+' fitted crop');
   row.cropExact=true;
   if(expected.selectOutline){
    assert.equal(candidate.needsReview,true);
    assert.equal(actual.status,'needs_review');
    assert.equal(supportedBodyOutline(candidate.locator),true);
    assert.equal(supportedCropOutline(candidate.locator),false);
    assert.deepEqual(candidate.locator.evidence.capColourLoss,[]);
   }
   if(target.targetMaskSha256){
    const pre=prepare({...source,quad:candidate.quad,cropProvenance:candidate.provenance},baseline.configuration);
    row.maskSha256=hash(pre.preview.mask);
    assert.equal(row.maskSha256,target.targetMaskSha256,input.id+' classified target');
    row.maskExact=true;
   }
   await save();console.log(input.id,row.selected,'crop exact',row.maskExact?'mask exact':'no prior target');
  }
 }
 assert.deepEqual(report.rows.map(r=>r.id),plan.expectedCases.map(r=>r.id));
 for(const [file,digest] of Object.entries(report.sourceHashes))assert.equal(hash(await fs.readFile(file)),digest,file);
 report.status='complete';report.passed=true;await save();
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}
