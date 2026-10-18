import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {heartPhoto} from './crop-fixture.mjs';
import {makeRGBBackgroundFields} from '../../static/inverse/locator/rgb-background.js';
import {createMotifDetector} from '../../static/inverse/locator/locator.js';
import {detectHeartCrops,pixelCentresToEdges,supportedCropOutline} from '../../static/inverse/core/crop.js';

const expected=[[190,80],[275,155],[190,230],[105,155]];
const image=input=>({width:input.imageWidth,height:input.imageHeight,data:input.rgba});
const cornerError=quad=>Math.max(...quad.map((p,i)=>Math.hypot(p[0]-expected[i][0],p[1]-expected[i][1])));

async function tintedPhoto({gain=1,depths=[.5,.5],height=320}={}){
  const source=heartPhoto({background:'transparent',colours:['#ba1527','#e5d5d5'],lobeDepths:depths});
  const canvas=createCanvas(380,height),ctx=canvas.getContext('2d'),d=ctx.createImageData(380,height);
  for(let y=0;y<height;y++)for(let x=0;x<380;x++){
    const i=4*(y*380+x),a=source.rgba[i+3]/255,texture=4*Math.sin(.21*x)+3*Math.sin(.31*y);
    const bg=[105,85,70].map((v,k)=>v+([175,165,160][k]-v)*x/379);
    for(let k=0;k<3;k++)d.data[i+k]=gain*(a*source.rgba[i+k]+(1-a)*(bg[k]+texture));
    d.data[i+3]=255;
  }
  ctx.putImageData(d,0,0);ctx.drawImage(await loadImage(canvas.toBuffer('image/jpeg',{quality:.75})),0,0);
  return{imageWidth:380,imageHeight:height,rgba:ctx.getImageData(0,0,380,height).data};
}

test('RGB background separation requires observed red, pale and background colours',()=>{
  for(const options of [{background:'transparent'},{colours:['#ba1527','#ba1527']},{hearts:[]}]){
    assert.equal(makeRGBBackgroundFields(image(heartPhoto(options))),null);
  }
  // Colours elsewhere in the photograph must not supply missing evidence in
  // the selected region. This rectangle contains background only.
  assert.equal(makeRGBBackgroundFields(image(heartPhoto()),{roi:[0,0,40,40]}),null);
});

test('RGB crop hypotheses recover known corners despite similar paper/background hues',async()=>{
  for(const options of [{},{gain:.9},{depths:[.66,.61]}]){
    const source=await tintedPhoto(options),before=source.rgba.slice();
    const detect=createMotifDetector(image(source),{roi:[85,40,300,250],maxSize:650,palette:'rgb-background'});
    for(const extendLowerBand of [false,true]){
      const proposal=detect(0,{extendLowerBand});
      assert.ok(supportedCropOutline(proposal));
      assert.ok(cornerError(pixelCentresToEdges(proposal.quad))<3);
    }
    assert.deepEqual(source.rgba,before);
  }
});

test('automatic crop keeps an already supported ordinary heart unchanged',()=>{
  const source=heartPhoto(),original=createMotifDetector(image(source),{maxSize:650})(),crop=detectHeartCrops(source).candidates[0];
  assert.ok(supportedCropOutline(original));
  assert.deepEqual(crop.quad,pixelCentresToEdges(original.quad));
  assert.equal(crop.locator.backgroundRefinement,undefined);
});

test('a genuinely clipped tip is not clamped into a complete RGB crop',async()=>{
  const source=await tintedPhoto({height:215});
  const crop=detectHeartCrops(source,{roi:[85,40,300,215]}).candidates[0];
  assert.ok(crop);
  assert.ok(crop.quad[2][1]>215);
  assert.equal(crop.locator.backgroundRefinement,undefined);
});

test('collage bauble finds observed lower edges without changing its source pixels',async()=>{
  const photo=await loadImage(new URL('./fixtures/hard-photos/collage.png',import.meta.url).pathname);
  const canvas=createCanvas(photo.width,photo.height),ctx=canvas.getContext('2d');ctx.drawImage(photo,0,0);
  const source={imageWidth:photo.width,imageHeight:photo.height,rgba:ctx.getImageData(0,0,photo.width,photo.height).data};
  const before=source.rgba.slice(),crop=detectHeartCrops(source,{roi:[456,860,711,1112]}).candidates[0];
  assert.ok(crop&&supportedCropOutline(crop.locator));
  assert.equal(crop.locator.backgroundRefinement.method,'rgb-paper-segment-background');
  assert.ok(crop.quad.every(([x,y])=>x>=0&&y>=0&&x<=photo.width&&y<=photo.height));
  assert.ok(crop.locator.evidence.lowerLines.points.every(side=>side.length>30));
  assert.deepEqual(source.rgba,before);
  // No exact overlap-corner ground truth exists for this photo. Independent
  // template reconstruction is measured separately, against a frozen crop.
});
