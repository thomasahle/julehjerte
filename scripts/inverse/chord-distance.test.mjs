import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareChord,chordDistance,chordClearance} from '../../static/inverse/core/chord-distance.js';
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

test('core membership preserves hypot decisions on both sides of threshold ties',()=>{
  let seed=318;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)+.5)/4294967296;
  for(const exponent of [-320,-310,-200,-155,-100,-5,0,5,100,150])for(let i=0;i<1000;i++){
    const scale=10**exponent,coordinate=()=>scale*(random()-.5),a=[coordinate(),coordinate()],b=i%13===0?a:[coordinate(),coordinate()],p=[coordinate(),coordinate()],chord=prepareChord(a,b),distance=chordDistance(...p,chord);
    for(const factor of [0,.5,1-64*Number.EPSILON,1-2*Number.EPSILON,1,1+2*Number.EPSILON,1+64*Number.EPSILON,2])for(const which of [0,1]){
      const lower=which?distance*.5:distance*factor,upper=which?distance*factor:distance*2;
      if(lower>upper)continue;
      const expected=Number(distance>lower)|Number(distance>upper)*2;
      assert.equal(chordClearance(...p,chord,lower,upper),expected,JSON.stringify({exponent,i,which,factor,lower,upper}));
    }
  }
});

test('core membership handles negative lower guards, endpoints and degenerate chords',()=>{
  for(const [a,b]of [[[0,0],[10,0]],[[2,3],[2,3]],[[0,0],[0,10]],[[0,0],[1e200,1e200]]])for(const p of [[0,0],[-3,4],[5,3],[13,4],[5,7],[1e-160,1e-160],[1e200,0]])for(const [lower,upper]of [[-.3,.3],[0,0],[0,1e-160],[2,3],[3,5],[5,5],[5,Infinity]]){
    const chord=prepareChord(a,b),distance=chordDistance(...p,chord);
    assert.equal(chordClearance(...p,chord,lower,upper),Number(distance>lower)|Number(distance>upper)*2);
  }
});
