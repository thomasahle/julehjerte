/** Diagnostic only: transfer the fitter's own outputs between nearby crops.
 * A transferred fit demonstrates existence, not fresh-solve performance.
 * No transformation, rescaling or refitting of the saved geometry is allowed.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {settings} from '../../static/inverse/core/settings.js';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {mismatch} from '../../static/inverse/core/direct/grid.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
const root='tmp/heart-learning/near-miss-paper-v1',sha=b=>createHash('sha256').update(b).digest('hex');
const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-near-miss-seed.json'));
const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
assert.equal(photo.fileSha256,fixture.sourceFileSha256);assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
const cfg=settings({...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false}),inputs=[];
for(const [name,offset] of [['original',[0,0]],['horizontal',[1,0]],['vertical',[0,1]]]){
 const quad=fixture.quad.map(p=>p.map((v,i)=>v+offset[i])),input=prepare({...photo,quad},cfg).target;
 inputs.push({name,quad,input,maskSha256:sha(input.sourceImage.mask),probabilitySha256:sha(new Uint8Array(input.sourceImage.probability.buffer))});
}
const models=[
 {name:'original',file:'tmp/heart-learning/foreground-locator-v1/refined-seed/flettede-stonehenge/automatic/cut_geometry.json'},
 {name:'horizontal',file:root+'/final-perturbations/flettede-stonehenge--crop-x-plus-1/automatic/cut_geometry.json'},
 {name:'vertical',file:root+'/final-perturbations/flettede-stonehenge--crop-y-plus-1/automatic/cut_geometry.json'}
];
await loadNumericalKernel();
const rows=[];
for(const model of models){
 const bytes=await fs.readFile(model.file),stored=loadSolutionJSON(bytes.toString());
 const geometry=validate(stored,cfg,{checkImage:false}),paper=materialAudit(stored,cfg).summary;
 const replay=await renderExportedWeave(bytes.toString(),400);
 for(const target of inputs){
  const source=target.input.sourceImage;assert.equal(source.resolution,400);
  const error=mismatch(replay.mask,source.mask),features=auditFeatureFidelity(source,replay.mask,cfg);
  const row={model:model.name,target:target.name,geometryFile:model.file,geometrySha256:sha(bytes),maskSha256:target.maskSha256,probabilitySha256:target.probabilitySha256,error,features,geometry,paper,passed:error<=cfg.maxImageError&&features.passed&&geometry.passed&&paper.status==='pass'};
  rows.push(row);console.log(JSON.stringify({model:row.model,target:row.target,error,features:features.passed,geometry:geometry.passed,paper:paper.status,passed:row.passed}));
 }
}
const sourceHashes={};
for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){const file='static/inverse/core/'+name;sourceHashes[file]=sha(await fs.readFile(file));}
sourceHashes['scripts/inverse/crop-transfer-study.mjs']=sha(await fs.readFile('scripts/inverse/crop-transfer-study.mjs'));
await fs.writeFile(root+'/crop-transfer.json',JSON.stringify({method:'Unchanged image-derived geometries replayed against three source crops. This is an existence/initialization diagnostic, not a fresh-solve benchmark or a proposed production warm start.',sourceHashes,inputs:inputs.map(({input,...row})=>row),rows},null,2));
