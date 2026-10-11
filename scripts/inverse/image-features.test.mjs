import test from 'node:test';
import assert from 'node:assert/strict';
import {auditImageFeatures,auditFeatureChange,imageFeatures} from '../../static/inverse/core/image-features.js';
import {finish} from '../../static/inverse/core/engine.js';
import {gridModel,gridPaths} from '../../static/inverse/core/direct/grid.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';
import {settings} from '../../static/inverse/core/settings.js';
import {LinearModel} from '../../static/inverse/core/solver.js';
import {referenceError} from '../../static/inverse/core/image-reference.js';

test('one-pixel crop fringes do not turn border regions into mandatory interior motifs',()=>{
  for(const n of[100,400,800])for(const invert of[0,1])for(const side of[0,1,2,3]){
    const width=Math.ceil(2*Math.max(1.5,.005*n))+1,clean=new Uint8Array(n*n).fill(invert),fringe=clean.slice(),interior=clean.slice(),woven=clean.slice();
    const index=(x,y)=>side===0?y*n+x:side===1?x*n+n-1-y:side===2?(n-1-y)*n+n-1-x:(n-1-x)*n+y;
    let retainedPixels=0;
    for(let y=Math.floor(.2*n);y<.35*n;y++)for(let x=0;x<width;x++){
      clean[index(x,y)]=1-invert;
      if(x){fringe[index(x,y)]=1-invert;interior[index(x+1,y)]=1-invert;retainedPixels++;}
    }
    const source={mask:fringe,resolution:n},before=fringe.slice();
    assert.deepEqual(imageFeatures({mask:clean,resolution:n}),[]);
    assert.deepEqual(imageFeatures(source),[],'A one-cell fringe must preserve border classification.');
    assert.equal(auditImageFeatures(source,woven).passed,true);
    assert.equal(referenceError(source,woven).mismatchPixels,retainedPixels,'Every fringe pixel remains in the image-error measurement.');
    assert.deepEqual(fringe,before);
    const separated=auditImageFeatures({mask:interior,resolution:n},woven);
    assert.equal(separated.passed,false,'A genuine feature with two cells of clearance must remain protected.');
    assert.equal(separated.missing.length,1);assert.equal(separated.missing[0].retainedFraction,0);
  }
});

test('recovery model canonicalization removes floating-point noise while retaining bounds and integrality',()=>{
  const make=epsilon=>{const m=new LinearModel(),a=m.variable({binary:true,cost:3.14159265+epsilon}),b=m.variable({hi:Infinity});m.row([[a,1.234567890123+epsilon],[b,1]],-Infinity,1.234567890123+epsilon);return m;};
  const a=make(0),b=make(1e-12);a.canonicalize(1e-7);b.canonicalize(1e-7);
  assert.deepEqual(a.data(),b.data());assert.equal(a.residual([1,0]),0);
  assert.equal(a.residual([.5,0]),.5);assert.equal(a.rows[0].lo,-Infinity);
  assert.throws(()=>a.canonicalize(0),/positive finite/);
});

test('a missing small interior detail fails even below the overall image-error limit',()=>{
  const model=gridModel([1,1]);model.z.fill(0);
  const graph=new CurveGraph(gridPaths(model)),solution=graph.solution(graph.points,1),n=100,mask=sampleWeave(solution,n);
  for(let y=12;y<20;y++)for(let x=12;x<20;x++)mask[y*n+x]^=1;
  solution.graph.target.sourceImage={mask,resolution:n};
  const cfg=settings({trials:0,roundHidden:false}),result=finish(solution,cfg);
  assert.ok(result.report.imageError.mismatchFraction<.01);
  assert.equal(result.report.validation.passed,true);
  assert.equal(result.report.manufacturing.status,'pass');
  assert.equal(result.report.imageFidelity.features.missing.length,1);
  assert.equal(result.report.imageFidelity.features.missing[0].retainedFraction,0);
  assert.equal(result.report.imageFidelity.passed,false);
  assert.equal(result.report.templateChecksPassed,false);
  assert.ok(result.report.warnings.some(s=>s.includes('interior artwork')));
});

test('feature retention is colour symmetric, scale invariant, and tolerates boundary noise',()=>{
  for(const invert of[0,1])for(const n of[100,200]){
    const mask=new Uint8Array(n*n).fill(invert),woven=mask.slice(),q=n/100;
    for(let y=20*q;y<30*q;y++)for(let x=20*q;x<30*q;x++)mask[y*n+x]=1-invert;
    for(let y=20*q;y<29*q;y++)for(let x=21*q;x<30*q;x++)woven[y*n+x]=1-invert;
    const source={mask,resolution:n},before=mask.slice();
    const result=auditImageFeatures(source,woven);
    assert.equal(result.passed,true);assert.equal(result.regions.length,1);
    assert.equal(result.regions[0].retainedFraction,.81);assert.equal(result.regions[0].areaMm2,100);
    assert.deepEqual(mask,before);
  }
});

test('tiny specks, thin seams, border fragments and unobserved areas do not force extra motifs',()=>{
  const n=100,mask=new Uint8Array(n*n);
  mask[1515]=1;
  for(let x=20;x<80;x++)mask[50*n+x]=1;
  for(let y=0;y<10;y++)for(let x=40;x<50;x++)mask[y*n+x]=1;
  assert.deepEqual(imageFeatures({mask,resolution:n}),[]);
  for(let y=70;y<80;y++)for(let x=70;x<80;x++)mask[y*n+x]=1;
  const validMask=new Uint8Array(n*n).fill(1);validMask[75*n+75]=0;
  assert.deepEqual(imageFeatures({mask,resolution:n,validMask}),[]);
  assert.equal(auditImageFeatures(null,new Uint8Array(n*n)).referenceAvailable,false);
});

test('cleanup protects each feature without treating an existing omission as a veto',()=>{
  const n=100;
  for(const invert of[0,1])for(const weighted of[false,true]){
    const mask=new Uint8Array(n*n).fill(invert),regions=[20,60].map(x=>Array.from({length:100},(_,i)=>(20+Math.floor(i/10))*n+x+i%10));
    for(const region of regions)for(const i of region)mask[i]=1-invert;
    const source={mask,resolution:n,...(weighted?{weights:Float64Array.from(mask,(_,i)=>i%n<50?.5:1)}:{})},saved=mask.slice();
    const woven=counts=>{const out=new Uint8Array(n*n).fill(invert);regions.forEach((region,j)=>region.slice(0,counts[j]).forEach(i=>out[i]=1-invert));return out;};
    const before=woven([90,30]);
    for(const counts of[[90,30],[90,40],[60,30],[60,60]]){
      const after=woven(counts),change=auditFeatureChange(source,before,after);
      assert.equal(change.passed,true);assert.equal(change.missingBefore,1);
      assert.equal(change.missingAfter,Number(counts[1]<60));
      assert.equal(auditImageFeatures(source,after).passed,counts[1]>=60,'Final certification still needs all features');
    }
    for(const counts of[[59,100],[100,29]]){
      const change=auditFeatureChange(source,before,woven(counts));
      assert.equal(change.passed,false,'A gain elsewhere cannot pay for losing an individual feature');
      assert.equal(change.regressed.length,1);
      assert.equal(change.regressed[0].requiredRetention,counts[0]===59?.6:.3);
    }
    assert.deepEqual(source.mask,saved);
  }
});
