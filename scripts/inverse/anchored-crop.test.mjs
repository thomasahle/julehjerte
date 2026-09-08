import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {heartPhoto} from './crop-fixture.mjs';
import {detectHeartCrops} from '../../static/inverse/core/crop.js';
import {detectMotif} from '../../static/inverse/locator/locator.js';

const expected=[[190,80],[275,155],[190,230],[105,155]];
const error=(a,b)=>Math.max(...a.map((p,i)=>Math.hypot(p[0]-b[i][0],p[1]-b[i][1])));
function background(){
  const canvas=createCanvas(380,320),ctx=canvas.getContext('2d'),g=ctx.createLinearGradient(0,0,380,320);
  g.addColorStop(0,'#c1b6a4');g.addColorStop(.5,'#7e6855');g.addColorStop(1,'#d3c8b4');ctx.fillStyle=g;ctx.fillRect(0,0,380,320);
  ctx.strokeStyle='#3c4930';for(let i=0;i<14;i++){ctx.beginPath();ctx.moveTo(0,i*20);ctx.lineTo(100,i*20-40);ctx.stroke();}
  return {canvas,ctx};
}
function input(canvas){return {imageWidth:canvas.width,imageHeight:canvas.height,rgba:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data};}
for(const colours of[['#b85211','#aa9479'],['#aa9479','#b85211'],['#bc1324','#9b9290']])test(`dim paper on a textured background: ${colours.join('/')}`,()=>{
  const {canvas,ctx}=background();ctx.drawImage(heartPhoto({background:'transparent',colours}).canvas,0,0);
  const source=input(canvas),before=source.rgba.slice(),r=detectHeartCrops(source);
  assert.equal(r.candidates.length,1);assert.ok(error(r.candidates[0].quad,expected)<4);
  assert.equal(r.candidates[0].needsReview,true);
  assert.equal(r.candidates[0].locator.evidence.anchored.method,'coloured-component-and-learned-pale-paper');
  assert.deepEqual(source.rgba,before);
});

test('the fallback rejects coloured circles, rectangles and checker diamonds without lobes',()=>{
  for(const shape of['circle','rectangle','checker-diamond']){
    const {canvas,ctx}=background();ctx.save();ctx.beginPath();
    if(shape==='circle')ctx.arc(190,160,100,0,Math.PI*2);
    else if(shape==='rectangle')ctx.rect(90,60,200,200);
    else{ctx.translate(190,50);ctx.rotate(Math.PI/4);ctx.rect(0,0,150,150);}
    ctx.clip();
    if(shape==='checker-diamond'){for(let y=0;y<6;y++)for(let x=0;x<6;x++){ctx.fillStyle=(x+y)%2?'#b85211':'#aa9479';ctx.fillRect(x*25,y*25,25,25);}}
    else{ctx.fillStyle='#b85211';ctx.fillRect(0,0,190,320);ctx.fillStyle='#aa9479';ctx.fillRect(190,0,190,320);}
    ctx.restore();const source=input(canvas);
    assert.equal(detectMotif({width:canvas.width,height:canvas.height,data:source.rgba},{palette:'anchored',maxSize:650}).quad,null,shape);
    assert.deepEqual(detectHeartCrops(source).candidates,[],shape);
  }
});

test('the supplied orange photo gets editable corners without a manual selection',async()=>{
  const im=await loadImage(new URL('./fixtures/hard-user/tilted-orange-weave.png',import.meta.url).pathname),canvas=createCanvas(im.width,im.height),ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
  const original=input(canvas),baseline=detectHeartCrops(original).candidates[0];
  assert.ok(baseline);assert.equal(baseline.needsReview,true);assert.equal(baseline.provenance.roughRegion,null);
  // Three visible physical edge landmarks; the obscured notch is deliberately
  // not treated as a surveyed ground-truth point.
  assert.ok(error(baseline.quad.slice(1),[[845,574],[350,921],[55,451]])<20);
  for(const gain of[.9,1.1]){
    const source={...original,rgba:original.rgba.slice()};for(let i=0;i<source.rgba.length;i++)if(i%4<3)source.rgba[i]*=gain;
    const r=detectHeartCrops(source).candidates[0];assert.ok(r,`exposure ${gain}`);assert.ok(error(r.quad,baseline.quad)<16);
  }
  const half=createCanvas(Math.round(im.width/2),Math.round(im.height/2));half.getContext('2d').drawImage(canvas,0,0,half.width,half.height);
  const small=detectHeartCrops(input(half)).candidates[0];assert.ok(small);assert.ok(error(small.quad.map(p=>p.map(v=>2*v)),baseline.quad)<16);
  const padded=createCanvas(im.width+120,im.height+120),pc=padded.getContext('2d');pc.fillStyle='#a39b83';pc.fillRect(0,0,padded.width,padded.height);pc.drawImage(canvas,60,60);
  const p=detectHeartCrops(input(padded)).candidates[0];assert.ok(p);assert.ok(error(p.quad.map(q=>q.map(v=>v-60)),baseline.quad)<16);
  const selected=detectHeartCrops(original,{roi:[15,5,990,940]}).candidates[0];assert.ok(selected);assert.ok(error(selected.quad,baseline.quad)<1e-8);
});
