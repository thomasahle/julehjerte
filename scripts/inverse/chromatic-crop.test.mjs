import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createCanvas,loadImage} from 'canvas';
import {heartPhoto} from './crop-fixture.mjs';
import {readHardPhoto,hardPhotoCatalogCases} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {makeChromaticPaletteFields} from '../../static/inverse/locator/chromatic-palette.js';
import {outlineContrast} from '../../static/inverse/locator/outline-evidence.js';
import {detectMotif} from '../../static/inverse/locator/locator.js';
import {detectHeartCrops,supportedCropOutline,pixelCentresToEdges} from '../../static/inverse/core/crop.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';

const expected=[[190,80],[275,155],[190,230],[105,155]];
const cornerError=(quad,reference=expected)=>Math.max(...quad.map((p,i)=>Math.hypot(p[0]-reference[i][0],p[1]-reference[i][1])));
const image=source=>({width:source.imageWidth,height:source.imageHeight,data:source.rgba});

test('physical edge contrast rejects flat pixels, nearby wrong lines and out-of-frame samples',()=>{
  const w=40,h=40,r=new Float32Array(w*h),g=r.slice(),b=r.slice(),f={w,h,r,g,b};
  const line=x=>Array.from({length:28},(_,i)=>[x,i+6]);
  assert.equal(outlineContrast(f,line(19.5)).support,0);
  for(let y=0;y<h;y++)for(let x=20;x<w;x++)r[y*w+x]=g[y*w+x]=b[y*w+x]=1;
  assert.equal(outlineContrast(f,line(19.5)).support,1);
  assert.equal(outlineContrast(f,line(20.5)).support,1,'a subpixel registration error is tolerated');
  assert.equal(outlineContrast(f,line(25)).support,0,'the search must not jump to an unrelated edge');
  assert.equal(outlineContrast(f,line(-3)).support,0);
  assert.equal(outlineContrast(f,[]).support,0);
  assert.equal(outlineContrast(f,[[20,20],[20,20]]).support,0);
});

test('two chromatic papers are required; brightness or a neutral sheet does not invent another hue',()=>{
  for(const colours of [['#125ab7','#125ab7'],['#125ab7','#fff'],['#e9e2d7','#ffffff']]){
    assert.equal(makeChromaticPaletteFields(image(heartPhoto({colours,background:'#777'}))),null);
  }
});

function texturedHeart(colours,gain){
  const source=heartPhoto({colours,background:'transparent'}),{rgba,imageWidth:w,imageHeight:h}=source;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=4*(y*w+x),alpha=rgba[i+3]/255;
    const background=.45+.2*Math.sin(x*.17)+.1*Math.cos(y*.07);
    // A colourless reflection removes foreground pixels inside the paper,
    // without moving its physical outer boundary or imposing a new silhouette.
    const reflection=.65*Math.exp(-((x-188)**2/65+(y-162)**2/700));
    for(let c=0;c<3;c++)rgba[i+c]=gain*(alpha*(rgba[i+c]*(1-reflection)+255*reflection)+(1-alpha)*255*background);
    rgba[i+3]=255;
  }
  return source;
}
for(const colours of [['#eb641e','#172f98'],['#177f35','#b81871'],['#6c169c','#daa219']]){
  test(`chromatic crop retains physical corners on a striped background: ${colours.join('/')}`,()=>{
    for(const gain of [.7,1]){
      const source=texturedHeart(colours,gain),before=source.rgba.slice();
      const proposal=detectMotif(image(source),{palette:'chromatic',maxSize:650});
      assert.ok(supportedCropOutline(proposal),JSON.stringify({gain,reason:proposal.reason,e:proposal.evidence}));
      assert.ok(cornerError(pixelCentresToEdges(proposal.quad))<6);
      assert.deepEqual(source.rgba,before);
    }
  });
}

