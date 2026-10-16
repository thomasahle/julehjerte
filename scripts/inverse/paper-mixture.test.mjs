import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {classifyPaperMixture} from './learning/paper-mixture.mjs';

const colors=[[160,16,16],[224,224,208]].map(c=>c.map(v=>v/255));
test('fixed paper mixture preserves fractions under scalar illumination and sheet exchange',()=>{
  for(const light of [.25,.5,.75,1])for(const p of [0,.25,.5,.75,1]){
    const rgb=Uint8Array.from(colors[0],(v,k)=>Math.round(255*light*((1-p)*v+p*colors[1][k])));
    const result=classifyPaperMixture(rgb,colors),exchanged=classifyPaperMixture(rgb,[...colors].reverse());
    assert.equal(result.metadata.model,'nonnegative-color-mixture');
    assert.ok(Math.abs(result.probability[0]-p)<1e-12);assert.ok(Math.abs(exchanged.probability[0]-(1-p))<1e-12);
  }
});

test('collinear grey paper uses affine colour differences and zero light stays ambiguous',()=>{
  const result=classifyPaperMixture(Uint8Array.from([25,25,25,125,125,125,225,225,225]),[[25,25,25],[225,225,225]].map(c=>c.map(v=>v/255)));
  assert.equal(result.metadata.model,'affine-color-segment');assert.deepEqual([...result.probability],[0,.5,1]);
  assert.equal(classifyPaperMixture(new Uint8Array(3),colors).probability[0],.5);
});

test('missing source pixels stay neutral regardless of their display colour',()=>{
  const rgb=Uint8Array.from([160,16,16,0,255,80,224,224,208]),validMask=Uint8Array.from([1,0,1]);
  const first=classifyPaperMixture(rgb,colors,{validMask});rgb.set([255,0,200],3);
  assert.deepEqual(classifyPaperMixture(rgb,colors,{validMask}),first);
  assert.equal(first.probability[1],.5);assert.equal(first.mask[1],0);assert.deepEqual([...validMask],[1,0,1]);
});

test('the JavaScript port agrees with independent Python mixture fixtures',async()=>{
  const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/paper-mixture-python.json',import.meta.url)));
  for(const row of fixture.cases){
    const actual=classifyPaperMixture(Uint8Array.from(fixture.rgb),row.colors,{mode:row.mode});
    assert.equal(actual.metadata.model,row.model);
    for(let i=0;i<row.probability.length;i++){
      assert.ok(Math.abs(actual.probability[i]-row.probability[i])<2e-12);
      if(Math.abs(row.probability[i]-.5)>1e-12)assert.equal(actual.mask[i],Number(row.probability[i]>=.5));
    }
  }
});

test('invalid mixture inputs fail instead of silently changing paper classification',()=>{
  for(const c of [[[.2,.2,.2],[.2,.2,.2]],[[NaN,0,0],[1,1,1]],[[0,0],[1,1,1]],[[0,0,0],[2,1,1]]])assert.throws(()=>classifyPaperMixture(new Uint8Array(3),c));
  assert.throws(()=>classifyPaperMixture(new Uint8Array(4),colors),/packed/);
  assert.throws(()=>classifyPaperMixture(new Uint8Array(3),colors,{validMask:[2]}),/observation/);
  assert.throws(()=>classifyPaperMixture(new Uint8Array(3),colors,{mode:'unknown'}),/Unknown/);
});
