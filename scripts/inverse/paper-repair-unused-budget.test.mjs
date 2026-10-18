import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {finish} from '../../static/inverse/core/engine.js';
import {renderExportedWeave} from './export-renderer.mjs';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/paper-repair-unused-budget.json',import.meta.url)));
function input(){
  const solution=loadSolutionJSON(fixture.geometry),source={resolution:fixture.source.resolution};
  for(const [name,array]of Object.entries(fixture.source.arrays)){
    const bytes=Uint8Array.from(inflateSync(Buffer.from(array.deflate,'base64')));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),array.sha256);
    source[name]=new ({Uint8Array,Float32Array}[array.type])(bytes.buffer);
    assert.equal(source[name].length,array.length);
  }
  solution.graph.target.sourceImage=source;return solution;
}

test('final repair uses unused caller time to reconnect a real floating core',async t=>{
  await loadNumericalKernel();
  const solution=input(),before=solutionJSON(solution),source=structuredClone(solution.graph.target.sourceImage);
  const initial=finalMaterialAudit(solution,fixture.settings);
  assert.equal(initial.summary.latticeStatus,'pass');assert.equal(initial.offset.status,'fail');
  assert.equal(initial.offset.families[1].significantFloatingCount,2);
  assert.ok(Math.abs(initial.offset.families[1].significantFloatingArea-fixture.originalFloatingArea)<1e-8);
  // Fixed work verifies the geometry independently of shared CPU speed.
  // Fresh-photograph tests separately exercise the real requested deadline.
  t.mock.method(performance,'now',()=>0);
  const answer=finish(solution,fixture.settings,()=>{},{refine:false,deadline:6000});
  const repair=answer.report.finalPaperRepair,attempt=repair.attempts[0];
  assert.equal(repair.budgetMilliseconds,4500);
  assert.equal(repair.accepted,true);assert.ok(attempt.refinement.steps>5);
  assert.ok(Object.values(attempt.gates).every(Boolean));
  assert.equal(answer.report.templateChecksPassed,true);
  assert.equal(answer.report.manufacturing.offset.status,'pass');
  assert.equal(answer.report.manufacturing.latticeStatus,'pass');
  const woven=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);
  const error=woven.mask.reduce((s,v,i)=>s+Number(v!==source.mask[i]),0)/source.mask.length;
  assert.ok(error<=fixture.originalError,`Independent error ${error} must not exceed ${fixture.originalError}.`);
  assert.deepEqual(solutionJSON(solution),before);assert.deepEqual(solution.graph.target.sourceImage,source);
});

test('unused-time repair cannot borrow beyond an expired caller deadline',async t=>{
  await loadNumericalKernel();t.mock.method(performance,'now',()=>1000);
  const solution=input(),answer=finish(solution,fixture.settings,()=>{},{refine:false,deadline:1000});
  assert.equal(answer.report.finalPaperRepair.budgetMilliseconds,0);
  assert.equal(answer.report.finalPaperRepair.attempted,false);
  assert.equal(answer.report.finalPaperRepair.rejected,'deadline');
  assert.equal(answer.report.templateChecksPassed,false);
  assert.equal(answer.report.manufacturing.offset.status,'fail');
});
