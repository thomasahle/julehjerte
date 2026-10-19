import test from 'node:test';
import {qualityBenchmark} from './quality-benchmark.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readHardPhoto,hardPhotoCatalogCases} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {settings} from '../../static/inverse/core/settings.js';
import {referenceError} from '../../static/inverse/core/image-reference.js';
import {featureComponentMetrics} from '../../static/inverse/core/feature-shapes.js';
import {initializeCoarseTopology} from '../../static/inverse/core/direct/topology.js';
import {fitDirect} from '../../static/inverse/core/direct/fit.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {verifiedPaperSettings} from '../../static/inverse/core/material.js';
import {captureFitFailure} from './diagnostics/fit-failure.mjs';

const folder='scripts/inverse/fixtures/user-photos-2026-10-17/';
const catalog=JSON.parse(await fs.readFile(folder+'curved-triangles.json'));
const quad=JSON.parse(await fs.readFile(folder+'curved-triangles-corners.json'))[0].quad;
const photo=await readHardPhoto(hardPhotoCatalogCases(catalog)[0]);
const raw={...AUTOMATIC_PRESET,timeLimit:30,trials:0},cfg=settings(raw);
const input=()=>hardPhotoTarget(prepare({...photo,quad},raw),'mask',raw);

test('coarse recovery preserves observed pixels and cannot use arbitrary missing colours as evidence',async()=>{
 const target=input(),source=target.sourceImage,mask=source.mask.slice(),probability=source.probability.slice();
 const changed={...target,sourceImage:{...source,
  mask:Uint8Array.from(mask,(v,i)=>source.validMask[i]?v:1-v),
  probability:Float32Array.from(probability,(v,i)=>source.validMask[i]?v:1-v)}};
 const options={repairRejected:true,maximumError:0,seconds:5};
 const a=await initializeCoarseTopology(target,cfg,options),b=await initializeCoarseTopology(changed,cfg,options);
 assert.ok(a.report.attempts.length>0);assert.deepEqual(a.report.attempts,b.report.attempts);
 assert.ok(a.report.attempts.every(a=>!a.routing));assert.equal(a.graph,undefined);assert.equal(b.graph,undefined);
 assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
 const editable={...target,sourceImage:{...source,weights:source.weights.slice()}};
 editable.sourceImage.weights[source.validMask.findIndex(v=>v===1)]=0;
 const rejected=await initializeCoarseTopology(editable,cfg,options);
 assert.equal(rejected.graph,undefined);assert.deepEqual(rejected.report.attempts,[]);
});

qualityBenchmark('fresh automatic fitting repairs a rejected circular routing before common Bezier refinement',async t=>{
 const target=input(),source=target.sourceImage,mask=source.mask.slice(),valid=source.validMask.slice(),weights=source.weights.slice();
 assert.equal(createHash('sha256').update(mask).digest('hex'),'77de47c5de58acf92d0733486f4458530905d7c847f34d6af49557cca0ca7e42');
 assert.equal(valid.reduce((s,v)=>s+v,0),159945);
 // Only the screenshot and its preselected UI-square coordinates enter design.
 // No saved routing, hand-picked slit count or idealized circles are loaded.
 const answer=await design(target,cfg),report=answer.report;
 try{
  assert.equal(report.templateChecksPassed,true);
  const recovery=report.solver.coarseTopologyInitialization;
  assert.equal(recovery?.accepted,true);
  const repair=recovery.attempts.find(a=>a.routing?.continuousRepair?.accepted)?.routing;
  assert.ok(repair);assert.equal(repair.continuousRepair.projection.accepted,true);
  assert.equal(repair.solver.termination,'rejected_candidate_observer','The invalid MILP proposal must stay rejected.');
  const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);
  assert.ok(referenceError(source,rendered.mask).mismatchFraction<.015,'The unchanged pipeline was at 2.83%.');
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.validMask,valid);assert.deepEqual(source.weights,weights);
 }catch(error){t.diagnostic(await captureFitFailure({answer,source,context:{assertion:error.message}}));throw error;}
});

