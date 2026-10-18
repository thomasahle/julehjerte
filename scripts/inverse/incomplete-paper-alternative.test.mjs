import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {assessCandidate} from '../../static/inverse/core/direct/candidate-verification.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {validate} from '../../static/inverse/core/validate.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {renderExportedWeave} from './export-renderer.mjs';

const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/incomplete-paper-alternative.json'));
async function setup(){
 const bytes=await fs.readFile(fixture.sourceFixture);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),fixture.sourceFixtureSha256);
 const data=JSON.parse(bytes),mask=new Uint8Array(data.resolution**2);let offset=0;
 for(const [value,length]of data.runs){mask.fill(value,offset,offset+length);offset+=length;}
 assert.equal(offset,mask.length);assert.equal(createHash('sha256').update(mask).digest('hex'),data.maskSha256);
 const cfg=fixture.settings,input=prepare({type:'mask',mask,resolution:data.resolution},cfg).target;
 await loadNumericalKernel();
 const candidate=paths=>{
  const graph=new CurveGraph(paths,cfg.width),solution=graph.solution(graph.points,fixture.phase,input),paper=materialAudit(solution,cfg);
  return{graph,points:graph.points.slice(),phase:fixture.phase,geometryPassed:validate(solution,cfg,{finalGeometry:true}).passed,paperPassed:paper.passed,paper:paper.summary};
 };
 return{input,cfg,reference:candidate(fixture.paths),alternative:()=>candidate(fixture.alternativePaths)};
}

test('a missing border fragment does not block finer paper verification of a better legal approximation',async()=>{
 const {input,cfg,reference,alternative}=await setup(),source=structuredClone(input.sourceImage);
 assert.equal(assessCandidate(reference,input,cfg),false);
 assert.equal(reference.paperPassed,true);assert.equal(reference.originalFeatures.missing.length,1);
 const unchecked=alternative();assert.equal(unchecked.paper.status,'uncertain');
 assert.equal(assessCandidate(unchecked,input,cfg),false);assert.equal(unchecked.paperPassed,false);
 const improved=alternative();
 assert.equal(assessCandidate(improved,input,cfg,{approximationReference:reference}),false,'An unresolved source feature must still prevent a full acceptance.');
 assert.equal(improved.approximationImproves,true);assert.equal(improved.paperPassed,true);
 assert.equal(improved.paperVerification.resolution,700);
 assert.equal(improved.originalFeatures.passed,false);assert.equal(improved.originalFeatures.missing.length,1);
 const errors=[];
 for(const c of [reference,improved]){
  const solution=c.graph.solution(c.points,c.phase,input);
  assert.equal(finalMaterialAudit(solution,{...cfg,materialResolution:700}).passed,true);
  const rendered=await renderExportedWeave(solutionJSON(solution),input.sourceImage.resolution);
  errors.push(rendered.mask.reduce((sum,v,i)=>sum+Number(v!==source.mask[i]),0)/source.mask.length);
 }
 assert.ok(errors[0]-errors[1]>.001,'Independent exports must confirm improvement, not just a changed acceptance flag.');
 assert.deepEqual(input.sourceImage,source);
});

test('an incomplete approximation cannot consume an expired finer-audit reserve',async()=>{
 const {input,cfg,reference,alternative}=await setup();assessCandidate(reference,input,cfg);
 const candidate=alternative();
 assert.equal(assessCandidate(candidate,input,cfg,{approximationReference:reference,deadline:0}),false);
 assert.equal(candidate.paperPassed,false);assert.equal(candidate.paperVerification,undefined);
});
