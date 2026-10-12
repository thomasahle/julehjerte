import test from 'node:test';
import assert from 'node:assert/strict';
import {heartPhoto} from './crop-fixture.mjs';
import {correlatedBackground} from '../../static/inverse/locator/background.js';
import {makePaletteFields} from '../../static/inverse/locator/palette.js';
import {detectHeartCrops,supportedCropOutline} from '../../static/inverse/core/crop.js';

test('background distance separates hue changes from equally large brightness changes',()=>{
  const samples=Array.from({length:400},(_,i)=>{const t=.12*Math.sin(i*.7);return[.35+t,.40+t,.45+t];});
  const model=correlatedBackground(samples);assert.ok(model);
  assert.ok(model.distance([.39,.44,.49])<2);
  assert.ok(model.distance([.39,.36,.49])>5);
  const uniform=correlatedBackground(Array.from({length:100},()=>[.5,.5,.5]));
  assert.equal(uniform.distance([.5,.5,.5]),0);
  assert.ok(Number.isFinite(uniform.distance([1,0,1])));
});

test('a small clipped object does not teach the border model its paper color',()=>{
  const samples=Array.from({length:400},(_,i)=>i<30?[.9,.1,.1]:[.3+.025*Math.sin(i),.35+.025*Math.sin(i),.4+.025*Math.sin(i)]);
  const model=correlatedBackground(samples);assert.ok(model);assert.ok(model.distance([.9,.1,.1])>10);
  assert.ok(model.outlierFraction>=30/400);
});

function shadedPhoto({background,colours,exposure=1,angle=0,empty=false}){
  const original=[[190,80],[275,155],[190,230],[105,155]],c=Math.cos(angle*Math.PI/180),s=Math.sin(angle*Math.PI/180);
  const quad=original.map(([x,y])=>[190+c*(x-190)-s*(y-160),160+s*(x-190)+c*(y-160)]),[x,y]=quad[0];
  const source=heartPhoto({background:'transparent',colours,hearts:empty?[]:[[x,y,quad[1][0]-x,quad[1][1]-y,quad[3][0]-x,quad[3][1]-y]]});
  for(let y=0;y<source.imageHeight;y++)for(let x=0;x<source.imageWidth;x++){
    const i=4*(y*source.imageWidth+x),a=source.rgba[i+3]/255;
    // The background has stripes; the paper has a separate smooth exposure gradient.
    const backgroundLight=exposure*(1+.20*Math.sin(y*.08+x*.015)+.15*(x/source.imageWidth-.5));
    const paperLight=exposure*(1+.12*(x/source.imageWidth-.5)+.12*(y/source.imageHeight-.5));
    for(let k=0;k<3;k++)source.rgba[i+k]=paperLight*a*source.rgba[i+k]+backgroundLight*(1-a)*background[k];
    source.rgba[i+3]=255;
  }
  return{source,quad};
}

for(const background of [[80,84,81],[65,150,69],[67,84,155]])test(`two dark papers survive correlated background shading ${background.join('/')}`,()=>{
  const {source,quad}=shadedPhoto({background,colours:['#21552d','#d41b2e']}),before=source.rgba.slice();
  const result=detectHeartCrops(source),candidate=result.candidates[0];
  assert.ok(candidate);assert.ok(supportedCropOutline(candidate.locator));
  assert.ok(Math.max(...quad.map((p,i)=>Math.hypot(p[0]-candidate.quad[i][0],p[1]-candidate.quad[i][1])))<6);
  assert.deepEqual(source.rgba,before);
});

test('low-contrast paper separation follows within-paper variation across exposure',()=>{
  for(const exposure of [.75,1]){
    const {source,quad}=shadedPhoto({background:[107,75,156],colours:['#bdc0aa','#eeead5'],exposure});
    const result=detectHeartCrops(source),candidate=result.candidates[0];assert.ok(candidate);
    assert.ok(supportedCropOutline(candidate.locator));
    assert.ok(Math.max(...quad.map((p,i)=>Math.hypot(p[0]-candidate.quad[i][0],p[1]-candidate.quad[i][1])))<6);
  }
});

test('background texture alone supplies neither two papers nor a heart',()=>{
  const {source}=shadedPhoto({background:[67,84,155],colours:['#21552d','#d41b2e'],empty:true});
  assert.equal(makePaletteFields({width:source.imageWidth,height:source.imageHeight,data:source.rgba}),null);
  assert.deepEqual(detectHeartCrops(source).candidates,[]);
});
