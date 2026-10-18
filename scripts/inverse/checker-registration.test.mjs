import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {heartPhoto} from './crop-fixture.mjs';
import {makeFields} from '../../static/inverse/locator/fields.js';
import {refinePeriodicGrid} from '../../static/inverse/locator/grid-refine.js';
import {auditGridOutline} from '../../static/inverse/locator/grid-outline.js';
import {createMotifDetector} from '../../static/inverse/locator/locator.js';
import {detectHeartCrops,supportedCropOutline} from '../../static/inverse/core/crop.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';

const known=[[190,80],[275,155],[190,230],[105,155]],roi=[85,40,300,250];
const image=input=>({width:input.imageWidth,height:input.imageHeight,data:input.rgba});
const maximumError=quad=>Math.max(...quad.map((p,i)=>Math.hypot(p[0]-known[i][0],p[1]-known[i][1])));
async function shadedChecker(end){
  const foreground=heartPhoto({background:'transparent',colours:['#ba1527','#e5d5d5'],lobeDepths:[.66,.61]});
  const canvas=createCanvas(380,320),ctx=canvas.getContext('2d'),data=ctx.createImageData(380,320);
  for(let y=0;y<320;y++)for(let x=0;x<380;x++){
    const i=4*(y*380+x),alpha=foreground.rgba[i+3]/255,texture=4*Math.sin(.21*x)+3*Math.sin(.31*y);
    const background=[105,85,70].map((v,k)=>v+(end[k]-v)*x/379);
    for(let k=0;k<3;k++)data.data[i+k]=alpha*foreground.rgba[i+k]+(1-alpha)*(background[k]+texture);
    data.data[i+3]=255;
  }
  ctx.putImageData(data,0,0);ctx.drawImage(await loadImage(canvas.toBuffer('image/jpeg',{quality:.75})),0,0);
  return{type:'pixels',imageWidth:380,imageHeight:320,rgba:ctx.getImageData(0,0,380,320).data};
}

for(const end of [[175,165,160],[190,180,175]])test(`four-cell palette registration preserves deep lobes on background ${end}`,async()=>{
  const source=await shadedChecker(end),before=source.rgba.slice(),crop=detectHeartCrops(source,{roi}).candidates[0];
  assert.ok(crop&&supportedCropOutline(crop.locator));
  assert.ok(maximumError(crop.quad)<.8);
  const grid=crop.locator.gridRefinement;
  assert.equal(grid.n,4);assert.equal(grid.accepted,true);assert.equal(grid.physicalOutline.passed,true);
  assert.deepEqual(grid.borderTransitionCounts,[3,3,3,3]);
  assert.deepEqual(crop.locator.evidence.lobeDepths,grid.physicalOutline.lobeDepths);
  assert.ok(crop.locator.evidence.lobeDepths[0]>.56&&crop.locator.evidence.lobeDepths[1]>.60);
  assert.equal(crop.locator.status,'needs_review');
  assert.deepEqual(source.rgba,before);
});

test('a photographic checker lattice cannot replace missing paper lobes',()=>{
  const canvas=createCanvas(380,320),ctx=canvas.getContext('2d');ctx.fillStyle='#647653';ctx.fillRect(0,0,380,320);
  ctx.save();ctx.transform(85,75,-85,75,190,80);
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){ctx.fillStyle=(x+y)%2?'#f3f1e8':'#b71327';ctx.fillRect(x/4,y/4,.25,.25);}ctx.restore();
  const im={width:380,height:320,data:ctx.getImageData(0,0,380,320).data},fields=makeFields(im),before=fields.paper.slice();
  const seed=known.map(([x,y])=>[x-.5+2.5,y-.5-2.5]),grid=refinePeriodicGrid(im,seed);
  assert.equal(grid.accepted,true,'The image-only criterion should match this checker.');
  const audit=auditGridOutline(fields,grid.quad);
  assert.equal(audit.passed,false,'The physical paper outline must reject it.');
  assert.ok(audit.lobeOutlineSupport.some(v=>v<.65));
  assert.deepEqual(fields.paper,before);
});

test('fractional selection coordinates retain a useful near-aligned checker correction',async()=>{
  const source=await shadedChecker([190,180,175]);
  let relativeCorrection=false;
  for(const delta of [-.00001,0,.00001]){
    const selection=[roi[0]+delta,roi[1],roi[2]+3*delta,roi[3]];
    const crop=detectHeartCrops(source,{roi:selection}).candidates[0];
    assert.ok(crop&&supportedCropOutline(crop.locator));
    assert.ok(maximumError(crop.quad)<.8,'Tiny pointer rounding must not leave a shifted grid.');
    const grid=crop.locator.gridRefinement;
    assert.equal(grid.accepted,true);assert.equal(grid.physicalOutline.passed,true);
    relativeCorrection ||= grid.requiresPhysicalOutline;
  }
  assert.equal(relativeCorrection,true,'Exercise the correction below the old absolute-gain cutoff.');
});

test('non-checker artwork keeps the independently fitted physical corners',()=>{
  const source=heartPhoto(),ctx=source.canvas.getContext('2d');ctx.save();ctx.transform(85,75,-85,75,190,80);
  ctx.fillStyle='#f3f1e8';ctx.fillRect(0,0,1,1);ctx.fillStyle='#b71327';ctx.beginPath();ctx.arc(.5,.5,.3,0,2*Math.PI);ctx.fill();ctx.restore();
  const im={width:380,height:320,data:ctx.getImageData(0,0,380,320).data};
  const before=createMotifDetector(im,{roi,palette:'adaptive',refineGrid:false})(),after=createMotifDetector(im,{roi,palette:'adaptive'})();
  assert.ok(supportedCropOutline(before));
  assert.notEqual(after.gridRefinement?.accepted,true);
  assert.deepEqual(after.quad,before.quad);
});

test('fresh four-cell photo reconstruction agrees with the known design',{timeout:45000},async()=>{
  const source=await shadedChecker([190,180,175]),crop=detectHeartCrops(source,{roi}).candidates[0];
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,materialResolution:360,trials:0};
  const imported=prepare({...source,quad:crop.quad},cfg),target=hardPhotoTarget(imported,'mask',cfg),before=target.sourceImage.mask.slice();
  const result=await design(target,cfg),n=imported.preview.resolution,woven=await renderExportedWeave(result.files['cut_geometry.json'],n);
  assert.equal(result.report.templateChecksPassed,true);assert.equal(result.report.validation.passed,true);
  assert.equal(auditFeatureFidelity(target.sourceImage,woven.mask,result.report.settings).passed,true);
  assert.deepEqual(result.report.slits,{left:3,right:3});
  // Ground truth is used only after crop selection and fresh template fitting.
  const ideal=Uint8Array.from({length:n*n},(_,i)=>1-((Math.floor(4*((i%n)+.5)/n)+Math.floor(4*(Math.floor(i/n)+.5)/n))%2));
  const error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==ideal[i]),0)/ideal.length;
  assert.ok(Math.min(error,1-error)<.01,`${100*Math.min(error,1-error)}% disagreement with the known checker`);
  assert.deepEqual(target.sourceImage.mask,before);
});
