import {qualityBenchmark} from './quality-benchmark.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {clearanceComparisonSeed,gridFinalists} from '../../static/inverse/core/direct/counts.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

test('a competitive simpler routing gets one slot without losing the best or supported counts',()=>{
  const seed=(counts,error)=>({model:{counts},error});
  const coarse=[seed([2,4],.0665),seed([4,4],.065),seed([6,6],.0628),seed([3,3],.0734),seed([1,1],.12)];
  assert.deepEqual(gridFinalists(coarse,[]),[coarse[0],coarse[1],coarse[3]]);
  const evidence=[];for(let side=0;side<4;side++)for(let j=0;j<3;j++)evidence.push({side,count:6});
  assert.deepEqual(gridFinalists(coarse,evidence),[coarse[0],coarse[3],coarse[2]]);
  assert.deepEqual(gridFinalists(coarse,[],2),coarse.slice(0,2));
  assert.deepEqual(coarse.map(s=>s.model.counts),[[2,4],[4,4],[6,6],[3,3],[1,1]],'The complete count search remains intact.');
});

test('clearance can reverse a finalist ranking without creating or discarding a count seed',()=>{
  const seed=(counts,error)=>({model:{counts},error});
  const incumbent=seed([2,4],.0393),cleared=seed([2,4],.0500);
  const remaining=[seed([4,4],.0342),seed([3,3],.0428),seed([8,8],.01)];
  const before=structuredClone(remaining);
  assert.equal(clearanceComparisonSeed(remaining,incumbent,cleared),remaining[1]);
  assert.equal(clearanceComparisonSeed(remaining,incumbent,seed([2,4],.039)),null);
  assert.equal(clearanceComparisonSeed(remaining,incumbent,seed([2,4],.040)),null);
  assert.equal(clearanceComparisonSeed([],incumbent,cleared),null);
  assert.equal(clearanceComparisonSeed([seed([3,5],.01)],incumbent,cleared),null,'A larger grid keeps its ordinary turn instead of consuming early refinement time.');
  assert.deepEqual(remaining,before);
});

test('simpler finalists use image-plus-cut cost without preferring an inferior smaller grid',()=>{
  const seed=(counts,error)=>({model:{counts},error});
  // Measured flower scores: the five-cut start is inside the cost window,
  // but the six-cut start is better under that same objective.
  const flower=[seed([4,4],.061431884765625),seed([5,5],.0643768310546875),seed([6,6],.062835693359375),seed([3,3],.0720672607421875),seed([3,2],.08929443359375)];
  assert.deepEqual(gridFinalists(flower,[]),[flower[0],flower[1],flower[3]]);
  // The shifted leaf's useful start lies just outside the old raw-error
  // cutoff. Crossing that cutoff must not remove a competitive routing.
  for(const error of [.0767,.0782318115234375]){
    const leaf=[seed([5,5],.061767578125),seed([3,5],.066131591796875),seed([4,4],.0678863525390625),seed([4,4],.0680999755859375),seed([3,3],error)];
    leaf[2].phase=1;leaf[3].phase=-1;
    assert.deepEqual(gridFinalists(leaf,[]),[leaf[0],leaf[1],leaf[4]],'The other colour phase of an existing count pair cannot consume the count-diversity reservation.');
  }
});

test('reserving another count pair never evicts an already simpler finalist',()=>{
  const seed=(counts,error)=>({model:{counts},error});
  const coarse=[seed([4,4],.050),seed([5,5],.049),seed([3,3],.055),seed([4,3],.057)];
  assert.deepEqual(gridFinalists(coarse,[]),[coarse[0],coarse[3],coarse[2]],'The seven-cut proposal replaces ten cuts, retaining the existing six-cut start.');
  const protectedLargest=[seed([5,5],.050),seed([3,3],.060),seed([2,3],.065),seed([4,4],.059)];
  assert.deepEqual(gridFinalists(protectedLargest,[]),protectedLargest.slice(0,3),'A reservation cannot increase a finalist count when the only larger grid is protected.');
});

qualityBenchmark('small resolution changes retain a checked three-cut flower instead of crowding it out',{timeout:40000},async()=>{
  const record=JSON.parse(await fs.readFile(new URL('./fixtures/flower-resolution/source.json',import.meta.url)));
  const hash=b=>createHash('sha256').update(b).digest('hex'),masks=[];
  for(const entry of record.cases){
    const bytes=await fs.readFile(entry.rectifiedPhoto);assert.equal(hash(bytes),entry.sha256);
    const image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const input={type:'pixels',imageWidth:image.width,imageHeight:image.height,rgba:ctx.getImageData(0,0,image.width,image.height).data};
    const cfg=entry.settings,imported=prepare(input,cfg);assert.equal(hash(imported.preview.mask),entry.maskSha256,'Classification must retain every original target pixel.');
    const target=hardPhotoTarget(imported,'mask',cfg),answer=await design(target,cfg),woven=await renderExportedWeave(answer.files['cut_geometry.json'],target.sourceImage.resolution);
    assert.deepEqual(answer.report.slits,{left:3,right:3},entry.variant);assert.equal(answer.report.templateChecksPassed,true);
    if(entry.variant==='downsample'){
      const comparison=answer.report.solver.clearanceComparison;
      assert.equal(comparison.preferred,true,'Minimum-width preparation must be compared before one layout consumes refinement.');
      assert.ok(comparison.alternativeClearanceError<comparison.initialClearanceError);
      assert.equal(comparison.alternativeGeometry,true);assert.equal(comparison.alternativePaper,'pass');
    }
    const error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==target.sourceImage.mask[i]),0)/woven.mask.length;
    assert.ok(error<.01,`${entry.variant}: ${error}`);
    assert.ok(error<entry.previousIndependentMaskError);
    masks.push(imported.preview.mask);
  }
  const difference=masks[0].reduce((sum,v,i)=>sum+Number(v!==masks[1][i]),0)/masks[0].length;
  assert.equal(difference,.00395,'The motivating input perturbation is smaller than half a percentage point.');
});
