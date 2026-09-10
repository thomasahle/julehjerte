import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createCanvas,loadImage} from 'canvas';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {renderExportedWeave} from './export-renderer.mjs';

test('a recovered photo routing improves the actual exported mask before returning',async()=>{
  const catalog=JSON.parse(await fs.readFile('scripts/inverse/fixtures/hunodan/speed-crops.json'));
  const entry=catalog.cases.find(r=>r.id==='hjfig-05'),im=await loadImage(entry.source),[x,y,x1,y1]=entry.photoROI;
  const canvas=createCanvas(x1-x,y1-y),context=canvas.getContext('2d');context.drawImage(im,-x,-y);
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false,progressGeometry:true};
  const prepared=prepare({type:'pixels',imageWidth:canvas.width,imageHeight:canvas.height,rgba:context.getImageData(0,0,canvas.width,canvas.height).data,quad:entry.quad},cfg);
  const answer=await design(prepared.target,cfg),replay=await renderExportedWeave(answer.files['cut_geometry.json'],prepared.preview.resolution);
  const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==prepared.preview.mask[i]),0)/replay.mask.length;
  assert.ok(['javascript','wasm'].includes(answer.report.solver.numericalBackend?.backend),'Recovered routes retain the backend diagnostic.');
  assert.ok(answer.report.solver.featureRecovery?.trigger,'The fixture must exercise recovery from a missing image feature.');
  assert.ok(answer.report.templateChecksPassed&&answer.report.validation.passed);assert.equal(answer.report.manufacturing.status,'pass');
  assert.deepEqual(answer.report.slits,{left:4,right:4});
  // The early 80-step result scored better internally but regressed to 1.0355%
  // in the independent renderer. Compare the real exported geometry here.
  assert.ok(error<.0095,`Exported disagreement ${100*error}%`);
});
