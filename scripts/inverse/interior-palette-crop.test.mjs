import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createCanvas,loadImage} from 'canvas';
import {heartPhoto} from './crop-fixture.mjs';
import {readHardPhoto} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {reviewMaterialSamples} from './photo-material-samples.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {detectMotif} from '../../static/inverse/locator/locator.js';
import {makeInteriorPaletteFields} from '../../static/inverse/locator/interior-palette.js';
import {fillSmallMaskHoles} from '../../static/inverse/locator/fields.js';
import {detectHeartCrops,supportedCropOutline,pixelCentresToEdges} from '../../static/inverse/core/crop.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';

const expected=[[190,80],[275,155],[190,230],[105,155]];
const cornerError=quad=>Math.max(...quad.map((p,i)=>Math.hypot(p[0]-expected[i][0],p[1]-expected[i][1])));
const image=source=>({width:source.imageWidth,height:source.imageHeight,data:source.rgba});
function shadedHeart(colours,gain=1){
  const source=heartPhoto({background:'transparent',colours}),{imageWidth:w,imageHeight:h,rgba}=source;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=4*(y*w+x),alpha=rgba[i+3]/255;
    // Neutral background/shadow varies independently from the paper tint.
    const shadow=.17*Math.exp(-((x-205)**2/8500+(y-182)**2/6200));
    for(let c=0;c<3;c++)rgba[i+c]=gain*(alpha*rgba[i+c]+(1-alpha)*255*(1-shadow));
    rgba[i+3]=255;
  }
  return source;
}

for(const colours of [['#058bd3','#f4f2ee'],['#d93716','#eef2f4'],['#168735','#f4eef2']]){
  test(`interior paper tint retains physical corners through neutral shadows: ${colours.join('/')}`,()=>{
    for(const gain of [.8,1]){
      const source=shadedHeart(colours,gain),before=source.rgba.slice();
      const proposal=detectMotif(image(source),{palette:'interior',maxSize:650});
      assert.ok(supportedCropOutline(proposal),`gain ${gain}: ${proposal.reason}`);
      assert.ok(cornerError(pixelCentresToEdges(proposal.quad))<6);
      assert.deepEqual(source.rgba,before);
    }
  });
}

test('an invisible white sheet cannot be inferred from a neutral shadow alone',()=>{
  const source=shadedHeart(['#058bd3','#ffffff']);
  assert.equal(makeInteriorPaletteFields(image(source)),null);
});

test('the interior-tint fallback does not turn checker rectangles or diamonds into hearts',()=>{
  for(const diamond of [false,true]){
    const canvas=createCanvas(380,320),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,380,320);
    ctx.save();ctx.translate(diamond?190:90,diamond?40:60);if(diamond)ctx.rotate(Math.PI/4);
    const size=diamond?155:200;
    for(let y=0;y<4;y++)for(let x=0;x<4;x++){ctx.fillStyle=(x+y)%2?'#058bd3':'#f4f2ee';ctx.fillRect(x*size/4,y*size/4,size/4,size/4);}
    ctx.restore();
    const proposal=detectMotif({width:380,height:320,data:ctx.getImageData(0,0,380,320).data},{palette:'interior',maxSize:650});
    assert.equal(proposal.quad,null,diamond?'diamond':'rectangle');
  }
});

test('registration fills only small observed holes and preserves diagonal exterior openings',()=>{
  const w=40,h=30,mask=new Uint8Array(w*h);
  for(let y=3;y<27;y++)for(let x=3;x<37;x++)mask[y*w+x]=1;
  for(let y=8;y<11;y++)for(let x=8;x<11;x++)mask[y*w+x]=0;
  for(let y=6;y<12;y++)for(let x=20;x<26;x++)mask[y*w+x]=0;
  for(let y=20;y<22;y++)for(let x=10;x<12;x++)mask[y*w+x]=0;
  for(let i=0;i<=5;i++)mask[i*w+i]=0;
  const before=mask.slice(),result=fillSmallMaskHoles(mask,w,h,{maxArea:12,canFill:i=>i!==20*w+10});
  assert.equal(result.filledPixels,9);assert.equal(result.filledComponents,1);
  assert.equal(result.mask[9*w+9],1);
  assert.equal(result.mask[8*w+22],0,'large omissions are not inferred');
  assert.equal(result.mask[21*w+11],0,'one unknown pixel prevents filling the entire hole');
  assert.equal(result.mask[5*w+5],0,'a diagonal opening remains connected to the exterior');
  assert.deepEqual(mask,before);
});

async function checkStar(jpeg=false){
  const catalog=JSON.parse(await fs.readFile(new URL('./photo-cases.json',import.meta.url)));
  const spec=catalog.cases.find(r=>r.id==='bibel-star-outline');let source=await readHardPhoto(spec);
  if(jpeg){
    const canvas=createCanvas(source.imageWidth,source.imageHeight),ctx=canvas.getContext('2d');
    ctx.drawImage(source.canvas,0,0);
    ctx.drawImage(await loadImage(canvas.toBuffer('image/jpeg',{quality:.75})),0,0);
    source={...source,canvas,rgba:ctx.getImageData(0,0,canvas.width,canvas.height).data};
  }
  const before=source.rgba.slice();
  const crop=detectHeartCrops(source).candidates[0];
  assert.ok(crop&&supportedCropOutline(crop.locator));
  assert.equal(crop.locator.evidence.palette.method,'two-paper-colours-from-interior-chromaticity');
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0};
  const prepared=prepare({...source,quad:crop.quad},cfg),target=hardPhotoTarget(prepared,'mask',cfg);
  const observations=JSON.parse(await fs.readFile(new URL('./fixtures/photo-material-samples.json',import.meta.url))).cases.find(r=>r.id===spec.id);
  const classified=reviewMaterialSamples(observations,{mask:prepared.preview.mask,resolution:prepared.preview.resolution,quad:crop.quad});
  assert.equal(classified.correct,28);assert.equal(classified.covered,28);
  const answer=await design(target,cfg);
  assert.equal(answer.report.templateChecksPassed,true);
  const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],prepared.preview.resolution);
  const error=rendered.mask.reduce((sum,v,i)=>sum+Number(v!==prepared.preview.mask[i]),0)/rendered.mask.length;
  assert.ok(error<(jpeg?.03:.02),`${100*error}% mask disagreement`);
  const exported=reviewMaterialSamples(observations,{mask:rendered.mask,resolution:prepared.preview.resolution,quad:crop.quad,phase:classified.phase});
  assert.equal(exported.correct,28);assert.equal(exported.covered,28);
  assert.deepEqual(source.rgba,before);
}
test('fresh automatic blue-star crop preserves photographed details through template export',()=>checkStar());
test('JPEG recompression preserves the automatic crop and photographed details through export',()=>checkStar(true));