test('chromatic lower edges cannot certify checker rectangles or diamonds without two lobes',()=>{
  for(const diamond of [false,true]){
    const canvas=createCanvas(380,320),ctx=canvas.getContext('2d');ctx.fillStyle='#777';ctx.fillRect(0,0,380,320);
    ctx.save();ctx.translate(diamond?190:90,diamond?40:60);if(diamond)ctx.rotate(Math.PI/4);
    const size=diamond?155:200;
    for(let y=0;y<4;y++)for(let x=0;x<4;x++){ctx.fillStyle=(x+y)%2?'#eb641e':'#172f98';ctx.fillRect(x*size/4,y*size/4,size/4,size/4);}
    ctx.restore();
    const proposal=detectMotif({width:380,height:320,data:ctx.getImageData(0,0,380,320).data},{palette:'chromatic',maxSize:650});
    assert.equal(proposal.quad,null,diamond?'diamond':'rectangle');
  }
});

test('colour learning uses the selected region, not another colourful object outside it',()=>{
  const canvas=createCanvas(240,80),ctx=canvas.getContext('2d');
  for(const [x,color]of [[0,'#eb641e'],[40,'#172f98'],[80,'#1fa22a'],[160,'#9f189b']]){
    ctx.fillStyle=color;ctx.fillRect(x,0,x<80?40:80,80);
  }
  const im={width:240,height:80,data:ctx.getImageData(0,0,240,80).data};
  const fields=makeChromaticPaletteFields(im,{roi:[0,0,80,80]});
  assert.ok(fields);
  assert.ok(fields.paper[20*240+20]>.95&&fields.paper[20*240+60]>.95);
  assert.ok(fields.paper[20*240+100]<.05&&fields.paper[20*240+200]<.05);
});

async function windowPhoto(){
  const catalog=JSON.parse(await fs.readFile(new URL('./fixtures/user-photos-2026-10-17/window.json',import.meta.url)));
  const spec=hardPhotoCatalogCases(catalog)[0];
  return{source:await readHardPhoto(spec),roi:spec.roi};
}
test('reflective blue/orange photograph crops automatically and fits independently rendered templates',async()=>{
  const {source,roi}=await windowPhoto(),before=source.rgba.slice();
  const crop=detectHeartCrops(source,{roi}).candidates[0];
  assert.ok(crop&&supportedCropOutline(crop.locator));
  assert.equal(crop.locator.evidence.palette.method,'two-chromatic-paper-colours');
  assert.equal(crop.locator.evidence.lowerEdgeSupportMethod,'photograph-contrast-along-fitted-outer-edges');
  // Broad independently inspected physical corner neighbourhoods, not exact
  // ground truth or solver-selected coordinates. The old manual right corner
  // was inside the paper and is deliberately not used as a reference.
  assert.ok(cornerError(crop.quad,[[199,247],[351,378],[220,521],[66,395]])<12);
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0},prepared=prepare({...source,quad:crop.quad},cfg);
  const answer=await design(hardPhotoTarget(prepared,'mask',cfg),cfg);
  assert.equal(answer.report.templateChecksPassed,true);
  const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],prepared.preview.resolution);
  const error=rendered.mask.reduce((sum,v,i)=>sum+Number(v!==prepared.preview.mask[i]),0)/rendered.mask.length;
  assert.ok(error<.015,`${100*error}% disagreement against the classified photograph`);
  assert.deepEqual(source.rgba,before);
});

test('JPEG recompression and a small selection shift retain the blue/orange heart crop',async()=>{
  const {source,roi}=await windowPhoto(),original=detectHeartCrops(source,{roi}).candidates[0];
  assert.ok(original);
  const canvas=createCanvas(source.imageWidth,source.imageHeight),ctx=canvas.getContext('2d');
  ctx.drawImage(await loadImage(source.canvas.toBuffer('image/jpeg',{quality:.8})),0,0);
  const variant={...source,rgba:ctx.getImageData(0,0,canvas.width,canvas.height).data};
  for(const [input,region]of [[variant,roi],[source,roi.map(v=>v+2)]]){
    const crop=detectHeartCrops(input,{roi:region}).candidates[0];
    assert.ok(crop&&supportedCropOutline(crop.locator));
    assert.ok(cornerError(crop.quad,original.quad)<6);
  }
});
