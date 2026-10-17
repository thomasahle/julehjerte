import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readHardPhoto,hardPhotoCatalogCases} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {prepare} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {settings} from '../../static/inverse/core/settings.js';
import {referenceError} from '../../static/inverse/core/image-reference.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit,verifiedPaperSettings} from '../../static/inverse/core/material.js';
import {initializeCoarseTopology} from '../../static/inverse/core/direct/topology.js';
import {loadBoundaryKernel} from '../../static/inverse/core/direct/native.js';
import {solverRuntime} from '../../static/inverse/core/solver.js';

const catalog=JSON.parse(await fs.readFile('scripts/inverse/fixtures/user-photos-2026-10-17/artesta-curved-triangles.json'));
const photo=await readHardPhoto(hardPhotoCatalogCases(catalog)[0]);
const raw={...AUTOMATIC_PRESET,timeLimit:40,trials:0},cfg=settings(raw);

for(const mode of ['shared-phase','reserved-tail','expired-request'])test(`late rejected routing respects the ${mode} deadline`,async t=>{
 const input=hardPhotoTarget(prepare({...photo,quad:catalog.cases[0].quad},raw),'mask',raw);
 const source=input.sourceImage,mask=source.mask.slice(),probability=source.probability.slice();
 await loadBoundaryKernel();await solverRuntime();
 const realNow=performance.now.bind(performance),started=realNow(),seconds=30;
 let lateTime=null,proposals=0;
 // Exercise real tracing, MILP and geometry. At its first validation event,
 // jump just past the routing phase and hold the clock there. The repair still
 // has its fixed work bounds; this tests admission, not machine-dependent speed.
 t.mock.method(performance,'now',()=>lateTime??realNow());
 const repairDeadline=mode==='reserved-tail'?started+(seconds+5)*1000:mode==='expired-request'?started+seconds*1000:null;
 const result=await initializeCoarseTopology(input,cfg,{seconds,repairRejected:true,repairDeadline,onProgress:event=>{
  if(event.stage==='validating'&&lateTime===null){lateTime=started+seconds*1000+50;proposals++;}
 }});
 assert.equal(proposals,1,'The fixture must reach an integer routing before the simulated delay.');
 if(mode==='reserved-tail'){
  assert.equal(result.report.accepted,true,JSON.stringify(result.report));
  const routing=result.report.attempts.find(a=>a.routing?.continuousRepair?.accepted)?.routing;
  assert.ok(routing);assert.equal(routing.solver.termination,'rejected_candidate_observer');
  assert.ok(routing.continuousRepair.budgetSeconds>4&&routing.continuousRepair.budgetSeconds<=4.5);
  const solution=result.graph.solution(result.graph.points,result.phase,input),checkedCfg=verifiedPaperSettings(result,cfg);
  assert.equal(validate(solution,checkedCfg).passed,true);assert.equal(materialAudit(solution,checkedCfg).passed,true);
  const rendered=await renderExportedWeave(solutionJSON(solution),source.resolution);
  assert.ok(referenceError(source,rendered.mask).mismatchFraction<.015);
  assert.ok(performance.now()<repairDeadline);
 }else{
  assert.equal(result.graph,undefined);assert.equal(result.report.accepted,false);
  assert.ok(result.report.attempts.some(a=>a.routing));
  assert.ok(result.report.attempts.every(a=>!a.routing?.continuousRepair),'An unavailable repair budget must not start optimization.');
 }
 assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});
