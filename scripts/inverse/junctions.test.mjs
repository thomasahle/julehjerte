import test from 'node:test';
import assert from 'node:assert/strict';
import {quantize,preprocessMask} from '../../static/inverse/core/input.js';
import {repairJunctions} from '../../static/inverse/core/junctions.js';
import {keyPoint} from '../../static/inverse/core/geometry.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {GENERAL_PRESET} from '../../src/lib/inverse/presets.js';
import {yellowStarInput} from './yellow-star-fixture.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
test('rare white background pixels do not merge the yellow and olive paper populations',()=>{
  const rgb=Uint8Array.from(Array.from({length:100},(_,i)=>i<49?[130,120,0]:i<98?[250,225,0]:[255,255,255]).flat());
  const q=quantize(rgb,{mode:'lab'});assert.notEqual(q.mask[0],q.mask[50]);
  assert.ok(q.mask.slice(0,49).every(x=>x===q.mask[0]));assert.ok(q.mask.slice(49,98).every(x=>x===q.mask[50]));
});
test('blurred and shifted checker junctions recover four arms with bounded, recorded movement',()=>{
  const n=160,width=80;
  for(const shift of[-.3,0,.3])for(const invert of[0,1]){
    const mask=Uint8Array.from({length:n*n},(_,i)=>Number(Math.tanh(((i%n+.5)*width/n-40-shift)/.9)*Math.tanh(((Math.floor(i/n)+.5)*width/n-40)/.9)>.08)^invert),original=mask.slice();
    const t=preprocessMask(mask,n,{width,fitTolerance:.3,maxSpan:30,snapRadius:1.5,borderRadius:0});
    assert.deepEqual(mask,original);assert.equal(t.metadata.junctionRepairs.length,1);
    for(const move of t.metadata.junctionRepairs)assert.ok(move.maximumMoveMm<=1.5+1e-8);
    const degree=new Map();for(const c of t.curves)for(const p of[c.p[0],c.p[3]]){const k=keyPoint(p);degree.set(k,(degree.get(k)||0)+1);}
    assert.equal([...degree.values()].filter(d=>d===4).length,1);assert.equal([...degree.values()].filter(d=>d===1).length,4);
    assert.ok(t.metadata.preprocessing.totalChangeFraction<.005);
  }
});
test('junction repair preserves parallel cuts and intentional acute tips',()=>{
  const chains=[[[10,10],[10,20],[10,30]],[[11,10],[11,20],[11,30]],[[20,10],[21,20],[22,10]],[[20,30],[21,21],[22,30]]];
  const r=repairJunctions(chains,1.5,80);assert.deepEqual(r.chains,chains);assert.deepEqual(r.moves,[]);
});
test('a closed contour can repair a junction across its arbitrary start/end seam',()=>{
  const open=[[10,20],[20,20],[20,10]],ring=[[21,21],[30,21],[30,30],[21,30]];
  for(const reverse of[false,true])for(let shift=0;shift<ring.length;shift++){
    const order=reverse?[...ring].reverse():ring,rotated=[...order.slice(shift),...order.slice(0,shift)],closed=[...rotated,rotated[0]],chains=[open,closed],before=structuredClone(chains);
    const repaired=repairJunctions(chains,1.5,50);
    assert.equal(repaired.moves.length,1,`reverse=${reverse}, seam=${shift}`);
    assert.deepEqual(chains,before,'Circular editing must not mutate the source chains.');
    assert.deepEqual(repaired.moves[0].to,[20.5,20.5]);
    assert.ok(repaired.moves[0].maximumMoveMm<=1.5);
    assert.ok(repaired.chains.length===3||repaired.chains.length===4,'The untouched storage seam may remain a degree-two subdivision.');
    assert.equal(repaired.chains.flatMap(p=>[p[0],p.at(-1)]).filter(p=>p[0]===20.5&&p[1]===20.5).length,4);
    for(const p of [[10,20],[20,10],[30,21],[30,30],[21,30]])assert.ok(repaired.chains.some(c=>c.some(q=>q[0]===p[0]&&q[1]===p[1])),'Unaffected points remain.');
  }
});
test('multiple circular edits preserve every unaffected arc when a seam lies inside an edit',()=>{
  const corners=[[20,20],[40,20],[40,40],[20,40]],ring=corners.flatMap((a,i)=>Array.from({length:80},(_,j)=>a.map((v,k)=>v+(corners[(i+1)%4][k]-v)*j/80)));
  const open=[[[10,19],[19,19],[19,10]],[[41,50],[41,41],[50,41]]],centers=[[19.5,19.5],[40.5,40.5]],radius=1.5;
  for(const reverse of[false,true])for(const shift of[0,1,2,79,80,159,160,161,239,319]){
    const order=reverse?[...ring].reverse():ring,p=[...order.slice(shift),...order.slice(0,shift)],chains=[...open,[...p,p[0]]],before=structuredClone(chains),r=repairJunctions(chains,radius,60);
    assert.equal(r.moves.length,2,`reverse=${reverse}, seam=${shift}`);assert.ok(r.chains.length===6||r.chains.length===7);
    assert.deepEqual(chains,before);assert.ok(r.moves.every(m=>m.maximumMoveMm<=radius));
    const merged=r.moves.map(m=>m.to);
    // Dense-chain candidate sampling can move the centre by half a pixel.
    for(const center of centers)assert.ok(merged.some(p=>Math.hypot(p[0]-center[0],p[1]-center[1])<=.125));
    for(const center of merged)assert.equal(r.chains.flatMap(c=>[c[0],c.at(-1)]).filter(p=>p[0]===center[0]&&p[1]===center[1]).length,4);
    for(const q of ring.filter(p=>merged.every(c=>Math.hypot(p[0]-c[0],p[1]-c[1])>radius))){
      const copies=r.chains.flat().filter(v=>v===q).length;
      assert.ok(copies===1||copies===2&&q===p[0],'Unaffected ring vertices remain; only the original seam can be a shared endpoint.');
    }
  }
});
test('yellow photo solves using app defaults and exported curves reproduce the original classified crop',async()=>{
  const cfg={...GENERAL_PRESET,timeLimit:10,trials:0},p=prepare(await yellowStarInput(),cfg),r=await design(p.target,cfg);
  assert.ok(p.target.metadata.junctionRepairs.length>=15);assert.equal(r.report.templateChecksPassed,true);assert.equal(r.report.validation.passed,true);assert.equal(r.report.manufacturing.status,'pass');assert.deepEqual(r.report.slits,{left:5,right:5});
  const independent=await renderExportedWeave(r.files['cut_geometry.json'],p.preview.resolution),error=independent.mask.reduce((s,v,i)=>s+Number(v!==p.preview.mask[i]),0)/independent.mask.length;
  assert.ok(error<.02,`Independent input-image error: ${error}`);
});
