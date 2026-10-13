import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleRings} from '../../static/inverse/core/validate.js';

// The exported anti-symmetric hat traverses this exact shared span in opposite
// directions. Its two floating-point intersections straddled a sample by 1 ULP.
const a=[66.37439226934987,33.625607730650145],b=[34.820370404349006,65.17962959565098];
const ring=[a,b,[20,20],a],n=101;

test('shared rings cancel exactly regardless of traversal direction',()=>{
  for(const phase of [0,1])for(const dx of [0,1e-13,-1e-13]){
    const shifted=ring.map(([x,y])=>[x+dx,y]),saved=structuredClone(shifted);
    const mask=sampleRings([shifted,shifted.toReversed()],100,phase,n);
    assert.ok(mask.every(v=>v===phase),'An exactly shared cut cannot create a one-pixel seam.');
    assert.deepEqual(shifted,saved);
  }
});

test('a sample exactly on a segment uses the same tie rule in either direction',()=>{
  assert.deepEqual(sampleRings([ring],100,0,n),sampleRings([ring.toReversed()],100,0,n));
});

test('regional sampling is identical to a full render on its requested rows',()=>{
  const rows=[n-1,44,0,56,45];
  for(const phase of [0,1])for(const rings of [[ring],[ring.toReversed()],[ring,ring.toReversed()]]){
    const full=sampleRings(rings,100,phase,n),partial=sampleRings(rings,100,phase,n,rows);
    for(let j=0;j<n;j++){
      const actual=partial.subarray(j*n,(j+1)*n);
      assert.deepEqual(actual,rows.includes(j)?full.subarray(j*n,(j+1)*n):new Uint8Array(n));
    }
    assert.ok(sampleRings(rings,100,phase,n,[]).every(v=>v===0));
  }
});

test('normalizing traversal does not erase a genuinely distinct narrow region',()=>{
  const x=(44+.5)*100/n,epsilon=1e-8;
  const rect=right=>[[10,40],[right,40],[right,70],[10,70],[10,40]];
  for(const phase of [0,1]){
    const mask=sampleRings([rect(x-epsilon),rect(x+epsilon).toReversed()],100,phase,n);
    assert.equal(mask[56*n+44],phase^1);
    assert.equal(mask[56*n+43],phase);assert.equal(mask[56*n+45],phase);
  }
});
