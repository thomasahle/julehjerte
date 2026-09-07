import test from 'node:test';
import assert from 'node:assert/strict';
import {auditImageFeatures,imageFeatures} from '../../static/inverse/core/image-features.js';
import {finish} from '../../static/inverse/core/engine.js';
import {gridModel,gridPaths} from '../../static/inverse/core/direct/grid.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';
import {settings} from '../../static/inverse/core/settings.js';

test('a missing small interior detail fails even below the overall image-error limit',()=>{
  const model=gridModel([1,1]);model.z.fill(0);
  const graph=new CurveGraph(gridPaths(model)),solution=graph.solution(graph.points,1),n=100,mask=sampleWeave(solution,n);
  for(let y=12;y<20;y++)for(let x=12;x<20;x++)mask[y*n+x]^=1;
  solution.graph.target.sourceImage={mask,resolution:n};
  const cfg=settings({trials:0,roundHidden:false}),result=finish(solution,cfg);
  assert.ok(result.report.imageError.mismatchFraction<.01);
  assert.equal(result.report.imageFidelity.features.missing.length,1);
  assert.equal(result.report.imageFidelity.features.missing[0].retainedFraction,0);
  assert.equal(result.report.imageFidelity.passed,false);
  assert.equal(result.report.templateExportAllowed,false);
  assert.ok(result.report.warnings.some(s=>s.includes('interior artwork')));
});

test('feature retention is colour symmetric, scale invariant, and tolerates boundary noise',()=>{
  for(const invert of[0,1])for(const n of[100,200]){
    const mask=new Uint8Array(n*n).fill(invert),woven=mask.slice(),q=n/100;
    for(let y=20*q;y<30*q;y++)for(let x=20*q;x<30*q;x++)mask[y*n+x]=1-invert;
    for(let y=20*q;y<29*q;y++)for(let x=21*q;x<30*q;x++)woven[y*n+x]=1-invert;
    const source={mask,resolution:n},before=mask.slice();
    const result=auditImageFeatures(source,woven);
    assert.equal(result.passed,true);assert.equal(result.regions.length,1);
    assert.equal(result.regions[0].retainedFraction,.81);assert.equal(result.regions[0].areaMm2,100);
    assert.deepEqual(mask,before);
  }
});

test('tiny specks, thin seams, border fragments and unobserved areas do not force extra motifs',()=>{
  const n=100,mask=new Uint8Array(n*n);
  mask[1515]=1;
  for(let x=20;x<80;x++)mask[50*n+x]=1;
  for(let y=0;y<10;y++)for(let x=40;x<50;x++)mask[y*n+x]=1;
  assert.deepEqual(imageFeatures({mask,resolution:n}),[]);
  for(let y=70;y<80;y++)for(let x=70;x<80;x++)mask[y*n+x]=1;
  const validMask=new Uint8Array(n*n).fill(1);validMask[75*n+75]=0;
  assert.deepEqual(imageFeatures({mask,resolution:n,validMask}),[]);
  assert.equal(auditImageFeatures(null,new Uint8Array(n*n)).referenceAvailable,false);
});
