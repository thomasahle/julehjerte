import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {gridFinalists} from '../../static/inverse/core/direct/counts.js';
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

test('small resolution changes retain a checked three-cut flower instead of crowding it out',{timeout:40000},async()=>{
  const record=JSON.parse(await fs.readFile(new URL('./fixtures/flower-resolution/source.json',import.meta.url)));
  const hash=b=>createHash('sha256').update(b).digest('hex'),masks=[];
  for(const entry of record.cases){
    const bytes=await fs.readFile(entry.rectifiedPhoto);assert.equal(hash(bytes),entry.sha256);
    const image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const input={type:'pixels',imageWidth:image.width,imageHeight:image.height,rgba:ctx.getImageData(0,0,image.width,image.height).data};
    const cfg=entry.settings,imported=prepare(input,cfg);assert.equal(hash(imported.preview.mask),entry.maskSha256,'Classification must retain every original target pixel.');
    const target=hardPhotoTarget(imported,'mask',cfg),answer=await design(target,cfg),woven=await renderExportedWeave(answer.files['cut_geometry.json'],target.sourceImage.resolution);
    assert.deepEqual(answer.report.slits,{left:3,right:3});assert.equal(answer.report.templateChecksPassed,true);
    const error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==target.sourceImage.mask[i]),0)/woven.mask.length;
    assert.ok(error<.01,`${entry.variant}: ${error}`);
    assert.ok(error<entry.previousIndependentMaskError);
    masks.push(imported.preview.mask);
  }
  const difference=masks[0].reduce((sum,v,i)=>sum+Number(v!==masks[1][i]),0)/masks[0].length;
  assert.equal(difference,.00395,'The motivating input perturbation is smaller than half a percentage point.');
});
