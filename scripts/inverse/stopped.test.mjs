import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures.mjs';
import {finishStopped} from '../../static/inverse/core/stopped.js';
import {solutionJSON,loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {referenceError} from '../../static/inverse/core/image-reference.js';
import {settings} from '../../static/inverse/core/settings.js';
import {renderExportedWeave} from './export-renderer.mjs';

const cfg=extra=>settings({width:60,minWidth:3,cutError:0,printShrinkPercent:0,materialResolution:80,trials:0,preferMatchingSheets:false,...extra});
const packet=(solution,error=0)=>({geometry:JSON.stringify(solutionJSON(solution)),error});
const artwork=solution=>({...solution.graph.target,sourceImage:{resolution:160,mask:sampleWeave(solution,160)}});
const shift=(solution,family,amount)=>{for(const p of solution.graph.edges[solution.paths[family][0][0][0]].curve.p)p[family]+=amount;return solution;};

test('stopping rescored candidates uses the original weighted mask and normal exports',async()=>{
  const solution=fixture('straight'),target=artwork(solution),n=target.sourceImage.resolution;
  target.sourceImage.weights=Float64Array.from({length:n*n},(_,i)=>Number(i%n>15&&i%n<n-16));
  for(let i=0;i<n;i++)target.sourceImage.mask[i*n]^=1;
  for(let y=80;y<88;y++)for(let x=80;x<88;x++)target.sourceImage.mask[y*n+x]^=1;
  const result=await finishStopped(target,cfg(),[packet(solution)]),expected=referenceError(target.sourceImage,sampleWeave(solution,n));
  assert.ok(expected.mismatchFraction>0);
  assert.equal(result.report.imageError.mismatchFraction,expected.mismatchFraction);
  assert.equal(result.report.imageError.editableChangeFraction,expected.editableChangeFraction);
  assert.equal(result.report.alternatives[0].error,expected.mismatchFraction);
  assert.equal(result.report.alternatives[0].checkpointError,0);
  assert.equal(result.report.stoppedEarly,true);assert.equal(result.report.solver.termination,'user_stop');
  assert.ok(result.report.validation.passed);assert.equal(result.report.manufacturing.status,'pass');
  assert.deepEqual(JSON.parse(result.files['report.json']).alternatives,result.report.alternatives);
  const saved=loadSolutionJSON(result.files['cut_geometry.json']);
  assert.deepEqual(sampleWeave(saved,n),sampleWeave(solution,n));
  const exported=await renderExportedWeave(result.files['cut_geometry.json'],n);
  assert.equal(referenceError(target.sourceImage,exported.mask).mismatchFraction,expected.mismatchFraction);
});

test('stopping prefers a retained matching pair only within the one-percent allowance',async()=>{
  const matching=fixture('straight'),independent=shift(fixture('straight'),0,.25),target=artwork(independent);
  const packets=[packet(independent),packet(matching),packet(matching)];
  const accepted=await finishStopped(target,cfg({preferMatchingSheets:true}),packets);
  assert.equal(accepted.report.alternatives.length,2);
  assert.equal(accepted.report.solver.matchingPreference.identical,true);
  assert.ok(accepted.report.imageError.mismatchFraction>0&&accepted.report.imageError.mismatchFraction<=.01);
  assert.equal(accepted.report.alternatives[1].error,0);
  const refused=await finishStopped(target,cfg({preferMatchingSheets:true,matchingErrorAllowance:.005}),packets);
  assert.equal(refused.report.imageError.mismatchFraction,0);
  assert.equal(refused.report.solver.matchingPreference.identical,false);
  const warning=await finishStopped(target,cfg({preferMatchingSheets:true,maxImageError:.003}),packets);
  assert.equal(warning.report.solver.matchingPreference.identical,true);
  assert.equal(warning.report.solver.matchingPreference.maximumMatchingImageError,.01);
  assert.equal(warning.report.imageError.mismatchFraction,accepted.report.imageError.mismatchFraction);
  assert.equal(warning.report.imageFidelity.passed,false);
  assert.equal(warning.report.validation.passed,true);
  assert.equal(warning.report.manufacturing.status,'pass');
  assert.equal(warning.report.templateExportAllowed,true);
  assert.match(warning.report.warnings.join('\n'),/above the 0.30% limit/);
});

test('stopping rejects malformed, geometrically invalid and unsupported paper candidates',async()=>{
  const good=fixture('straight'),bad=fixture('thin'),config=cfg({minWidth:.7});
  assert.ok(validate(bad,config).passed);assert.notEqual(materialAudit(bad,config).status,'pass');
  const crossing=shift(fixture('straight'),0,20);
  const result=await finishStopped(artwork(good),config,[{geometry:'broken'},packet(bad),packet(crossing),packet(good)]);
  assert.equal(result.report.alternatives.length,1);
  assert.equal(result.report.imageError.mismatchFraction,0);
  await assert.rejects(finishStopped(artwork(good),config,[packet(bad)]),error=>error.report?.status==='no_validated_solution'&&error.report?.termination==='user_stop');
});

test('stopping cannot retain a candidate that violates the requested symmetry',async()=>{
  const good=fixture('straight'),bad=shift(fixture('straight'),0,1);
  await assert.rejects(finishStopped(artwork(bad),cfg({symmetry:{transpose:true}}),[packet(bad)]),/validated template/);
  const result=await finishStopped(artwork(bad),cfg({symmetry:{transpose:true}}),[packet(bad),packet(good)]);
  assert.equal(result.report.alternatives.length,1);assert.deepEqual(result.report.symmetry.honoured,['transpose']);
});

test('stopping before a candidate exists reports no solution and finalization can be cancelled',async()=>{
  const source=fixture('straight');
  await assert.rejects(finishStopped(artwork(source),cfg(),[]),error=>error.report?.termination==='user_stop');
  let cancelled=false;
  await assert.rejects(finishStopped(artwork(source),cfg(),[packet(source)],()=>{},{cancelled:()=>cancelled,yieldControl:async()=>{cancelled=true;}}),{name:'AbortError'});
});

test('a rejected final cleanup cannot replace a valid checkpoint with illegal cuts',async()=>{
  const source=fixture('straight');
  const result=await finishStopped(artwork(source),cfg(),[packet(source)],()=>{},{cleanup:solution=>shift(solution,0,20)});
  assert.ok(result.report.validation.passed);assert.equal(result.report.manufacturing.status,'pass');
  assert.equal(result.report.solver.finalizationRejected.geometry,false);
  assert.equal(result.report.imageError.mismatchFraction,0);
  assert.equal(result.report.alternatives.length,1);
});
