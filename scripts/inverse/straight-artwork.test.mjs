import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic,segmentDistance} from '../../static/inverse/core/bezier.js';
import {sampleTarget,targetSampler} from '../../static/inverse/core/input.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {motifFixture} from './motif-fixture.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

test('target scanlines use the same half-open rule at left-edge endpoints as interior crossings',()=>{
  // A rectangle meeting the left edge. At y=50, only x<20 is inside;
  // excluding the transition at that exact y inverted the entire row.
  const points=[[0,50],[20,50],[20,80],[0,80]],curves=points.slice(1).map((p,i)=>Cubic.line(points[i],p));
  for(const phase of [0,1]){
    const target={width:100,phase,curves},sample=targetSampler(target),mask=sampleTarget(target,101);
    for(let y=0;y<101;y++)for(let x=0;x<101;x++){
      const px=(x+.5)*100/101,py=(y+.5)*100/101,expected=phase^Number(px<20&&py>=50&&py<80);
      assert.equal(mask[y*101+x],expected,`pixel ${x},${y}, phase ${phase}`);
      assert.equal(sample(px,py),expected);
    }
    for(const y of [50-1e-8,50,50+1e-8,80-1e-8,80,80+1e-8])for(const x of [10,30])assert.equal(sample(x,y),phase^Number(x<20&&y>=50&&y<80));
  }
});

test('raster stairs simplify without losing corners after resize or subpixel translation',()=>{
  for(const shape of ['hat','house'])for(const n of [160,240,360])for(const offset of [0,.35]){
    const {input,mask}=motifFixture(shape,{n,offset}),p=prepare(input,AUTOMATIC_PRESET),boundary=p.target.boundarySeed,traced=sampleTarget(boundary,n);
    assert.equal(p.target.metadata.automatic.route,'direct',`${shape}, ${n}, ${offset}`);
    assert.ok(boundary.curves.length<=40,'Pixel stairs must not become many short cuts');
    assert.deepEqual(p.target.sourceImage.mask,mask,'The original mask remains the error reference');
    assert.ok(traced.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length<.002);
    if(shape==='house'){
      // Both eaves must stay square, with vertical walls and a horizontal overhang.
      for(const x of [34,66]){
        const incident=boundary.curves.filter(c=>c.p.some((p,i)=>(i===0||i===3)&&Math.hypot(p[0]-x,p[1]-44)<1));
        assert.ok(incident.some(c=>Math.abs(c.p[0][0]-c.p[3][0])<.05));
        assert.ok(incident.some(c=>Math.abs(c.p[0][1]-c.p[3][1])<.05));
      }
    }
  }
});

test('an asymmetric rounded motif keeps flexible fitting at several resolutions',()=>{
  for(const n of [160,240,360]){
    const p=prepare(motifFixture('circle',{n}).input,AUTOMATIC_PRESET);
    assert.equal(p.target.metadata.automatic.route,'direct');
  }
});

test('straight motifs export valid line cuts and improve the independently rendered centre',{timeout:30000},async()=>{
  for(const shape of ['hat','house']){
    const {input,motif,border}=motifFixture(shape),n=input.imageWidth,cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,minWidth:1.5};
    const p=prepare(input,cfg),r=await design(p.target,cfg),data=JSON.parse(r.files['cut_geometry.json']),woven=await renderExportedWeave(data,n);
    assert.equal(r.report.solver.automatic.selected,'direct');assert.equal(r.report.solver.algorithm,'direct-bezier');
    assert.ok(r.report.solver.checkpoints.length>0,'All candidates pass through the common refinement loop');
    assert.equal(r.report.templateChecksPassed,true);assert.equal(r.report.validation.passed,true);assert.equal(r.report.manufacturing.status,'pass');
    const curves=Object.values(data.curves),straight=curves.filter(c=>{const p=c.control_points;return p.slice(1,3).every(h=>segmentDistance(h,p[0],p[3])<1e-6);});
    assert.ok(straight.length>=.9*curves.length,'Simple artwork must not acquire widespread curved handles');
    let errors=0,pixels=0;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(Math.min(x,y,n-1-x,n-1-y)>=border*n){pixels++;errors+=Number(woven.mask[y*n+x]!==motif[y*n+x]);}
    assert.ok(errors/pixels<(shape==='hat'?.003:.0005),`${shape} centre disagreement: ${errors/pixels}`);
  }
});
