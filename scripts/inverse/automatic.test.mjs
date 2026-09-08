import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {matchingSummary} from '../../static/inverse/core/direct/matching.js';
import {matchingErrorLimit,matchingProposals,preferMatchingSolution} from '../../static/inverse/core/direct/prefer-matching.js';
import {settings} from '../../static/inverse/core/settings.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../src/lib/inverse/presets.js';
import {checkerPixels} from './fixtures.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {referenceEnvironment,compareCutPaths} from './reference.mjs';

function asymmetricPair(offset){
  const graph=new CurveGraph([[[Cubic.line([50,0],[50,100]).p]],[[Cubic.line([0,50+offset],[100,50+offset]).p]]]);
  const solution=graph.solution(graph.points,1),mask=sampleWeave(solution,400);
  solution.graph.target.sourceImage={mask,resolution:400};return solution;
}

test('matching uses an absolute one-percentage-point allowance within the global limit',()=>{
  const cfg=settings();
  assert.equal(matchingErrorLimit(.002,cfg),.012);
  assert.equal(matchingErrorLimit(.028,cfg),.03);
  assert.equal(matchingErrorLimit(.002,{...cfg,matchingErrorAllowance:0}),.002);
});

test('a valid identical pair is preferred within 1% even after the refinement deadline',async()=>{
  const cfg=settings({trials:0}),original=asymmetricPair(.8),before=original.graph.target.sourceImage.mask.slice();
  const matched=preferMatchingSolution(original,cfg,{deadline:0});
  assert.equal(matchingSummary(original).identical,false);
  assert.equal(matchingSummary(matched).identical,true);
  assert.equal(matched.report.matchingPreference.status,'matched');
  assert.equal(matched.report.matchingPreference.baselineImageError,0);
  assert.ok(matched.report.matchingPreference.additionalImageError>0);
  assert.ok(matched.report.matchingPreference.additionalImageError<=.01);
  assert.deepEqual(original.graph.target.sourceImage.mask,before);
  const independent=await renderExportedWeave(solutionJSON(matched),400);
  assert.ok(independent.mask.reduce((sum,v,i)=>sum+Number(v!==before[i]),0)/before.length<=.01);
});

test('matching cannot consume more than the allowance even when both sheets are valid',()=>{
  const original=asymmetricPair(2.5),result=preferMatchingSolution(original,settings({trials:0}));
  assert.equal(result,original);
  assert.equal(result.report.matchingPreference.status,'image_bound_exceeds_allowance');
  assert.equal(result.report.matchingPreference.identical,false);
  assert.deepEqual(result.report.matchingPreference.attempts,[]);
});

test('unequal slit counts still propose copying either complete sheet',()=>{
  const graph=new CurveGraph([
    [20,50].map(x=>[Cubic.line([x,0],[x,100]).p]),
    [20,50,80].map(y=>[Cubic.line([0,y],[100,y]).p]),
  ]),proposals=matchingProposals(graph.solution(graph.points,1));
  assert.deepEqual(proposals.map(p=>p.paths.map(f=>f.length)),[[2,2],[3,3]]);
  for(const p of proposals){const g=new CurveGraph(p.paths);assert.equal(matchingSummary(g.solution(g.points,1)).identical,true);}
});

test('cropped photographic input uses direct fitting without hard symmetry requirements',()=>{
  const input=checkerPixels(128);input.quad=[[0,0],[128,0],[128,128],[0,128]];
  const p=prepare(input,AUTOMATIC_PRESET);
  assert.equal(p.target.metadata.automatic.route,'direct');assert.equal(p.target.metadata.direct,true);
  assert.equal(p.target.metadata.identicalSheets,undefined);
});

test('automatic routing preserves the published star cuts without a preset or filename hint',{timeout:30000},async()=>{
  const env=await referenceEnvironment();
  try{
    const ref=await env.load('5star',600),cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0};
    const p=prepare(ref.input,cfg),r=await design(p.target,cfg);
    assert.equal(p.target.metadata.automatic.route,'angular');
    assert.equal(r.report.templateChecksPassed,true);
    assert.equal(r.report.solver.matchingPreference.identical,true);
    const comparison=compareCutPaths(JSON.parse(r.files['cut_geometry.json']),ref.cuts);
    assert.equal(comparison.unmatchedSlits,0);assert.ok(comparison.symmetricMeanMm<.1);
    assert.ok(comparison.sampledMaximumMm+comparison.maximumSamplingErrorBoundMm<.5);
  }finally{await env.close();}
});

test('SVG preparation keeps the original paths for the automatic vector route',async()=>{
  const p=prepare({type:'svg',text:await fs.readFile('static/inverse/examples/waves.svg','utf8')},AUTOMATIC_PRESET);
  assert.equal(p.target.metadata.automatic.route,'vector');
  assert.equal(p.target.metadata.originalCubicsPreserved,true);
  assert.ok(p.target.curves.length>0);assert.equal(p.preview.mask.length,p.preview.resolution**2);
});
