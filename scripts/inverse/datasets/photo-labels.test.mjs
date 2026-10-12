import test from 'node:test';
import assert from 'node:assert/strict';
import {labelsForCrop,savedCropQuad} from '../learning/photo-labels.mjs';

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
