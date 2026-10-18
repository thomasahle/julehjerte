import test from 'node:test';
import assert from 'node:assert/strict';
import {heartPhoto} from '../crop-fixture.mjs';
import {affineNotchQuad, notchOverlapProposal, overlapEvidence} from './notch-crop.mjs';

function fixture(options = {}) {
  const source = heartPhoto({background:'#000000', colours:['#ff0000','#ffffff'], ...options});
  const w = source.imageWidth, h = source.imageHeight, n = w*h;
  const f = {w,h};
  for (const key of ['paper','chroma','r','g','b']) f[key] = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    f.r[i] = source.rgba[4*i]/255; f.g[i] = source.rgba[4*i+1]/255; f.b[i] = source.rgba[4*i+2]/255;
    f.paper[i] = f.r[i]; f.chroma[i] = f.r[i] > .5 ? 1-f.g[i]/f.r[i] : .5;
  }
  return f;
}

test('notch and lower edges recover an independent sheared affine construction', () => {
  const expected = [[160,60],[260,120],[215,230],[115,170]];
  const line = (a,b) => ({a:(b[0]-a[0])/(b[1]-a[1])});
  const q = affineNotchQuad(expected[0], {tip:expected[2],right:line(expected[1],expected[2]),left:line(expected[3],expected[2])});
  for (let i=0;i<4;i++) for(let k=0;k<2;k++) assert.ok(Math.abs(q[i][k]-expected[i][k]) < 1e-10);
});

test('silhouette notch recovers known overlap with unequal cap depths', () => {
  for (const depths of [[.5,.5],[.32,.8]]) {
    const f=fixture({lobeDepths:depths}), original=f.paper.slice(), result=notchOverlapProposal(f);
    assert.equal(result.status,'proposal',JSON.stringify(result.evidence));
    const expected=[[190,80],[275,155],[190,230],[105,155]];
    for(let i=0;i<4;i++) assert.ok(Math.hypot(...result.quad[i].map((v,k)=>v-expected[i][k]))<3,JSON.stringify(result.quad));
    assert.deepEqual(f.paper,original,'Registration must not mutate the supplied probability field');
  }
});

test('full-source paper evidence distinguishes the overlap from an undersized checker crop', () => {
  const f=fixture(), q=[[190,80],[275,155],[190,230],[105,155]];
  const component=Array.from({length:f.w*f.h},(_,i)=>i).filter(i=>f.paper[i]>.8);
  const proper=overlapEvidence(f,q,component);
  const small=q.map(p=>p.map((v,k)=>q[2][k]+.7*(v-q[2][k])));
  const wrong=overlapEvidence(f,small,component);
  assert.ok(proper.capForeignProbability.every(v=>v<.02));
  assert.ok(Math.max(...wrong.capForeignProbability)>.15,JSON.stringify(wrong));
  assert.ok(wrong.overlapBodyCoverage>.98,'The smaller crop is still filled with paper');
});

test('global exchange of paper colours leaves the crop and support unchanged', () => {
  const f=fixture(), a=notchOverlapProposal(f);
  const b=notchOverlapProposal({...f,chroma:f.chroma.map(v=>1-v)});
  assert.deepEqual(a.quad,b.quad); assert.equal(a.status,b.status);
  assert.notEqual(a.evidence.phase,b.evidence.phase);
  assert.deepEqual(a.evidence.capForeignProbability,b.evidence.capForeignProbability);
});

test('a convex disk does not supply a credible heart notch', () => {
  const f=fixture();
  for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)f.paper[y*f.w+x]=Number(Math.hypot(x-190,y-150)<90);
  assert.equal(notchOverlapProposal(f).status,'unresolved');
});

test('invalid fields are rejected rather than interpreted as confident paper', () => {
  const f=fixture(); f.paper[100]=NaN;
  assert.throws(()=>notchOverlapProposal(f),/finite/);
});
