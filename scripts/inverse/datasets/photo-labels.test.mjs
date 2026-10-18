import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {loadImage} from 'canvas';
import {heartPhoto} from '../crop-fixture.mjs';
import {Cubic} from '../../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../../static/inverse/core/direct/curves.js';
import {solutionJSON} from '../../../static/inverse/core/graph.js';
import {renderExportedWeave} from '../export-renderer.mjs';
import {labelsForCrop,savedCropQuad,scoreReferenceMask} from '../learning/photo-labels.mjs';

test('reference scores reject differently sampled masks instead of comparing flattened strides',()=>{
  const target=new Uint8Array(4),valid=new Uint8Array(4).fill(1);
  assert.throws(()=>scoreReferenceMask(new Uint8Array(9),target,valid),/dimensions differ/);
  assert.throws(()=>scoreReferenceMask(target,target,new Uint8Array(9)),/dimensions differ/);
  const mask=Uint8Array.of(0,1,1,1),truth=Uint8Array.of(0,0,1,0),observed=Uint8Array.of(1,1,1,0);
  assert.deepEqual(scoreReferenceMask(mask,truth,observed),{mismatchFraction:1/3,inverted:false,observedPixels:3,observedFraction:.75});
  assert.deepEqual(scoreReferenceMask(mask.map(v=>1-v),truth,observed),{mismatchFraction:1/3,inverted:true,observedPixels:3,observedFraction:.75});
  assert.equal(scoreReferenceMask(mask,truth,new Uint8Array(4)),null);
});

test('full photo replay uses the prepared resolution when the source is smaller than requested',{timeout:30000},async()=>{
  await fs.mkdir('tmp',{recursive:true});const directory=await fs.mkdtemp('tmp/photo-score-'),root=path.resolve(directory);
  try{
    const asset=async(name,bytes)=>{await fs.writeFile(path.join(root,name),bytes);return{path:name,sha256:createHash('sha256').update(bytes).digest('hex')};};
    const vertical=[25,50,75].map(x=>[Cubic.line([x,0],[x,100]).p]);
    const graph=new CurveGraph([vertical,vertical.map(p=>p.map(c=>c.map(([x,y])=>[y,x])))]),cuts=solutionJSON(graph.solution(graph.points,-1));
    const canonical=await renderExportedWeave(cuts,128),photo=heartPhoto();
    const manifest={status:'complete',sourceDataset:root,designs:[{id:'checker',
      sourceCanonical:await asset('canonical.png',canonical.png),sourceCuts:await asset('cuts.json',JSON.stringify(cuts))}],
    rows:[{id:'small-photo',designId:'checker',variant:'baseline',assets:{
      'photo.jpg':await asset('photo.jpg',photo.canvas.toBuffer('image/jpeg')),
      'labels.json':await asset('labels.json',JSON.stringify({actualQuad:[[190,80],[275,155],[190,230],[105,155]],canonicalToPhoto:[.85,-.85,190,.75,.75,80,0,0,1]}))}}]};
    await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest));
    const output=path.join(root,'replay');
    await promisify(execFile)(process.execPath,['scripts/inverse/learning/photo-pipeline.mjs',`--probe=${root}`,`--output=${output}`,'--seconds=10']);
    const report=JSON.parse(await fs.readFile(path.join(output,'report.json'))),row=report.rows[0];
    assert.equal(report.status,'complete');assert.equal(row.status,'checked-pair',row.error);
    assert.equal(report.configuration.resolution,384);assert.equal(row.resolution,320);
    for(const name of ['crop.png','mask.png','woven.png','latent-mask.png','latent-valid.png']){
      const image=await loadImage(path.join(output,row.assets[name].path));
      assert.equal(image.width,320);assert.equal(image.height,320);
    }
    assert.ok(row.classifiedReference.mismatchFraction<.02);
    assert.ok(row.exportedReference.mismatchFraction<.02);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

const n=20,data=new Uint8ClampedArray(n*n*4);
for(let y=0;y<n;y++)for(let x=0;x<n;x++)data.set(x<7&&y<12?[0,0,0,255]:[255,255,255,255],4*(y*n+x));
const canonical={width:n,height:n,data};

test('cross-run scoring uses each fitted crop instead of the initial noisy proposal',()=>{
  const proposed=[[1,1],[101,1],[101,101],[1,101]],actual=[[0,0],[100,0],[100,100],[0,100]],labels={proposedCropQuad:proposed};
  assert.deepEqual(savedCropQuad({selectedCrop:{quad:actual}},labels,'heart-photo-pipeline-1'),actual);
  assert.deepEqual(savedCropQuad({report:{input:{sourceImage:{cropCorners:actual}}}},labels,'heart-photo-pipeline-1'),actual);
  assert.deepEqual(savedCropQuad({},labels,'heart-intervention-solves-1'),proposed);
  assert.throws(()=>savedCropQuad({},labels,'heart-photo-pipeline-1'),/Missing/);
  assert.throws(()=>savedCropQuad({selectedCrop:{quad:proposed},report:{input:{sourceImage:{cropCorners:actual}}}},labels,'heart-photo-pipeline-1'),/disagree/);
});

test('material scoring undoes a known camera transform without changing crop orientation',()=>{
  // A quarter turn, 2 pixels/mm scale and translation; coordinates are edges.
  const labels={canonicalToPhoto:[0,-2,250,2,0,30,0,0,1]},quad=[[250,30],[250,230],[50,230],[50,30]];
  const scored=labelsForCrop(labels,quad,canonical,n,300,300);
  assert.equal(scored.valid.reduce((s,v)=>s+v,0),n*n);
  assert.deepEqual(scored.target,Uint8Array.from({length:n*n},(_,i)=>Number(i%n<7&&Math.floor(i/n)<12)));
  // Reversing the user-selected winding transposes the material; scoring
  // must follow the actual crop rather than silently canonicalizing it.
  const reversed=labelsForCrop(labels,[quad[0],quad[3],quad[2],quad[1]],canonical,n,300,300);
  assert.deepEqual(reversed.target,Uint8Array.from({length:n*n},(_,i)=>Number(i%n<12&&Math.floor(i/n)<7)));
});

test('scoring excludes background and out-of-photo material independently',()=>{
  const labels={canonicalToPhoto:[1,0,0,0,1,0,0,0,1]},quad=[[-25,-25],[125,-25],[125,125],[-25,125]];
  const scored=labelsForCrop(labels,quad,canonical,n,60,80);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const px=-25+(x+.5)*150/n,py=-25+(y+.5)*150/n;
    assert.equal(scored.valid[y*n+x],Number(px>=0&&py>=0&&px<=60&&py<=80));
  }
});
