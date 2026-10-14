import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fitBoundaryProfile,proposeBoundaryProfiles,proposeSmoothBoundaryProfiles} from './border-profile-proposals.mjs';
import {borderTransitions,oppositeBorderSeeds} from '../../static/inverse/core/border.js';
import {prepare} from '../../static/inverse/core/engine.js';
import {preprocessMask} from '../../static/inverse/core/input.js';
import {inspectBoundaryEndpoints,reindex} from '../../static/inverse/core/graph.js';
import {visibleMarginIssue} from '../../static/inverse/core/solver.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../src/lib/inverse/presets.js';
import {readHardPhoto} from './hard-photo-data.mjs';

function runs(mask) {
  const positions=[0];
  for(let i=1;i<mask.length;i++)if(mask[i]!==mask[i-1])positions.push(i);
  positions.push(mask.length);
  return positions.slice(1).map((end,i)=>end-positions[i]);
}

test('alternating-run DP matches exhaustive binary profiles, including fractional observations',()=>{
  const n=9,minimum=2;
  for(let sample=0;sample<24;sample++){
    const profile=Float64Array.from({length:n},(_,i)=>((sample*31+i*17+i*i)%11)/10);
    const expected=new Map();
    for(let bits=0;bits<2**n;bits++){
      const mask=Uint8Array.from({length:n},(_,i)=>(bits>>i)&1),lengths=runs(mask),count=lengths.length-1;
      if(!count||count>3||Math.min(...lengths)<minimum)continue;
      const key=count+':'+mask[0],cost=mask.reduce((sum,v,i)=>sum+(v?1-profile[i]:profile[i]),0);
      expected.set(key,Math.min(expected.get(key)??Infinity,cost));
    }
    const before=profile.slice(),fits=fitBoundaryProfile(profile,minimum,3);
    assert.equal(fits.length,expected.size);
    for(const fit of fits){
      assert.ok(Math.abs(fit.cost-expected.get(fit.count+':'+fit.phase))<1e-9);
      const cost=fit.mask.reduce((sum,v,i)=>sum+(v?1-profile[i]:profile[i]),0);
      assert.ok(Math.abs(cost-fit.cost)<1e-9);
      assert.equal(runs(fit.mask).length,fit.count+1);
      assert.ok(Math.min(...runs(fit.mask))>=minimum);
      assert.equal(fit.mask[0],fit.phase);
    }
    assert.deepEqual(profile,before);
  }
});

test('joint proposals retain exact checker corners and commute with swapping paper colors',()=>{
  const n=128,clean=Uint8Array.from({length:n*n},(_,i)=>(Math.floor(i%n/32)+Math.floor(Math.floor(i/n)/32))%2);
  const noisy=clean.slice();
  // Independent short corruptions affect both pairs of opposite borders.
  for(let y=0;y<3;y++)for(let x=14;x<30;x++)noisy[y*n+x]^=1;
  for(let y=70;y<89;y++)for(let x=0;x<3;x++)noisy[y*n+x]^=1;
  const before=noisy.slice(),options={editRadius:3,profileStart:3,profileEnd:5,maximumCount:8};
  const proposals=proposeBoundaryProfiles(noisy,n,100,2.5,options);
  const inverse=proposeBoundaryProfiles(noisy.map(v=>v^1),n,100,2.5,options);
  assert.equal(proposals.length,8);assert.equal(inverse.length,8);
  assert.deepEqual(proposals[0].metadata.counts,[3,3]);
  assert.deepEqual(proposals[0].mask,clean);
  for(const [i,p]of proposals.entries()){
    assert.equal(p.metadata.initializationOnly,true);
    assert.deepEqual(borderTransitions(p.mask,n),[...p.metadata.counts,...p.metadata.counts]);
    assert.deepEqual(inverse[i].mask,p.mask.map(v=>v^1));
    assert.deepEqual(inverse[i].metadata.counts,p.metadata.counts);
    assert.equal(inverse[i].metadata.phase,p.metadata.phase^1);
    for(let side=0;side<4;side++){
      const points=[0,...p.metadata.transitions[side],n];
      assert.ok(points.slice(1).every((end,j)=>end-points[j]>=p.metadata.minimumPixels));
    }
    const d=p.metadata.depthPixels;
    for(let y=d;y<n-d;y++)for(let x=d;x<n-d;x++)assert.equal(p.mask[y*n+x],noisy[y*n+x]);
  }
  assert.deepEqual(noisy,before);
});