qualityBenchmark('a fully observed mask refines or replaces corner routing without opening its enclosed regions',async t=>{
 const extracted=input().sourceImage,mask=extracted.mask.slice();
 // This is the browser's whole-picture variant: its PNG supplies colours for
 // all pixels, including the tiny tip excluded by the screenshot diagnostic.
 const target=prepare({type:'mask',mask,resolution:extracted.resolution},raw).target;
 const answer=await design(target,cfg),comparison=answer.report.solver.cornerTopologyComparison;
 try{
  assert.equal(answer.report.templateChecksPassed,true);
  // A faster clearance audit can leave enough time for the first routing to
  // meet the comparison threshold. Test its quality, not wall-clock routing.
  if(comparison){
   assert.equal(comparison.selected,true);assert.equal(comparison.featuresPreserved,true);
   if(comparison.beforeImageError!==null)assert.ok(comparison.imageError<comparison.beforeImageError);
   else assert.equal(comparison.trigger,'no_checked_corner_routing');
  }else{
   assert.ok(answer.report.solver.cornerTopologyInitialization.imageError<=.015);
  }
  const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],extracted.resolution);
  assert.ok(referenceError(target.sourceImage,rendered.mask).mismatchFraction<.015);
  const components=featureComponentMetrics(target.sourceImage,rendered.mask,cfg.width);
  assert.equal(components.length,12);
  for(const component of components){
   assert.ok(component.intersectionPixels>0);
   assert.equal(component.touchesBorder,false,'An enclosed motif became a channel.');
  }
  assert.deepEqual(target.sourceImage.mask,mask);
 }catch(error){t.diagnostic(await captureFitFailure({answer,source:target.sourceImage,context:{assertion:error.message}}));throw error;}
});

qualityBenchmark('an exhausted corner MILP leaves the remaining caller allowance for fresh coarse routing',async t=>{
 const extracted=input().sourceImage,mask=extracted.mask.slice();
 const target=prepare({type:'mask',mask,resolution:extracted.resolution},raw).target;
 const now=performance.now.bind(performance);let delay=0,calls=0;
 t.mock.method(performance,'now',()=>now()+delay);
 // Reproduce the failed stage's elapsed time and absence of an integer
 // solution. All following tracing, MILP, curve fitting and checks are real;
 // no reference templates or hand-picked slit counts enter the recovery.
 const cornerRecovery=async(_input,_cfg,{seconds,routingSeconds})=>{
  assert.ok(routingSeconds<=.35*cfg.timeLimit,'Reserve the rest for coarse routing, curve refinement and export.');
  assert.ok(seconds-routingSeconds>=5,'An integer proposal arriving late still needs time for repair.');
  calls++;delay+=routingSeconds*1000;
  return{solution:null,report:{accepted:false,seconds:routingSeconds,reason:'no_checked_routing',routing:{status:'no_validated_solution',termination:'time_limit'}}};
 };
 const solution=await fitDirect(target,cfg,()=>{},{cornerRecovery}),report=solution.report;
 const serialized=JSON.stringify(solutionJSON(solution)),checked=verifiedPaperSettings(solution,cfg);
 const rendered=await renderExportedWeave(serialized,extracted.resolution);
 const error=referenceError(target.sourceImage,rendered.mask).mismatchFraction;
 try{
  assert.equal(calls,1);assert.equal(report.cornerTopologyInitialization.accepted,false);
  assert.ok(report.cornerTopologyComparison,'A timed-out corner search must not suppress the coarse alternative.');
  assert.equal(report.cornerTopologyComparison.trigger,'no_checked_corner_routing');
  assert.equal(report.cornerTopologyComparison.beforeImageError,null);
  assert.equal(report.cornerTopologyComparison.selected,true);
  assert.equal(validate(solution,checked,{finalGeometry:true}).passed,true);
  assert.equal(finalMaterialAudit(solution,checked).status,'pass');
  assert.ok(error<.015,`The exact failed fit had 2.85% error; recovered error ${error}`);
  const components=featureComponentMetrics(target.sourceImage,rendered.mask,cfg.width);
  assert.equal(components.length,12);
  assert.ok(components.every(c=>c.intersectionPixels>0&&!c.touchesBorder));
  assert.deepEqual(target.sourceImage.mask,mask);
  t.diagnostic(JSON.stringify({case:'exhausted-corner',error,seconds:report.seconds,coarseSeconds:report.cornerTopologyComparison.seconds}));
 }catch(failure){t.diagnostic(await captureFitFailure({answer:{report:{solver:report},files:{'cut_geometry.json':serialized}},source:target.sourceImage,error,maximum:.015,context:{assertion:failure.message}}));throw failure;}
});
