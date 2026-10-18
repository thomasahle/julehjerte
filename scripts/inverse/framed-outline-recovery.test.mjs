import test from 'node:test';
import assert from 'node:assert/strict';
import {framedCropPhoto,framedCropCorners,framedCropROI} from './framed-crop-fixture.mjs';
import {detectHeartCrops,supportedCropOutline} from '../../static/inverse/core/crop.js';
import {backgroundMixtureFields} from '../../static/inverse/locator/background-mixture.js';

for(const depths of [[.5,.5],[.66,.61]])for(const end of [[175,165,160],[190,180,175]])test(`physical outline displaces an interior frame, lobes ${depths}, background ${end}`,async()=>{
  const input=await framedCropPhoto({depths,end}),before=input.rgba.slice();
  const crop=detectHeartCrops(input,{roi:framedCropROI}).candidates[0],recovery=crop?.locator.outlineRecovery;
  assert.ok(crop&&supportedCropOutline(crop.locator));
  assert.equal(recovery.accepted,true);
  assert.equal(recovery.initialAudit.passed,false);
  assert.equal(recovery.alternativeAudit.passed,true);
  assert.ok(recovery.initialAudit.lowerOutlineSupport.some(s=>s<.65));
  assert.ok(recovery.alternativeAudit.lowerOutlineSupport.every(s=>s>=.65));
  const error=quad=>Math.max(...quad.map((p,i)=>Math.hypot(p[0]-framedCropCorners[i][0],p[1]-framedCropCorners[i][1])));
  assert.ok(error(recovery.previousQuad.map(p=>p.map(v=>v+.5)))>8);
  assert.ok(error(crop.quad)<2);
  assert.deepEqual(input.rgba,before,'Registration must not edit source pixels');
});

test('outline recovery does not turn a clipped frame into an in-photo heart',async()=>{
  const input=await framedCropPhoto({height:215});
  const crop=detectHeartCrops(input,{roi:[85,40,300,215]}).candidates[0];
  assert.ok(crop);
  assert.ok(crop.quad[2][1]>215);
  assert.equal(crop.locator.outlineRecovery,undefined);
});

test('three-colour registration estimates paper coverage independently of red fraction',()=>{
  const w=32,h=32,background=[.1,.15,.2],colors=[[.7,.2,.2],[.9,.85,.8]],rgba=new Uint8ClampedArray(w*h*4),expected=[];
  for(let i=0;i<w*h;i++){
    const paper=(i%16)/15,red=Math.floor(i/16)%16/15,alpha=i%7===0?.5:1;
    for(let c=0;c<3;c++)rgba[4*i+c]=255*((1-paper)*background[c]+paper*(red*colors[0][c]+(1-red)*colors[1][c]));
    rgba[4*i+3]=255*alpha;expected.push(paper*rgba[4*i+3]/255);
  }
  const fields={w,h,chroma:new Float32Array(w*h).fill(.4),palette:{colors,backgroundModel:{mean:background,covariance:[[.01,0,0],[0,.01,0],[0,0,.01]]}}};
  const before=rgba.slice(),result=backgroundMixtureFields({data:rgba},fields);
  assert.ok(result.palette.paperForeground);
  assert.ok(result.paper.every((v,i)=>Math.abs(v-expected[i])<.015));
  assert.ok(result.paper.every(v=>v>=0&&v<=1));
  assert.equal(fields.paper,undefined,'The original fields remain independent');
  assert.deepEqual(rgba,before);
});

test('an unidentifiable colour triangle cannot manufacture new foreground evidence',()=>{
  const f={palette:{colors:[[.2,.2,.2],[.3,.3,.3]],backgroundModel:{mean:[.1,.1,.1],covariance:[[1,0,0],[0,1,0],[0,0,1]]}}};
  assert.equal(backgroundMixtureFields({},f),f);
  const singular={...f,palette:{...f.palette,backgroundModel:{mean:[0,0,0],covariance:[[1,1,1],[1,1,1],[1,1,1]]}}};
  assert.equal(backgroundMixtureFields({},singular),singular);
});
