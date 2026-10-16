import test from 'node:test';
import assert from 'node:assert/strict';
import {heartPhoto} from './crop-fixture.mjs';
import {createMotifDetector} from '../../static/inverse/locator/locator.js';
import {detectHeartCrops,supportedCropOutline} from '../../static/inverse/core/crop.js';

const corners=([x,y,ax,ay,bx,by])=>[[x,y],[x+ax,y+ay],[x+ax+bx,y+ay+by],[x+bx,y+by]];
const maxError=(a,b)=>Math.max(...a.map((p,i)=>Math.hypot(p[0]-b[i][0],p[1]-b[i][1])));

for(const [heart,regions] of [
  [[240,160,200,130,-140,205],[[10,50,500,530],[0,0,600,595]]],
  [[180,200,100,80,-100,80],[[20,20,550,480],[40,50,400,440]]],
])test(`rough selection margins do not dictate the physical corners of ${heart.join('/')}`,()=>{
  const input=heartPhoto({width:1024,height:595,hearts:[heart,[780,120,170,150,-160,160]],colours:['#43a34e','#cc2949'],background:'#615345'});
  const before=input.rgba.slice();
  for(const roi of regions){
    const candidate=detectHeartCrops(input,{roi}).candidates[0];
    assert.ok(candidate);assert.ok(supportedCropOutline(candidate.locator));
    assert.ok(maxError(candidate.quad,corners(heart))<6);
    assert.equal(candidate.locator.selectionRefinement.method,'foreground-within-rough-selection');
    assert.deepEqual(candidate.provenance.roughRegion,roi);
    assert.deepEqual(candidate.provenance.sourceDimensions,[1024,595]);
  }
  assert.deepEqual(input.rgba,before);
});

test('selection bounds ignore neighbouring paper in the expanded context and leave cached fields unchanged',()=>{
  const heart=[180,200,100,80,-100,80],roi=[20,20,360,430];
  const input=heartPhoto({width:1000,height:595,hearts:[heart,[600,80,170,150,-160,160]],colours:['#43a34e','#cc2949'],background:'#615345'});
  const detect=createMotifDetector({width:input.imageWidth,height:input.imageHeight,data:input.rgba},{roi,palette:'adaptive',maxSize:650});
  const before=detect(),selected=detect(0,{refineSelection:true});
  assert.ok(supportedCropOutline(selected));
  assert.ok(maxError(selected.quad.map(p=>p.map(v=>v+.5)),corners(heart))<6);
  assert.deepEqual(detect().quad,before.quad);
  assert.deepEqual(detect().evidence,before.evidence);
});

test('a successful original crop is preserved without selection refinement',()=>{
  const input=heartPhoto(),roi=[85,40,300,250];
  const original=createMotifDetector({width:input.imageWidth,height:input.imageHeight,data:input.rgba},{roi,maxSize:650})();
  assert.ok(supportedCropOutline(original));
  const candidate=detectHeartCrops(input,{roi}).candidates[0];
  assert.deepEqual(candidate.quad,original.quad.map(p=>p.map(v=>v+.5)));
  assert.equal(candidate.locator.selectionRefinement,undefined);
});
