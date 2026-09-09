import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareChord,chordDistance} from '../../static/inverse/core/chord-distance.js';
import {segmentDistance} from '../../static/inverse/core/bezier.js';

test('prepared chord queries preserve endpoint, projection and degenerate distances exactly',()=>{
  const cases=[
    [[0,0],[10,0],[-3,4],5],[[0,0],[10,0],[5,3],3],[[0,0],[10,0],[13,4],5],
    [[2,3],[2,3],[5,7],5],[[0,0],[0,10],[0,4],0],
    [[-1e150,1e150],[1e150,-1e150],[1e150,1e150]],
    [[0,0],[1e-200,1e-200],[2e-200,0]],[[0,-0],[-0,0],[-0,-0]]
  ];
  for(const [a,b,p,expected]of cases){
    const actual=chordDistance(...p,prepareChord(a,b));
    assert.ok(Object.is(actual,segmentDistance(p,a,b)));
    if(expected!==undefined)assert.equal(actual,expected);
  }
  let seed=171;
  const coordinate=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return(seed/2**32-.5)*1000;};
  for(let i=0;i<10000;i++){
    const a=[coordinate(),coordinate()],b=i%19===0?a:[coordinate(),coordinate()],p=[coordinate(),coordinate()];
    assert.ok(Object.is(chordDistance(...p,prepareChord(a,b)),segmentDistance(p,a,b)),`chord ${i}`);
  }
});

test('preparation owns the chord terms and refreshing it observes edited endpoints',()=>{
  const a=[0,0],b=[10,0],before=prepareChord(a,b);
  a[1]=2;b[1]=2;
  assert.equal(chordDistance(5,3,before),3);
  assert.equal(chordDistance(5,3,prepareChord(a,b)),1);
});
