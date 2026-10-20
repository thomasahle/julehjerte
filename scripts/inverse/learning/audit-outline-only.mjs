/** Fixed-cohort diagnosis; proposals never change application selections. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {detectProjectiveBody,supportedBodyOutline} from './projective-body.mjs';
import {wholeBodyEvidence} from '../../../static/inverse/neural/crop-selection.js';
import {overlapCoverage} from '../../../static/inverse/core/crop-coverage.js';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.deepEqual(Object.keys(args).sort(),['output','plan']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const checked=async p=>{const b=await fs.readFile(p.path);assert.equal(hash(b),p.sha256,p.path);return b;};
const planBytes=await fs.readFile(args.plan),plan=JSON.parse(planBytes);
assert.equal(plan.schema,'outline-only-diagnostic-1');
for(const [file,sha256] of Object.entries(plan.sourcePins))await checked({path:file,sha256});
const probe=JSON.parse(await checked(plan.probe)),baseline=JSON.parse(await checked(plan.baseline));
assert.equal(probe.status,'complete');assert.equal(baseline.status,'complete');
assert.deepEqual(probe.rows.map(r=>r.id),plan.ids);
const result={schema:'outline-only-diagnostic-1',status:'running',plan:{path:args.plan,sha256:hash(planBytes)},rows:[],scope:plan.scope};
await fs.writeFile(args.output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
const save=async()=>{const text=JSON.stringify(result,null,2)+'\n';assert.ok(Buffer.byteLength(text)<=plan.maximumNewArtifactBytes);await fs.writeFile(args.output,text);};
try{
 for(const row of probe.rows){
  const photo=await checked({path:row.file,sha256:row.photoSha256}),im=await loadImage(photo),canvas=createCanvas(im.width,im.height),ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
  assert.deepEqual([im.width,im.height],row.dimensions);const rgba=ctx.getImageData(0,0,im.width,im.height).data;
  const rgb=Buffer.alloc(im.width*im.height*3);for(let i=0;i<im.width*im.height;i++)for(let c=0;c<3;c++)rgb[i*3+c]=rgba[i*4+c];assert.equal(hash(rgb),row.decodedRGBSha256);
  const asset=row.assets['probability.f32'],bytes=await checked({path:path.join(path.dirname(plan.probe.path),asset.path),sha256:asset.sha256});assert.equal(bytes.length,probe.resolution**2*4);
  const body={probability:Float32Array.from({length:bytes.length/4},(_,i)=>bytes.readFloatLE(4*i)),resolution:probe.resolution,window:row.window};
  const input={type:'pixels',rgba,imageWidth:im.width,imageHeight:im.height};
  const detection=await detectProjectiveBody(input,{...body,outerBoundarySampling:true}),candidate=detection.candidates[0];
  const evidence=wholeBodyEvidence(candidate,{...body,imageWidth:im.width,imageHeight:im.height,weighting:'balanced-confidence'});
  const coverage=overlapCoverage(candidate?.quad,im.width,im.height),supported=supportedBodyOutline(detection.proposal);
  const geometricProposal=supported&&evidence.passed&&coverage?.observedFraction>=.99&&coverage.maximumExtrapolation<=.05;
  const previous=baseline.rows.find(r=>r.id===row.id);assert.ok(previous);
  result.rows.push({id:row.id,previous:{status:previous.status,selected:previous.selected,bodyReview:previous.decision,learnedReason:previous.learned?.reason??null},detection,bodyEvidence:evidence,coverage,geometricProposal});
  await save();console.log(row.id,'outline-only',geometricProposal?'supported geometric proposal':detection.reason??'body/coverage rejected');
 }
 for(const [file,sha256] of Object.entries(plan.sourcePins))await checked({path:file,sha256});
 result.status='complete';await save();
}catch(error){result.status='failed';result.error=error.message;await save();throw error;}
