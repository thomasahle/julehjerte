import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';

test('a finer-verified supported grid stops before other counts that cannot displace it',async t=>{
  const catalogue=JSON.parse(await fs.readFile('scripts/inverse/fixtures/hunodan/speed-crops.json'));
  const entry=catalogue.cases.find(c=>c.id==='hjcur-02'),bytes=await fs.readFile(entry.source);
  const hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(bytes),entry.sourceSha256);
  const image=await loadImage(bytes),[x,y,x1,y1]=entry.photoROI,canvas=createCanvas(x1-x,y1-y),ctx=canvas.getContext('2d');ctx.drawImage(image,-x,-y);
  const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;assert.equal(hash(rgba),entry.decodedPixelsSha256);
  const cfg={...AUTOMATIC_PRESET,timeLimit:180,trials:0,earlyStop:false,preferMatchingSheets:true,matchingErrorAllowance:.01,progressGeometry:true,materialResolution:360,removeSpecks:0,fillHoles:0};
  const photo=prepare({type:'pixels',imageWidth:canvas.width,imageHeight:canvas.height,rgba,quad:entry.quad},cfg);
  // The browser paints an enlargement, but its unchanged import retains this
  // native binary source. No saved cutting geometry initializes the fit.
  assert.equal(hash(photo.preview.mask),'ee27e7b1a962204080c43d064b331286e929ae897f20ff8f5ac082e961caf4de');
  const n=photo.preview.resolution,mask=photo.preview.mask.slice(),input=prepare({type:'mask',mask,resolution:n},cfg);
  const retained=[];const answer=await design(input.target,cfg,()=>{},{onCandidate:p=>retained.push(p)}),solver=answer.report.solver;
  let exportedError=null;
  try{
    assert.equal(answer.report.templateChecksPassed,true);assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
    // Measure the actual output before checking its search provenance. A timed
    // metadata failure must not hide whether the returned cuts were any good.
    const exported=loadSolutionJSON(answer.files['cut_geometry.json']);
    assert.equal(validate(exported,answer.report.settings,{checkImage:false,finalGeometry:true}).passed,true);
    assert.equal(finalMaterialAudit(exported,answer.report.settings).status,'pass');
    const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],n);
    exportedError=rendered.mask.reduce((sum,v,i)=>sum+(v!==mask[i]),0)/mask.length;
    assert.ok(exportedError<.0055,`Independent export disagreement ${exportedError} must retain the established fit.`);
    assert.equal(auditFeatureFidelity(input.target.sourceImage,rendered.mask,answer.report.settings).passed,true);
    assert.equal(solver.paperVerification.requestedResolution,360);assert.equal(solver.paperVerification.resolution,700);
    assert.deepEqual(solver.supportedBorderCounts,[4,4]);assert.deepEqual(answer.report.slits,{left:4,right:4});
    const bound=solver.countSearchBound;assert.equal(bound.reason,'supported-count-error-bound');assert.deepEqual(bound.counts,[4,4]);
    assert.ok(bound.sourceImageError>=0&&bound.sourceImageError<=bound.allowance);
    assert.ok(bound.skippedFineCounts.length>0);assert.ok(bound.skippedFineCounts.every(counts=>counts.some((count,i)=>count!==bound.counts[i])));
    // This used to refine two five-cut grids after the four-cut candidate had
    // already earned the final preference, adding roughly eight seconds.
    assert.equal(solver.stages.filter(stage=>stage.stage==='directRefining').length,1);
    assert.ok(retained.some(p=>p.materialResolution===700),'The now-verified candidate must remain available to Stop.');
    assert.deepEqual(input.target.sourceImage.mask,photo.preview.mask);
  }catch(error){
    t.diagnostic(JSON.stringify({fixture:'hunodan-hjcur-02-supported-count-bound',maskSha256:hash(mask),exportedError,report:answer.report,cutGeometry:JSON.parse(answer.files['cut_geometry.json'])}));
    throw error;
  }
});
