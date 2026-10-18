/** A retained repair is still a proposal until the ordinary finalist gates pass. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {loadSolutionJSON,solutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {assessCandidate,verifyCandidatePaper} from '../../static/inverse/core/direct/candidate-verification.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit,verifiedPaperSettings} from '../../static/inverse/core/material.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {renderExportedWeave} from './export-renderer.mjs';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/repaired-routing-paper-checkpoints.json',import.meta.url)));
const sourceFixture=JSON.parse(await fs.readFile(new URL('./fixtures/'+fixture.sourceFixture,import.meta.url)));
const entry=sourceFixture.cases.find(c=>c.id===fixture.sourceCase),mask=new Uint8Array(entry.resolution**2);
for(const[start,length]of entry.maskRuns)mask.fill(1,start,start+length);
assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
const cfg=settings({...sourceFixture.configuration,invert:false,removeSpecks:0,fillHoles:0});

for(const witness of fixture.cases)test(`a ${witness.steps}-step repair must resolve its actual paper uncertainty before selection`,async()=>{
  await loadNumericalKernel();
  const input=prepare({type:'mask',mask,resolution:entry.resolution},cfg).target,beforeSource=structuredClone(input.sourceImage);
  const saved=loadSolutionJSON(witness.geometry);
  const graph=new CurveGraph(saved.paths.map((family,f)=>family.map((_,i)=>curvesOf(saved,f,i).map(c=>c.p))),cfg.width);
  const phase=saved.graph.target.phase?-1:1,solution=graph.solution(graph.points,phase,input),before=solutionJSON(solution);
  const geometry=validate(solution,cfg,{finalGeometry:true});assert.equal(geometry.passed,true);
  assert.equal(materialAudit(solution,cfg).status,'uncertain');
  const paper=materialAudit(solution,{...cfg,materialResolution:700});assert.equal(paper.status,'uncertain');
  const candidate=()=>({graph,points:graph.points.slice(),phase,geometryPassed:geometry.passed,paperPassed:false,paper:paper.summary,
    paperVerification:{requestedResolution:cfg.materialResolution,initialStatus:'uncertain',resolution:700,status:'uncertain'}});

  const expired=candidate();
  assert.equal(assessCandidate(expired,input,cfg,{deadline:performance.now()+499}),false);
  assert.equal(expired.paperVerification.resolution,700,'The final half-second remains reserved.');
  const wrongImage=candidate();
  assert.equal(assessCandidate(wrongImage,input,{...cfg,maxImageError:0}),false);
  assert.equal(wrongImage.paperVerification.resolution,700,'Paper verification cannot waive image fidelity.');
  assert.equal(assessCandidate({...candidate(),geometryPassed:false},input,cfg),false);

  // Paper can be checked to permit another fitting stage even while the
  // image is unacceptable. That check must never waive the image gate.
  const forRefinement=candidate(),strictImage={...cfg,maxImageError:0};
  assert.equal(verifyCandidatePaper({...forRefinement,geometryPassed:false},input,strictImage),false);
  assert.equal(verifyCandidatePaper(forRefinement,input,strictImage,{deadline:0}),false);
  assert.equal(forRefinement.paperVerification.resolution,700);
  assert.equal(verifyCandidatePaper(forRefinement,input,strictImage),witness.expectedStatus1000==='pass');
  assert.equal(forRefinement.paperVerification.resolution,1000);
  assert.equal(assessCandidate(forRefinement,input,strictImage),false);
  assert.ok(forRefinement.originalImageError>0);
  assert.deepEqual(forRefinement.points,graph.points,'Verification never edits the fitted paths.');

  const checked=candidate(),expected=witness.expectedStatus1000==='pass';
  assert.equal(assessCandidate(checked,input,cfg),expected);
  assert.equal(checked.paperPassed,expected);
  assert.equal(checked.paperVerification.resolution,1000);
  assert.equal(checked.paperVerification.status,witness.expectedStatus1000);
  assert.equal(checked.originalFeatures.passed,true);
  solution.report={paperVerification:checked.paperVerification};
  const verified=verifiedPaperSettings(solution,cfg);
  assert.equal(verified.materialResolution,1000);
  assert.equal(finalMaterialAudit(solution,verified).status,witness.expectedStatus1000);
  const rendered=await renderExportedWeave(solutionJSON(solution),entry.resolution);
  const error=rendered.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.equal(error,witness.independentError);
  assert.ok(error<.02);
  assert.deepEqual(solutionJSON(solution),before);
  assert.deepEqual(input.sourceImage,beforeSource);
});
