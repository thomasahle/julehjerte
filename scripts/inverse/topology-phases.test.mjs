import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {motifFixture} from './motif-fixture.mjs';
import {shapeCells} from '../../src/lib/paint/frame.ts';
import {resample} from '../../src/lib/paint/mask.ts';
import {initializationMask,referenceError} from '../../static/inverse/core/image-reference.js';
import {prepare,finish} from '../../static/inverse/core/engine.js';
import {prepareBoundary,initializeTopology} from '../../static/inverse/core/direct/topology.js';
import {sampleTarget} from '../../static/inverse/core/input.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {renderExportedWeave} from './export-renderer.mjs';

const n=200,c=createCanvas(n,n),ctx=c.getContext('2d');ctx.drawImage(await loadImage(motifFixture('house',{n}).original),0,0);
const rgba=ctx.getImageData(0,0,n,n).data,mask=Uint8Array.from({length:n*n},(_,i)=>Number(rgba[4*i]<128)),weights=shapeCells({mode:'free',shape:'diamond',size:.64},n);
const cfg=settings({...AUTOMATIC_PRESET,trials:0,timeLimit:10});
const source={mask,weights,resolution:n};

test('both guide phases preserve observed colours and ignore changes to free pixels',()=>{
  const noisy={...source,mask:Uint8Array.from(mask,(v,i)=>weights[i]?v:1-v)},inverted={...source,mask:Uint8Array.from(mask,v=>1-v)};
  const guides=[0,1].map(phase=>initializationMask(source,phase));
  for(const phase of [0,1]){
    assert.deepEqual(initializationMask(noisy,phase),guides[phase]);
    assert.deepEqual(initializationMask(inverted,1-phase),Uint8Array.from(guides[phase],v=>1-v));
    for(let i=0;i<mask.length;i++)if(weights[i])assert.equal(guides[phase][i],mask[i]);
  }
  for(let i=0;i<mask.length;i++)if(!weights[i])assert.notEqual(guides[0][i],guides[1][i]);
  assert.throws(()=>initializationMask(source,2),/phase/i);
});

test('a cached boundary for one phase cannot replace the other phase or the original artwork',()=>{
  const input=prepare({type:'mask',resolution:n,mask,weights},cfg).target;
  const first=prepareBoundary(input,cfg),other=prepareBoundary(input,cfg,{guidePhase:1});
  assert.equal(first,input.boundarySeed);assert.notEqual(first,other);
  assert.notEqual(sampleTarget(first,n)[0],sampleTarget(other,n)[0]);
  const original=prepareBoundary(input,cfg,{useInitializationGuide:false});
  assert.equal(referenceError(source,sampleTarget(original,n)).wholeMismatchFraction,0);
  assert.deepEqual(input.sourceImage.mask,mask);
});

test('a free-border house recovers its exact valid topology without exhausting one checker phase',async()=>{
  const prepared=prepare({type:'mask',resolution:n,mask,weights},cfg);
  const topology=await initializeTopology(prepared.target,cfg,{seconds:2.5});
  assert.ok(topology.graph,JSON.stringify(topology.report));
  assert.equal(topology.report.imageError,0);
  assert.ok(topology.report.guidePhases.length>0);
  const solution=topology.graph.solution(topology.graph.points,topology.phase,prepared.target),answer=finish(solution,cfg);
  assert.equal(answer.report.templateChecksPassed,true);
  assert.equal(answer.report.manufacturing.status,'pass');
  const exported=await renderExportedWeave(answer.files['cut_geometry.json'],n);
  assert.equal(referenceError(source,exported.mask).mismatchFraction,0);
});

for(const shape of ['house','hat'])test(`an uploaded ${shape} keeps a compact accurate boundary after Paint resizes its mask`,async()=>{
  // Replay the browser's real sequence: classify the 240-pixel PNG, then
  // nearest-neighbour resize its binary pixels into Paint's 400-cell canvas.
  const pixels=createCanvas(240,240),context=pixels.getContext('2d');
  context.drawImage(await loadImage(motifFixture(shape).original),0,0);
  const imported=prepare({type:'pixels',imageWidth:240,imageHeight:240,rgba:context.getImageData(0,0,240,240).data},{...AUTOMATIC_PRESET,resolution:240});
  const source={mask:resample(imported.preview.mask,imported.preview.resolution,400),weights:shapeCells({mode:'free',shape:'diamond',size:.64},400),resolution:400};
  const input=prepare({type:'mask',...source},cfg).target;
  for(const guidePhase of [0,1]){
    const boundary=prepareBoundary(input,cfg,{guidePhase});
    assert.ok(boundary.curves.length<=64,`${shape}: ${boundary.curves.length} boundary segments`);
    assert.ok(referenceError(source,sampleTarget(boundary,400)).mismatchFraction<=.005);
    assert.ok(boundary.metadata.boundarySimplification.some(a=>a.accepted));
  }
  assert.deepEqual(input.sourceImage.mask,source.mask);
});
