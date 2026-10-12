import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {recoverImageFeatures} from '../../static/inverse/core/feature-recovery.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

test('leaf routing tries later border interpretations before expanding an exhausted speculative graph',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-leaf-routing.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto({...catalogue.source,...catalogue.cases.find(c=>c.id===fixture.sourceCase)});
  assert.equal(photo.fileSha256,fixture.sourceFileSha256);
  assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
  const raw={...AUTOMATIC_PRESET,timeLimit:12,trials:0,earlyStop:false},cfg=settings(raw);
  const prepared=prepare({...photo,quad:fixture.quad},raw),input=hardPhotoTarget(prepared,'mask',raw),source=input.sourceImage;
  const hash=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(hash(source.mask),fixture.maskSha256);
  assert.equal(hash(new Uint8Array(source.probability.buffer,source.probability.byteOffset,source.probability.byteLength)),fixture.fittingProbabilitySha256);
  const mask=source.mask.slice(),probability=source.probability.slice();
  const result=await recoverImageFeatures(input,cfg,12);
  assert.ok(result.solution||result.refinementSeed,'The later border interpretation must provide a valid starting pair for refinement.');
  assert.ok(result.report.attempts.some(a=>a.borderSeed&&a.solver?.status==='solved'));
  assert.ok(result.report.deferredNeighborExpansions>0,'Failed proposals remain queued while later ordinary borders are tried.');
  assert.ok(result.report.attempts.every(a=>!a.solver?.neighborRetry&&!a.neighborExpansion),'An earlier speculative border cannot consume the budget with new optional connections.');
  const candidate=result.solution||result.refinementSeed;
  assert.equal(validate(candidate,cfg).passed,true);
  assert.equal(materialAudit(candidate,cfg).passed,true);
  const rendered=await renderExportedWeave(solutionJSON(candidate),source.resolution);
  const error=rendered.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.04,`The routing seed lost the photographed leaf: ${error}`);
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});

test('neighbor expansion remains available after every ordinary boundary hypothesis is exhausted',async()=>{
  const n=120,mask=Uint8Array.from({length:n*n},(_,i)=>Number(i%n>=30&&i%n<90&&Math.floor(i/n)>=30&&Math.floor(i/n)<90));
  const cfg=settings({...AUTOMATIC_PRESET,width:60,neighbors:2,connectorVariants:1,timeLimit:3,trials:0});
  const source={mask,probability:Float32Array.from(mask),resolution:n},before=mask.slice();
  const result=await recoverImageFeatures({width:60,sourceImage:source,metadata:{preprocessing:{}}},cfg,3);
  // A closed central patch with no border endpoints cannot form complete
  // slits. Expansion is permitted, but must not invent a valid template.
  assert.equal(result.solution,null);assert.equal(result.refinementSeed,undefined);
  const attempts=result.report.attempts,first=attempts.findIndex(a=>a.neighborExpansion);
  assert.ok(first>0,'The deferred candidate pool must actually be tried.');
  assert.ok(attempts.slice(0,first).every(a=>a.solver?.termination==='candidate_graph_exhausted'));
  assert.ok(attempts.slice(first).every(a=>a.neighborExpansion&&a.initialAttempt<first&&a.solver?.termination==='candidate_graph_exhausted'));
  assert.deepEqual(source.mask,before);
});
