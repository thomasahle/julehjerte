import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalReferenceLines,oracleGraphVariants,referenceWitness,explainMissingConnectors} from './experiments/graph-oracle.mjs';
import {fixture} from './fixtures.mjs';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {curvesOf,solutionJSON,reindex} from '../../static/inverse/core/graph.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {solveGraph} from '../../static/inverse/core/solver.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {renderExportedWeave} from './export-renderer.mjs';

const cfg=settings({...AUTOMATIC_PRESET,width:60,timeLimit:3,trials:0,neighbors:8,connectorVariants:1});
const pathsOf=s=>s.paths.map((family,k)=>family.map((_,p)=>curvesOf(s,k,p).map(c=>c.p)));

test('reference line normalization retains the weave across unequal parameterization and subdivision',async()=>{
  const source=fixture('hidden-corner'),paths=pathsOf(source);
  // One sheet uses endpoint handles; the other subdivides the same straight
  // locus. Both must become one shared chain, without changing the drawing.
  const shared=paths[0][0][1];paths[0][0][1]=[shared[0],shared[0],shared[3],shared[3]];
  paths[1][0].splice(1,1,...new Cubic(paths[1][0][1]).split(.37).map(c=>c.p));
  const before=structuredClone(paths),graph=new CurveGraph(canonicalReferenceLines(paths),60),normalized=graph.solution(graph.points,1);
  assert.deepEqual(paths,before);
  assert.equal(graph.visible.filter(v=>!v).length,3);
  assert.equal(validate(normalized,cfg).passed,true);
  const a=await renderExportedWeave(solutionJSON(source),400),b=await renderExportedWeave(solutionJSON(normalized),400);
  assert.deepEqual(b.mask,a.mask);
});

test('reference normalization cannot snap away a curved boundary or a near-coincident seam',()=>{
  const curved=[[20,0],[25,20],[15,40],[20,60]],line=Cubic.line([0,20],[60,20]).p,near=Cubic.line([0,20.0001],[60,20.0001]).p;
  const paths=[[[curved],[line]],[[near]]],result=canonicalReferenceLines(paths);
  assert.deepEqual(result[0][0],[curved]);
  assert.equal(result[0][1][0][0][1],20);
  assert.equal(result[1][0][0][0][1],20.0001);
  assert.equal(new CurveGraph(result,60).visible.filter(v=>!v).length,0);
});

function curvedSharedReference(){
  const reference=fixture('hidden-corner'),edge=reference.graph.edges.find(e=>!e.visible);
  edge.curve=new Cubic([[20,20],[25,22],[35,22],[40,20]]);
  reindex(reference.graph);
  assert.equal(validate(reference,cfg).passed,true);
  assert.equal(materialAudit(reference,cfg).passed,true);
  return reference;
}

test('connector oracles preserve the target and require an independently valid reference witness',()=>{
  const reference=curvedSharedReference(),before=JSON.stringify(solutionJSON(reference));
  const [heuristic,augmented,compact]=oracleGraphVariants(reference,cfg);
  assert.throws(()=>referenceWitness(reference,heuristic.graph),/absent/,'A curved shared connector is absent from the straight-only proposal pool.');
  assert.ok(augmented.addedConnectors>0);
  for(const v of [augmented,compact]){
    assert.equal(validate(v.witness,cfg).passed,true);
    assert.deepEqual(v.graph.target.curves.map(c=>c.p),heuristic.graph.target.curves.map(c=>c.p));
  }
  assert.equal(compact.graph.metadata.hiddenCandidates,2);
  assert.ok(compact.graph.edges.length<augmented.graph.edges.length);
  assert.equal(JSON.stringify(solutionJSON(reference)),before);
  const broken={...compact.graph,edges:compact.graph.edges.filter(e=>e.visible)};
  assert.throws(()=>referenceWitness(reference,broken),/absent/);
});

test('HiGHS still assigns unknown sheet ownership in the compact oracle and exports the reference weave',async()=>{
  const reference=curvedSharedReference(),compact=oracleGraphVariants(reference,cfg).at(-1);
  const result=await solveGraph(compact.graph,cfg,{stopAfterValidated:true,coreGate:s=>materialAudit(s,cfg)});
  assert.equal(result.report.status,'solved');assert.ok(result.report.binaryVariables>0);
  assert.equal(validate(result,cfg).passed,true);
  const a=await renderExportedWeave(solutionJSON(reference),400),b=await renderExportedWeave(solutionJSON(result),400);
  assert.deepEqual(b.mask,a.mask);
});

test('the oracle distinguishes a local-fragment clearance rejection from an insufficient neighbour budget',()=>{
  const a=[[20,0],[20,20],[40,40],[40,60]],b=[[0,20],[20,20],[40,40],[60,40]];
  const paths=[a,b].map(p=>[p.slice(1).map((q,i)=>Cubic.line(p[i],q).p)]);
  paths[0][0].splice(0,1,...new Cubic(paths[0][0][0]).split(.99995).map(c=>c.p));
  const curves=new CurveGraph(paths,60),reference=curves.solution(curves.points,1);
  assert.equal(validate(reference,cfg).passed,true);
  const [heuristic,augmented]=oracleGraphVariants(reference,cfg),diagnosis=explainMissingConnectors(augmented.witness,heuristic.graph,cfg);
  assert.equal(diagnosis.length,1);
  assert.equal(diagnosis[0].reason,'clearance_rejection');
  assert.ok(diagnosis[0].nearestRanks.some(r=>r>0&&r<=cfg.neighbors));
  assert.ok(diagnosis[0].blockers.some(b=>b.nonincidentClearance&&b.nearestEndpointMm<.002));
  assert.equal(validate(augmented.witness,cfg).passed,true);
});
