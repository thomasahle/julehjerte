import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {referenceError,sourceWeights} from '../../static/inverse/core/image-reference.js';
import {recoverImageFeatures} from '../../static/inverse/core/feature-recovery.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {auditFeatureFidelity,featureComponentMetrics} from '../../static/inverse/core/feature-shapes.js';
import {featureRefinementObjective} from '../../static/inverse/core/direct/feature-seeds.js';
import {featurePolishPlan} from '../../static/inverse/core/direct/feature-details.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {fitGrid} from '../../static/inverse/core/direct/grid.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {resize} from '../../static/inverse/core/direct/math.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {captureFitFailure} from './diagnostics/fit-failure.mjs';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/coverage-fits.json',import.meta.url)));
const hash=b=>createHash('sha256').update(b).digest('hex');
function image(id){
  const entry=fixture.cases.find(c=>c.id===id),decode=key=>{
    const data=entry[key];if(!data)return undefined;
    const bytes=Uint8Array.from(inflateSync(Buffer.from(data.deflate,'base64')));
    assert.equal(hash(bytes),data.sha256);assert.equal(bytes.length,entry.resolution**2);return bytes;
  };
  return{entry,input:{type:'mask',mask:decode('mask'),validMask:decode('validMask'),resolution:entry.resolution}};
}
function smallFeature(){
  const n=256,mask=new Uint8Array(n*n),pixels=[];
  for(let y=126;y<=130;y++)for(let x=126;x<=130;x++){const i=y*n+x;mask[i]=1;pixels.push(i);}
  const source={mask,probability:Float32Array.from(mask),resolution:n};
  const features=[{value:1,pixels,areaMm2:pixels.length*(100/n)**2,centerMm:[50,50]}];
  const validMask=new Uint8Array(n*n).fill(1),weights=new Float64Array(n*n).fill(1);
  const absent=128*n+132,fractional=128*n+128;validMask[0]=validMask[absent]=0;weights[fractional]=.25;
  const weighted={...source,validMask,weights},changed=structuredClone(weighted);
  for(const i of [0,absent]){changed.mask[i]^=1;changed.probability[i]=1-changed.probability[i];}
  return{n,source,features,weighted,changed,absent,fractional};
}

test('feature emphasis preserves missing coverage and fractional observations at every fitting scale',()=>{
  const {n,source,features,weighted,changed,absent,fractional}=smallFeature(),before=structuredClone(weighted);
  const emphasis=new Float64Array(n*n).fill(1/16);for(const f of features)for(const i of f.pixels)emphasis[i]=1;
  for(const resolution of [96,256,400]){
    assert.deepEqual(featureRefinementObjective(source,features,resolution),resizeObjective(source.probability,n,resolution,emphasis),'Ordinary feature fitting retains its original objective.');
    assert.deepEqual(featureRefinementObjective({...source,validMask:new Uint8Array(n*n).fill(1)},features,resolution),featureRefinementObjective(source,features,resolution));
    assert.deepEqual(featureRefinementObjective(weighted,features,resolution),featureRefinementObjective(changed,features,resolution),'Ignored colours must not affect any resampled feature force.');
  }
  const objective=featureRefinementObjective(weighted,features,n);
  assert.equal(objective.weights[0],0);assert.equal(objective.weights[absent],0);assert.equal(objective.weights[fractional],.25);
  assert.deepEqual(weighted,before);
});

test('the detail halo cannot turn a missing pixel into image evidence',()=>{
  const {n,weighted,changed,features,absent,fractional}=smallFeature(),before=structuredClone(weighted);
  const line=(a,b)=>[a,a.map((v,i)=>(2*v+b[i])/3),a.map((v,i)=>(v+2*b[i])/3),b];
  const graph=new CurveGraph([[[line([50,0],[50,50]),line([50,50],[50,100])]],[[line([0,50],[50,50]),line([50,50],[100,50])]]],100),points=graph.points.slice();
  const cfg=settings({width:100,minWidth:2}),a=featurePolishPlan(graph,points,weighted,features,cfg,n),b=featurePolishPlan(graph,points,changed,features,cfg,n);
  assert.ok(a);assert.ok(b);assert.equal(a.objective.weights[absent],0);assert.equal(a.objective.weights[fractional],.25);
  assert.deepEqual(a.objective,b.objective);assert.deepEqual(weighted,before);assert.deepEqual(graph.points,points);
});

test('a native optimization objective preserves the old unweighted grid and ignores unobserved colours',()=>{
  const size=49,resolution=19,prob=Float64Array.from({length:size**2},(_,i)=>Number(Math.sin(i*.13)+Math.cos((i%size)*.43)>0));
  const options={resolution,steps:12,k:8};
  const ordinary=fitGrid(prob,size,[2,3],1,{...options,optimizationTarget:resize(prob,size,resolution)});
  assert.deepEqual(fitGrid(prob,size,[2,3],1,{...options,optimizationObjective:resizeObjective(prob,size,resolution)}),ordinary);
  const weights=Float64Array.from(prob,(_,i)=>i%size<8?0:i%size<20?.25:1),other=Float64Array.from(prob,(v,i)=>weights[i]?v:1-v);
  const fit=p=>{
    const scoring=resizeObjective(p,size,32,weights),optimizationObjective=resizeObjective(p,size,resolution,weights);
    return fitGrid(scoring.probability,32,[2,3],1,{...options,weights:scoring.weights,optimizationObjective});
  };
  assert.deepEqual(fit(prob),fit(other));
  assert.throws(()=>fitGrid(prob,size,[2,3],1,{...options,optimizationTarget:resize(prob,size,resolution),optimizationObjective:resizeObjective(prob,size,resolution)}),/only one/);
  assert.throws(()=>fitGrid(prob,size,[2,3],1,{...options,weights,optimizationObjective:resizeObjective(prob,size,resolution)}),/resampled weights/);
  assert.throws(()=>fitGrid(prob,size,[2,3],1,{...options,optimizationObjective:{probability:new Float64Array(3)}}),/resolution/);
  assert.throws(()=>fitGrid(prob,size,[2,3],1,{...options,optimizationObjective:{probability:new Float64Array(resolution**2),weights:new Float64Array(3)}}),/weight/i);
});

