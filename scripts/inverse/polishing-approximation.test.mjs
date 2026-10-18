import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

test('final polishing retains a better legal approximation above the image acceptance limit',async t=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-near-miss-seed.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
  const expected=fixture.translations.horizontal;
  const quad=fixture.quad.map(p=>p.map((v,i)=>v+expected.offset[i]));
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false,preferMatchingSheets:false};
  const prepared=prepare({...photo,quad},cfg),source=prepared.target.sourceImage;
  assert.equal(createHash('sha256').update(source.mask).digest('hex'),expected.maskSha256);
  const mask=source.mask.slice(),probability=source.probability.slice(),checkpoints=[];
  // Fix the work completed before polishing, rather than depending on CPU
  // load to interrupt refinement at a particular checkpoint. No saved cuts
  // enter the fitter; every candidate starts from this photograph and quad.
  // HiGHS uses performance.now() inside Wasm too. Freeze only the curve
  // stages: a deferred routing attempt needs a real, advancing timeout.
  const realNow=performance.now.bind(performance);
  let elapsed=0,interrupted=false,routingStarted=null;
  t.mock.method(performance,'now',()=>elapsed+(routingStarted===null?0:realNow()-routingStarted));
  const answer=await design(prepared.target,cfg,event=>{
    if(event.stage==='solving'&&routingStarted===null)routingStarted=realNow();
    else if(event.stage!=='solving'&&routingStarted!==null){elapsed+=realNow()-routingStarted;routingStarted=null;}
    if(event.stage==='directFitting'&&!elapsed)elapsed=4500;
    if(event.stage==='directRefining'&&event.step===40&&!interrupted){elapsed=7001;interrupted=true;}
  },{onCandidate:c=>checkpoints.push(c)});
  assert.ok(interrupted);
  const polished=checkpoints.filter(c=>c.stage==='directPolishing').sort((a,b)=>a.error-b.error)[0];
  assert.ok(polished,'The ordinary polishing phase must complete a checked candidate.');
  const woven=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);
  const preview=await renderExportedWeave(polished.geometry,source.resolution);
  const error=mask=>mask.reduce((sum,v,i)=>sum+Number(v!==source.mask[i]),0)/source.mask.length;
  const finalError=error(woven.mask),polishedError=error(preview.mask);
  const before=answer.report.solver.candidates[0].sourceImageError;
  t.diagnostic(JSON.stringify({before,polishedError,finalError}));
  assert.ok(polishedError>answer.report.settings.maxImageError,'This case must remain an approximation.');
  assert.ok(before-polishedError>.005,'Polishing must offer a measurable improvement.');
  assert.ok(finalError<=polishedError+.001,JSON.stringify({before,polishedError,finalError}));
  assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.manufacturing.status,'pass');
  assert.equal(answer.report.imageFidelity.features.passed,true);
  assert.equal(answer.report.templateChecksPassed,false,'The unchanged image limit must still warn about this result.');
  assert.equal(answer.report.solver.termination,'image_mismatch');
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});
