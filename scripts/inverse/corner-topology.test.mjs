import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {recoverCornerTopology} from '../../static/inverse/core/direct/corner-topology.js';
import {featureComponentMetrics} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {captureFitFailure} from './diagnostics/fit-failure.mjs';

test('optional corner recovery skips unavailable time, unknown paper, requested symmetries and unsupported borders',async()=>{
  const n=100,mask=new Uint8Array(n*n),cfg=settings(AUTOMATIC_PRESET);
  for(let y=40;y<60;y++)for(let x=40;x<60;x++)mask[y*n+x]=1;
  const input={sourceImage:{mask,resolution:n}},before=mask.slice();
  for(const seconds of [0,-1,NaN,Infinity]){
    const result=await recoverCornerTopology(input,cfg,{seconds});
    assert.equal(result.solution,null);assert.equal(result.report.reason,'insufficient_time');
  }
  assert.equal((await recoverCornerTopology(input,cfg,{seconds:.001})).report.reason,'insufficient_routing_time');
  assert.equal((await recoverCornerTopology(input,cfg)).report.reason,'no_corner_proposals');
  assert.equal((await recoverCornerTopology({sourceImage:{mask:new Uint8Array(n*n),resolution:n}},cfg)).report.reason,'no_stable_enclosures');
  const weights=new Float64Array(n*n).fill(1);weights[0]=0;
  assert.equal((await recoverCornerTopology({sourceImage:{...input.sourceImage,weights}},cfg)).report.reason,'unsupported_constraints');
  assert.equal((await recoverCornerTopology(input,settings({...cfg,symmetry:{mirrorX:true}}))).report.reason,'unsupported_constraints');
  assert.deepEqual(mask,before);
});

test('automatic fitting recovers four enclosed hearts from fresh corner routing and preserves them through final cleanup',async t=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/stacked-hearts-corner-mask.json'));
  const n=fixture.resolution,mask=new Uint8Array(n*n);let offset=0,value=fixture.first;
  for(const run of fixture.runs){mask.fill(value,offset,offset+run);offset+=run;value^=1;}
  assert.equal(offset,mask.length);assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
  const cfg={...AUTOMATIC_PRESET,timeLimit:30,trials:0,invert:false,removeSpecks:0,fillHoles:0};
  // Only classified pixels enter design(); no stored solution, graph or cuts.
  const input=prepare({type:'mask',mask,resolution:n},cfg).target,before=mask.slice(),probability=input.sourceImage.probability.slice();
  const restricted=await recoverCornerTopology(input,settings({...cfg,maxImageError:.004}));
  assert.equal(restricted.solution,null);assert.equal(restricted.report.reason,'border_change_exceeds_allowance');
  assert.equal(restricted.report.attempts.length,0,'Do not start a MILP for a border proposal outside the source-change allowance.');
  const result=await design(input,cfg),solver=result.report.solver;
  try{
  assert.equal(result.report.templateChecksPassed,true);
  assert.equal(result.report.validation.passed,true);assert.equal(result.report.manufacturing.status,'pass');
  assert.equal(solver.cornerTopologyInitialization.maximumBorderChangeFraction,.005);
  assert.equal(solver.cornerTopologyInitialization.protectedRegions.length,4);
  for(const size of [n,2*n]){
    const reference=Uint8Array.from({length:size*size},(_,i)=>mask[Math.floor(Math.floor(i/size)*n/size)*n+Math.floor(i%size*n/size)]);
    const rendered=await renderExportedWeave(result.files['cut_geometry.json'],size);
    const error=rendered.mask.reduce((sum,v,i)=>sum+Number(v!==reference[i]),0)/reference.length;
    assert.ok(error<.02,`${size}px independent error ${error} exceeds 2%`);
    const features=featureComponentMetrics({mask:reference,resolution:size},rendered.mask);
    assert.equal(features.length,5);
    for(const i of [0,1,3,4]){
      assert.equal(features[i].touchesBorder,false,`${size}px heart ${i} became a channel`);
      assert.ok(features[i].componentIoU>.9,`${size}px heart ${i} lost its shape`);
    }
  }
  assert.deepEqual(mask,before);assert.deepEqual(input.sourceImage.mask,before);assert.deepEqual(input.sourceImage.probability,probability);
  assert.deepEqual(result.report.slits,{left:3,right:3});
  assert.equal(solver.termination,'validated_corner_topology');
  assert.equal(solver.cornerTopologyInitialization.accepted,true);
  }catch(failure){t.diagnostic(await captureFitFailure({answer:result,source:input.sourceImage,context:{assertion:failure.message}}));throw failure;}
});