test('uniform ambiguous profiles have complement-symmetric ties and physical bounds reject invalid requests',()=>{
  const fits=fitBoundaryProfile(new Float64Array(12).fill(.5),2,3);
  for(const fit of fits){const inverse=fits.find(f=>f.count===fit.count&&f.phase!==fit.phase);assert.deepEqual(inverse.mask,fit.mask.map(v=>v^1));}
  assert.deepEqual(fitBoundaryProfile([0,1,0,1],3),[]);
  assert.throws(()=>fitBoundaryProfile([0,NaN],1));
  assert.throws(()=>fitBoundaryProfile([0,1],0));
  const mask=new Uint8Array(64);
  assert.throws(()=>proposeBoundaryProfiles(mask,8,100,2.5,{editRadius:4}));
  assert.throws(()=>proposeBoundaryProfiles(mask,8,100,2.5,{profileEnd:17}));
  assert.throws(()=>proposeBoundaryProfiles(mask,8,100,2.5,{limit:9}));
  assert.throws(()=>proposeBoundaryProfiles(mask.fill(2),8,100,2.5));
  assert.deepEqual(proposeBoundaryProfiles(new Uint8Array(64),8,100,2.5,{editRadius:.1}),[]);
  // Defaults must obey their own relative limits for small physical hearts.
  const n=128,checker=Uint8Array.from({length:n*n},(_,i)=>(Math.floor(i%n/32)+Math.floor(Math.floor(i/n)/32))%2);
  for(const width of [20,40,100,300]){
    const seed=proposeBoundaryProfiles(checker,n,width,.025*width)[0];
    assert.deepEqual(seed.mask,checker);
    assert.ok(seed.metadata.editedBandWidthMm<=Math.min(3,.08*width));
    assert.ok(seed.metadata.profileEndMm<=.16*width);
  }
});

test('Santa obtains balanced provisional endpoints while its independent trace checks still reject the geometry',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-santa-border.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto({...catalogue.source,...catalogue.cases.find(c=>c.id===fixture.sourceCase)});
  assert.equal(photo.fileSha256,fixture.sourceFileSha256);
  assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
  const raw={...AUTOMATIC_PRESET,timeLimit:10,trials:0},cfg=settings(raw),prepared=prepare({...photo,quad:fixture.quad},raw);
  const source=prepared.target.sourceImage,n=source.resolution,mask=source.mask,before=mask.slice();
  assert.equal(n,fixture.resolution);
  assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
  assert.deepEqual(oppositeBorderSeeds(mask,n,cfg.width,cfg.nominalWidth),[]);
  const seeds=proposeBoundaryProfiles(mask,n,cfg.width,cfg.nominalWidth);
  assert.equal(seeds.length,8);
  for(const seed of seeds){
    assert.ok(seed.metadata.changeFraction<.02);
    assert.deepEqual(borderTransitions(seed.mask,n),[...seed.metadata.counts,...seed.metadata.counts]);
    const target=preprocessMask(seed.mask,n,{...raw,algorithm:'trace',fitTolerance:.75,smoothRadius:.3,snapRadius:1.5,maxSpan:30,borderRadius:0});
    const graph=reindex({target,edges:target.curves.map(curve=>({curve,visible:true}))});
    assert.equal(inspectBoundaryEndpoints(graph,cfg.nominalWidth).issue,null);
    assert.equal(visibleMarginIssue(graph,cfg)?.type,'visible_edge_margin','Passing endpoint checks does not certify a cutting route.');
  }
  assert.deepEqual(mask,before);
});