test('losing one native corner does not change distant cells of the grid objective',()=>{
  const {input}=image('hunodan-hjfig-05'),prob=Float64Array.from(input.mask),weights=new Float64Array(prob.length).fill(1);weights[0]=0;
  const ordinary=resizeObjective(prob,input.resolution,96),partial=resizeObjective(prob,input.resolution,96,weights);
  for(let i=1;i<96**2;i++)assert.ok(Math.abs(ordinary.probability[i]-partial.probability[i])<1e-10);
  const middle=resizeObjective(prob,input.resolution,256,weights),chained=resizeObjective(middle.probability,256,96,middle.weights);
  assert.ok(chained.probability.filter((v,i)=>i>0&&Math.abs(v-ordinary.probability[i])>1e-8).length>500,'This photograph exposes the old native-to-256-to-96 discontinuity.');
});

test('traced recovery ignores arbitrary free-border colours and scores the observed image',async()=>{
  const n=64,index=x=>{const s=(x+.5-n/2)/(n/4);return Math.sign(s)*Math.floor(Math.abs(s)+.5);};
  const weights=Float64Array.from({length:n*n},(_,i)=>i%n>=12&&i%n<52&&Math.floor(i/n)>=12&&Math.floor(i/n)<52?.5:0);
  const target=Uint8Array.from(weights,(_,i)=>(index(i%n)+index(Math.floor(i/n)))&1),cfg=settings({...AUTOMATIC_PRESET,trials:0});
  let previous;
  for(const flip of [0,1]){
    const mask=Uint8Array.from(target,(v,i)=>weights[i]?v:((i*2654435761>>>29)&1)^flip);
    const prepared=prepare({type:'mask',resolution:n,mask,weights},cfg),source=prepared.target.sourceImage,before=structuredClone(source);
    const recovery=await recoverImageFeatures(prepared.target,cfg,3);
    assert.ok(recovery.solution,JSON.stringify(recovery.report));assert.equal(recovery.report.accepted,true);
    const exported=await renderExportedWeave(solutionJSON(recovery.solution),n),error=referenceError(source,exported.mask);
    assert.ok(error.mismatchFraction<.01);assert.ok(error.wholeMismatchFraction>.1,'The free border is allowed to change.');
    assert.ok(recovery.report.imageError<.01);assert.deepEqual(source,before);
    if(previous)assert.deepEqual(exported.mask,previous);previous=exported.mask;
  }
});

for(const id of ['photo-bird','hunodan-hjfig-05'])test(`one unobserved corner preserves the significant features of ${id}`,async()=>{
  const {entry,input}=image(id);input.validMask=new Uint8Array(input.mask.length).fill(1);input.validMask[0]=0;
  const prepared=prepare(input,entry.settings),source=prepared.target.sourceImage,before=structuredClone(source);
  assert.equal(sourceWeights(source)[0],0);assert.deepEqual(source.mask,input.mask);
  const answer=await design(prepared.target,entry.settings);
  assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');assert.equal(answer.report.templateChecksPassed,true);
  const exported=await renderExportedWeave(answer.files['cut_geometry.json'],entry.resolution);
  assert.ok(referenceError(source,exported.mask).mismatchFraction<(id==='photo-bird'?.03:.011));
  assert.equal(auditFeatureFidelity(source,exported.mask,answer.report.settings).passed,true);
  if(id==='photo-bird'){
    const eye=featureComponentMetrics(source,exported.mask).find(f=>f.centerMm[0]<30);
    assert.ok(eye);assert.equal(eye.touchesBorder,false);assert.ok(eye.componentIoU>.8);
  }
  assert.deepEqual(source,before);
});

test('an invalid feature proposal cannot consume the partial-photo search without a legal result',async t=>{
  const {entry,input}=image('photo-bauble'),prepared=prepare(input,entry.settings),source=prepared.target.sourceImage,before=structuredClone(source);
  const answer=await design(prepared.target,entry.settings);
  let exportedError=null;
  try{
    assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
    const exported=await renderExportedWeave(answer.files['cut_geometry.json'],entry.resolution),error=referenceError(source,exported.mask);
    exportedError=error.mismatchFraction;
    assert.ok(error.mismatchFraction<.05,`Retain a useful legal approximation, not an arbitrary valid grid: ${error.mismatchFraction}`);
    if(error.mismatchFraction>answer.report.settings.maxImageError)assert.equal(answer.report.templateChecksPassed,false,'Legality does not waive the unchanged image-quality gate.');
    assert.deepEqual(source,before);
  }catch(error){
    t.diagnostic(await captureFitFailure({error:exportedError,maximum:.05,answer,source,resolution:entry.resolution,context:{fixture:entry.id,failedAssertion:error.message}}));
    throw error;
  }
});
