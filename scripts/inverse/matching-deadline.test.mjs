import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {renderExportedWeave} from './export-renderer.mjs';
import {finalizeFittedSolution} from '../../static/inverse/core/direct/finalize.js';
import {loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {loadBoundaryKernel} from '../../static/inverse/core/direct/native.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {validate} from '../../static/inverse/core/validate.js';
import {settings} from '../../static/inverse/core/settings.js';
import {matchingSummary} from '../../static/inverse/core/direct/matching.js';
// This is an isolated finalizer handoff, not a blind reconstruction. The
// existing matching-seeds test continues to fit from source pixels alone.
const image=JSON.parse(await fs.readFile('scripts/inverse/fixtures/matching/free-hat-mask.json'));
const saved=JSON.parse(await fs.readFile(new URL('./fixtures/matching/late-handoff.json',import.meta.url)));
function input(timeLimit){
 const expand=(runs,Type)=>{const a=new Type(image.resolution**2);let at=0;for(let i=0;i<runs.length;i+=2){a.fill(runs[i],at,at+runs[i+1]);at+=runs[i+1];}assert.equal(at,a.length);return a;};
 const mask=expand(image.maskRuns,Uint8Array),weights=expand(image.weightRuns,Float64Array),source={mask,weights,resolution:image.resolution,probability:Float32Array.from(mask)};
 assert.equal(createHash('sha256').update(mask).digest('hex'),saved.maskSha256);
 const solution=loadSolutionJSON(saved.geometry);Object.assign(solution.graph.target,{sourceImage:source,metadata:saved.metadata});
 const seeds=saved.seeds.map(seed=>({...seed,model:{...seed.model,z:Float64Array.from(seed.model.z)}}));
 return{solution,source,seeds,cfg:settings({...saved.cfg,timeLimit})};
}
test('matching can use remaining requested time after the ten-second fast phase',async()=>{
 await loadBoundaryKernel();
 const {solution,source,seeds,cfg}=input(20),before=structuredClone(source),at=performance.now();
 // Simulate elapsed independent fitting without freezing the real clock or
 // altering backend calibration. Eight seconds remain in the actual request.
 const result=finalizeFittedSolution(solution,cfg,{startedAt:at-12000,matchingSeeds:seeds});
 const report=result.report.matchingPreference;
 assert.equal(report.status,'matched');assert.equal(report.identical,true);
 assert.ok(report.attempts.some(a=>a.proposal==='matching-grid'&&a.refined&&a.withinAllowance&&a.geometryPassed&&a.paperPassed));
 assert.equal(matchingSummary(result).identical,true);assert.ok(report.additionalImageError<=.01);
 assert.equal(validate(result,cfg,{checkImage:false,finalGeometry:true}).passed,true);
 assert.equal(materialAudit(result,cfg).passed,true);
 const rendered=await renderExportedWeave(JSON.stringify(solutionJSON(result)),source.resolution);
 let errors=0,mass=0;for(let i=0;i<source.mask.length;i++){mass+=source.weights[i];errors+=source.weights[i]*(rendered.mask[i]!==source.mask[i]);}
 assert.ok(errors/mass<=report.maximumMatchingImageError);
 assert.deepEqual(source,before);
});
test('an expired requested deadline still prevents matching refinement',async()=>{
 await loadBoundaryKernel();
 const {solution,source,seeds,cfg}=input(10),before=structuredClone(source);
 const result=finalizeFittedSolution(solution,cfg,{startedAt:performance.now()-12000,matchingSeeds:seeds});
 assert.equal(result.report.matchingPreference.status,'matching_budget_exhausted');
 assert.equal(result.report.matchingPreference.identical,false);
 assert.equal(result.report.matchingPreference.attempts.filter(a=>a.refined).length,0);
 assert.deepEqual(source,before);
});