test('inward row continuity removes paired narrow fringes instead of closing them into notches',()=>{
  for(const n of [128,256,400]){
    const clean=Uint8Array.from({length:n*n},(_,i)=>(Math.floor(i%n*4/n)+Math.floor(Math.floor(i/n)*4/n))%2);
    const noisy=clean.slice();
    for(const [side,a,b]of [[0,.13,.15],[3,.63,.65]])for(let t=Math.floor(a*n);t<Math.floor(b*n);t++)for(let k=0;k<Math.floor(.07*n);k++)noisy[side===0?k*n+t:t*n+k]^=1;
    const before=noisy.slice();
    const rotate=mask=>Uint8Array.from({length:n*n},(_,i)=>mask[(n-1-i%n)*n+Math.floor(i/n)]);
    let input=noisy,reference=clean;
    for(let turns=0;turns<4;turns++){
      const seed=proposeSmoothBoundaryProfiles(input,n,100,2.5,{limit:1})[0];
      assert.deepEqual(seed.mask,reference);
      assert.deepEqual(seed.metadata.counts,[3,3]);
      assert.deepEqual(seed.metadata.transitions,Array.from({length:4},()=>[n/4,n/2,3*n/4]));
      assert.equal(seed.metadata.initializationOnly,true);
      assert.ok(seed.metadata.editedBandWidthMm<=8);
      const inverted=proposeSmoothBoundaryProfiles(input.map(v=>v^1),n,100,2.5,{limit:1})[0];
      assert.deepEqual(inverted.mask,seed.mask.map(v=>v^1));
      input=rotate(input);reference=rotate(reference);
    }
    assert.deepEqual(noisy,before);
  }
});

test('smooth border proposals preserve clean slanted cuts and the interior at the declared band',()=>{
  const n=400;
  // Two independent straight cuts; their varying positions must not become
  // a constant extrusion from one averaged profile.
  const clean=Uint8Array.from({length:n*n},(_,i)=>{
    const x=(i%n+.5)/n,y=(Math.floor(i/n)+.5)/n;
    return Number(x>.25+.1*y)^Number(y>.65-.12*x);
  });
  const seed=proposeSmoothBoundaryProfiles(clean,n,100,2.5,{limit:1})[0];
  assert.deepEqual(seed.mask,clean);
  const noisy=clean.slice();
  for(let y=155;y<164;y++)for(let x=196;x<203;x++)noisy[y*n+x]^=1;
  const before=noisy.slice(),out=proposeSmoothBoundaryProfiles(noisy,n,100,2.5,{limit:1})[0];
  const d=out.metadata.depthPixels;
  for(let y=d;y<n-d;y++)for(let x=d;x<n-d;x++)assert.equal(out.mask[y*n+x],noisy[y*n+x]);
  assert.deepEqual(noisy,before);
  for(const options of [{depthMm:9},{depthMm:0},{rowPriorWeight:NaN},{rowPriorWeight:-1},{limit:0},{limit:9}])assert.throws(()=>proposeSmoothBoundaryProfiles(clean,n,100,2.5,options));
});

test('a continuity proposal needs observed inner endpoints rather than fitted-away contradictions',()=>{
  const n=128,depth=Math.floor(.08*n),clean=Uint8Array.from({length:n*n},(_,i)=>(Math.floor(i%n/32)+Math.floor(Math.floor(i/n)/32))%2);
  assert.equal(proposeSmoothBoundaryProfiles(clean,n,100,2.5).length,1);
  const contradictory=clean.slice();
  // Two additional well-spaced transitions on one inner row. Both counts are
  // plausible alone, but continuity through this band cannot assume they agree.
  for(let x=14;x<22;x++)contradictory[depth*n+x]^=1;
  const before=contradictory.slice();
  assert.deepEqual(proposeSmoothBoundaryProfiles(contradictory,n,100,2.5),[]);
  assert.deepEqual(contradictory,before);
  const uncertain=clean.slice();uncertain[depth*n+17]^=1;
  assert.deepEqual(proposeSmoothBoundaryProfiles(uncertain,n,100,2.5),[],'A sub-strip run is not a reliable anchor for the strong row prior.');
  assert.deepEqual(proposeSmoothBoundaryProfiles(new Uint8Array(n*n),n,100,2.5),[],'A blank inner band does not establish a pair of slit families.');
  assert.throws(()=>proposeSmoothBoundaryProfiles(new Uint8Array(n*n).fill(2),n,100,2.5));
});
