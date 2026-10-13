import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Cubic,distance} from '../../static/inverse/core/bezier.js';
import {bbox,boxDistance,segments,segmentHits,segmentPairDistance,lineDistance,lineHits,lineSimple,nearbyPairs} from '../../static/inverse/core/geometry.js';

// Full Euclidean box distances are the reference. A faster rejection must
// preserve the original pair order, contact tolerances and early-stop value.
const reference={
  lineDistance(a,b,stopBelow=-1){let best=Infinity;for(const s of segments(a))for(const t of segments(b)){
    if(boxDistance(s.box,t.box)>=best)continue;
    best=Math.min(best,segmentPairDistance(s.a,s.b,t.a,t.b));if(best<=stopBelow)return best;
  }return best;},
  lineHits(a,b){const out=[];for(const s of segments(a))for(const t of segments(b)){
    if(boxDistance(s.box,t.box)>1e-9)continue;
    for(const hit of segmentHits(s.a,s.b,t.a,t.b))out.push({...hit,i:s.index,j:t.index});
  }return out;},
  lineSimple(poly){const s=segments(poly);for(let i=0;i<s.length;i++)for(let j=i+1;j<s.length;j++){
    if(boxDistance(s[i].box,s[j].box)>1e-9)continue;
    const hits=segmentHits(s[i].a,s[i].b,s[j].a,s[j].b);if(!hits.length)continue;
    if(j===i+1&&hits.every(h=>!h.overlap&&distance(h.point,s[i].b)<1e-7))continue;return false;
  }return true;},
  nearbyPairs(items,radius=0){const boxes=items.map((p,i)=>({box:bbox(p),i})).sort((a,b)=>a.box[0]-b.box[0]),out=[];
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length&&boxes[j].box[0]<=boxes[i].box[2]+radius;j++)if(boxDistance(boxes[i].box,boxes[j].box)<=radius)out.push([boxes[i].i,boxes[j].i]);return out;},
};
function compare(lines,radii){
  for(const line of lines)assert.equal(lineSimple(line),reference.lineSimple(line));
  for(let i=0;i<lines.length;i++)for(let j=0;j<lines.length;j++){
    assert.deepEqual(lineHits(lines[i],lines[j]),reference.lineHits(lines[i],lines[j]));
    for(const radius of radii)assert.equal(lineDistance(lines[i],lines[j],radius),reference.lineDistance(lines[i],lines[j],radius));
  }
  for(const radius of radii)assert.deepEqual([...nearbyPairs(lines,radius)],reference.nearbyPairs(lines,radius));
}

test('box pruning preserves exact boundary and diagonal contact decisions',()=>{
  const line=[[0,0],[1,0]],lines=[line,[[0,0],[1,1]],[[0,1],[1,0]],[[0,0],[0,0]]];
  for(const gap of [1e-9*(1-Number.EPSILON),1e-9,1e-9*(1+Number.EPSILON),1,1+Number.EPSILON]){
    lines.push([[0,gap],[1,gap]],[[1+gap,gap],[2+gap,gap]]);
  }
  compare(lines,[-1,0,1e-9,1,Math.SQRT2,Infinity]);
});

test('box pruning preserves folded paths, pair order and early-stop distances',()=>{
  let seed=31977;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const lines=Array.from({length:16},()=>Array.from({length:7},()=>[200*random()-100,200*random()-100]));
  compare(lines,[-1,0,.01,2.505,10]);
});

test('nonfinite input retains the existing comparison behaviour',()=>{
  const lines=[[[0,0],[1,1]],[[NaN,0],[1,1]],[[0,Infinity],[1,Infinity]],[[Infinity,NaN],[1,1]],[[1,1]]];
  compare(lines,[-Infinity,-1,0,NaN,Infinity]);
});

test('photographic cutting paths keep the same geometry comparisons',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/floral-checker-refinement-checkpoint.json'));
  const paths=fixture.paths.flat().map(path=>path.flatMap((p,i)=>new Cubic(p).flatten(.01).slice(i?1:0)));
  compare(paths,[-1,0,2.505]);
});
