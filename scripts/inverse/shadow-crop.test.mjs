import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {correlatedBackground,colorDifferenceMetric} from '../../static/inverse/locator/background.js';
import {detectHeartCrops,supportedCropOutline} from '../../static/inverse/core/crop.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {labelsForCrop} from './learning/photo-labels.mjs';
import {captureFitFailure} from './diagnostics/fit-failure.mjs';

test('background colour metric prefers a paper hue edge over a stronger shadow step',()=>{
  const background=[.45,.25,.50],samples=Array.from({length:400},(_,i)=>background.map(v=>v*(1+.2*Math.sin(i*.7))));
  const model=correlatedBackground(samples),metric=colorDifferenceMetric(model.covariance);
  const shadow=background.map(v=>v*.22),paper=[-.08,.02,-.04];
  assert.ok(Math.hypot(...shadow)>Math.hypot(...paper),'RGB contrast would choose the shadow.');
  assert.ok(metric(paper)>3.5);assert.ok(metric(shadow)<3.5);
  assert.ok(metric(paper)>3*metric(shadow));
  assert.equal(metric(paper),metric(paper.map(v=>-v)),'Either edge direction uses the same metric.');
});

const labels=JSON.parse(await fs.readFile(new URL('./fixtures/locator/shadow-frame.json',import.meta.url)));
async function decode(name,sha){
  const bytes=await fs.readFile(new URL(`./fixtures/locator/${name}`,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),sha);
  const image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  return{width:image.width,height:image.height,data:ctx.getImageData(0,0,image.width,image.height).data};
}

test('a cast shadow does not move the physical corners across exposure changes',async()=>{
  const image=await decode('shadow-frame.jpg',labels.photoSha256);
  for(const gain of [.9,1,1.1]){
    const rgba=image.data.slice();for(let i=0;i<rgba.length;i++)if(i%4<3)rgba[i]*=gain;
    const before=rgba.slice(),candidate=detectHeartCrops({imageWidth:image.width,imageHeight:image.height,rgba}).candidates[0];
    assert.ok(candidate,`gain ${gain}`);assert.ok(supportedCropOutline(candidate.locator));
    const error=Math.max(...labels.knownPixelEdgeCorners.map((p,i)=>Math.hypot(p[0]-candidate.quad[i][0],p[1]-candidate.quad[i][1])));
    assert.ok(error<3,`gain ${gain}: ${error} px`);assert.deepEqual(rgba,before);
  }
});

test('automatic shadowed-frame crop recovers two matching cuts per sheet',async t=>{
  const image=await decode('shadow-frame.jpg',labels.photoSha256),source={type:'pixels',imageWidth:image.width,imageHeight:image.height,rgba:image.data};
  const candidate=detectHeartCrops(source).candidates[0],cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,resolution:384};
  const prepared=prepare({...source,quad:candidate.quad},cfg),answer=await design(prepared.target,cfg);
  try{
  assert.equal(answer.report.templateChecksPassed,true);assert.equal(answer.report.manufacturing.status,'pass');
  assert.deepEqual(answer.report.slits,{left:2,right:2});assert.equal(answer.report.solver.matchingPreference.identical,true);
  const matching=answer.report.solver.matchingPreference;
  assert.equal(matching.maximumAdditionalImageError,.01);assert.ok(matching.additionalImageError<=.01);
  for(const attempt of matching.attempts)if(attempt.nearLimitRecovery){
    assert.ok(attempt.previousImageError>matching.maximumMatchingImageError,'An unfinished near miss is never an accepted template.');
    assert.ok(attempt.steps<=attempt.maximumSteps&&attempt.maximumSteps<=600);
    assert.ok(attempt.withinAllowance&&attempt.featuresPassed&&attempt.geometryPassed&&attempt.paperPassed);
  }
  assert.deepEqual(answer.report.input.sourceImage.cropCorners,candidate.quad);
  const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],384);
  let sourceWrong=0;for(let i=0;i<rendered.mask.length;i++)sourceWrong+=rendered.mask[i]!==prepared.preview.mask[i];
  assert.ok(sourceWrong/rendered.mask.length<.02);
  // Only now load the original artwork. Neither its corners nor mask enter
  // detection or fitting; score in physical coordinates to expose a bad crop.
  const canonical=await decode('shadow-frame-artwork.png',labels.artworkSha256),reference=labelsForCrop(labels,candidate.quad,canonical,384,image.width,image.height);
  let wrong=0,count=0;for(let i=0;i<rendered.mask.length;i++)if(reference.valid[i]){count++;wrong+=rendered.mask[i]!==reference.target[i];}
  assert.ok(Math.min(wrong,count-wrong)/count<.01,`${wrong}/${count} pixels disagree with the original artwork.`);
  t.diagnostic(JSON.stringify({solverSeconds:answer.report.solver.seconds,imageError:sourceWrong/rendered.mask.length,cleanupBudget:answer.report.solver.cleanupBudget,matchingPreference:answer.report.solver.matchingPreference}));
  }catch(error){
    t.diagnostic(await captureFitFailure({answer,source:prepared.target.sourceImage,context:{fixture:'shadow-frame',detectedQuad:candidate.quad,assertion:error.message}}));throw error;
  }
});
