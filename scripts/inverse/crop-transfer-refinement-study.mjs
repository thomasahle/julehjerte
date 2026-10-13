/** Diagnostic only: do different existing geometries admit a good fit to the
 * unresolved vertical crop? Saved fits are not supplied to production solving.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {loadSolutionJSON,solutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {mismatch} from '../../static/inverse/core/direct/grid.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
const root='tmp/heart-learning/near-miss-paper-v1',sha=b=>createHash('sha256').update(b).digest('hex');
const previous=JSON.parse(await fs.readFile(root+'/crop-transfer.json')),target=previous.inputs.find(r=>r.name==='vertical');
const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-near-miss-seed.json'));
const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
assert.equal(photo.fileSha256,fixture.sourceFileSha256);assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
const cfg=settings({...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false,preferMatchingSheets:false});
const input=prepare({...photo,quad:target.quad},cfg).target,source=input.sourceImage,n=source.resolution;
assert.equal(n,400);assert.equal(sha(source.mask),target.maskSha256);assert.equal(sha(new Uint8Array(source.probability.buffer)),target.probabilitySha256);
await loadNumericalKernel();const rows=[];
for(const row of previous.rows.filter(r=>r.target==='vertical')){
 const bytes=await fs.readFile(row.geometryFile);assert.equal(sha(bytes),row.geometrySha256);
 const saved=loadSolutionJSON(bytes.toString()),phase=saved.graph.target.phase?-1:1;
 const graph=new CurveGraph(saved.paths.map((family,f)=>family.map((_,i)=>curvesOf(saved,f,i).map(curve=>curve.p))),cfg.width);
 const started=performance.now(),result=refineCurves(graph,source.probability,n,phase,cfg,{input,steps:160,rate:.008,selection:'mask'});
 const solution=graph.solution(result.points,phase,input),encoded=solutionJSON(solution),geometry=validate(solution,cfg,{checkImage:false}),paper=materialAudit(solution,cfg).summary;
 const replay=await renderExportedWeave(encoded,n),error=mismatch(replay.mask,source.mask),features=auditFeatureFidelity(source,replay.mask,cfg);
 const fineN=2*n,fineMask=Uint8Array.from({length:fineN*fineN},(_,i)=>source.mask[Math.floor(Math.floor(i/fineN)/2)*n+Math.floor((i%fineN)/2)]);
 const fineReplay=await renderExportedWeave(encoded,fineN),fineError=mismatch(fineReplay.mask,fineMask),fineFeatures=auditFeatureFidelity({resolution:fineN,mask:fineMask},fineReplay.mask,cfg);
 const id='transfer-refined-'+row.model;
 await fs.writeFile(root+'/'+id+'.json',JSON.stringify(encoded));await fs.writeFile(root+'/'+id+'.png',replay.png);
 const after={model:row.model,beforeError:row.error,error,fineError,fineResolution:fineN,fineFeatures,counts:graph.families.map(f=>f.length),edges:graph.edges.length,steps:result.steps,seconds:(performance.now()-started)/1000,features,geometry,paper,history:result.history,passed:error<=cfg.maxImageError&&fineError<=cfg.maxImageError&&features.passed&&fineFeatures.passed&&geometry.passed&&paper.status==='pass',geometryFile:root+'/'+id+'.json'};
 rows.push(after);console.log(JSON.stringify({model:row.model,error,fineError,features:features.passed,fineFeatures:fineFeatures.passed,geometry:geometry.passed,paper:paper.status,passed:after.passed,seconds:after.seconds}));
}
const sourceHashes={...previous.sourceHashes};
sourceHashes['scripts/inverse/crop-transfer-refinement-study.mjs']=sha(await fs.readFile('scripts/inverse/crop-transfer-refinement-study.mjs'));
await fs.writeFile(root+'/crop-transfer-refinement.json',JSON.stringify({method:'160-step independent continuations against the identical unresolved vertical crop. Different saved image-derived shapes, routing and segment counts can all affect the result. This demonstrates existence only, not fresh-solve speed or a production warm start.',sourceHashes,target,cfg,rows},null,2));
