import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {settings} from '../../static/inverse/core/settings.js';
import {CurveGraph,renderCurves} from '../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {validate} from '../../static/inverse/core/validate.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

test('a paper-failed outline block can recover without weakening the paper gate',async()=>{
  const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/photographic-paper-neck-retry.json',import.meta.url))),photoFixture=JSON.parse(await fs.readFile(fixture.sourceFixture));
  const catalog=JSON.parse(await fs.readFile(photoFixture.sourceCatalogue)),photo=await readHardPhoto(catalog.cases.find(c=>c.id===photoFixture.sourceCase));
  assert.equal(photo.fileSha256,photoFixture.sourceFileSha256);assert.equal(photo.rgbaSha256,photoFixture.decodedPixelsSha256);
  const prepared=prepare({...photo,quad:photoFixture.quad},{...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false}),source=prepared.target.sourceImage;
  assert.equal(createHash('sha256').update(source.mask).digest('hex'),fixture.sourceMaskSha256);
  const mask=source.mask.slice(),probability=source.probability.slice(),cfg=structuredClone(fixture.cfg),answers=[];
  await loadNumericalKernel();
  for(const retryPaperSeparation of [false,true]){
    const graph=new CurveGraph(fixture.initialPaths,cfg.width),points=graph.points.slice();graph.fixed.set(fixture.fixed);
    const result=refineCurves(graph,source.probability,source.resolution,fixture.phase,cfg,{steps:120,rate:fixture.rate,selection:fixture.selection,retryPaperSeparation});
    const solution=graph.solution(result.points,fixture.phase),json=JSON.stringify(solutionJSON(solution));
    assert.equal(result.geometryPassed,true);assert.equal(result.paperPassed,true);
    assert.equal(validate(solution,cfg,{checkImage:false}).passed,true);
    for(const materialResolution of [360,1000])assert.equal(materialAudit(solution,{...cfg,materialResolution}).status,'pass');
    const n=source.resolution*2,rendered=await renderExportedWeave(json,n),error=rendered.mask.reduce((s,v,i)=>s+Number(v!==mask[Math.floor(Math.floor(i/n)/2)*source.resolution+Math.floor(i%n/2)]),0)/(n*n);
    answers.push({result,error});assert.deepEqual(graph.points,points);assert.deepEqual(graph.fixed,Uint8Array.from(fixture.fixed));
  }
  assert.ok(answers[0].error>.03,'The original rollback must reproduce the photographic fidelity failure.');
  assert.ok(answers[1].error<.026,`Recovered independent disagreement: ${answers[1].error}`);
  assert.ok(answers[1].error<answers[0].error-.005);
  assert.deepEqual(answers[1].result.paperSeparationRetry,{step:40,previousLocalFactor:8,localFactor:3});
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);assert.deepEqual(cfg,fixture.cfg);
});

test('successful refinement keeps exactly the same curves when paper recovery is enabled',async()=>{
  const line=(a,b)=>Array.from({length:4},(_,j)=>a.map((v,i)=>v+(b[i]-v)*j/3));
  const paths=[0,1].map(f=>[25,50,75].map(v=>[f===0?line([v,0],[v,100]):line([0,v],[100,v])]));
  const cfg=settings({...AUTOMATIC_PRESET,trials:0}),graph=new CurveGraph(paths,cfg.width),source=Float64Array.from(renderCurves(graph,graph.points,1,96)),answers=[];
  for(const retryPaperSeparation of [false,true])answers.push(refineCurves(graph,source,96,1,cfg,{steps:81,retryPaperSeparation}));
  assert.equal(answers[0].geometryPassed,true);assert.equal(answers[0].paperPassed,true);
  assert.deepEqual(answers[1].points,answers[0].points);assert.equal(answers[1].paperSeparationRetry??null,null);
  assert.deepEqual(answers[1].history,answers[0].history);
});
