import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas} from 'canvas';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

test('unsuccessful half-resolution photo routing leaves time for the independent curve fit',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-puppy-fit.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
  assert.equal(photo.fileSha256,fixture.sourceFileSha256);
  assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
  const hash=b=>createHash('sha256').update(b).digest('hex');
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false};
  // The original photograph now recovers its opening before speculative MILP
  // recovery. This perturbation still exercises the unsuccessful-routing path.
  const canvas=createCanvas(Math.round(photo.imageWidth/2),Math.round(photo.imageHeight/2)),ctx=canvas.getContext('2d');
  ctx.drawImage(photo.canvas,0,0,canvas.width,canvas.height);
  const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  assert.equal(hash(rgba),'c59764172b1293df526a5326bb54ba4085b73d6314f28b48e9cfc3be77006d71');
  const prepared=prepare({type:'pixels',rgba,imageWidth:canvas.width,imageHeight:canvas.height,quad:fixture.quad.map(p=>p.map(v=>v/2))},cfg),source=prepared.target.sourceImage;
  const mask=source.mask.slice(),probability=source.probability.slice();
  assert.equal(hash(mask),'892ade9f2353db4be42a7c22ddec818734930e100a1ab6b63837e1d9b07076b5');
  assert.equal(hash(new Uint8Array(probability.buffer)),'fdffc8129282b7733c81b2d475a5833de0dfbc288dbe65c1511a0251a04a3f50');
  const answer=await design(prepared.target,cfg),solver=answer.report.solver;
  assert.equal(solver.featureRecovery.accepted,false,'Exercise an unsuccessful speculative routing.');
  assert.equal(solver.selectedInitialization,'grid');
  assert.ok(solver.checkpoints.some(c=>c.step>=80&&c.geometry&&c.paper==='pass'),
    'A legal free-curve refinement must survive after the speculative routing fails.');
  assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.manufacturing.status,'pass');
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);
  const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.0085,`Independent error ${error} must retain the close fallback fit.`);
  // Refinement still cannot guarantee recovery of a remote missing region.
  // Keep the ordinary final feature gate; do not turn low mean error into a pass.
  if(answer.report.imageFidelity.features.missing.length)assert.equal(answer.report.templateChecksPassed,false);
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});
