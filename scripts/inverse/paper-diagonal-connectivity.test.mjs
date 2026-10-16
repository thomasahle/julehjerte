import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {settings} from '../../static/inverse/core/settings.js';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {geometricMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {validate} from '../../static/inverse/core/validate.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';

function diagonalStrip(gap,dx=0,{reflect=false,family=0}={}){
  const span=gap*Math.SQRT2,center=-3+dx;
  const paths=[-1,1].map(sign=>{
    const offset=center+sign*span/2;
    const points=[[15+offset,0],[15+offset,15],[35+offset,35],[35+offset,60]]
      .map(([x,y])=>[reflect?60-x:x,y]).map(p=>family?p.toReversed():p);
    return points.slice(1).map((p,i)=>Cubic.line(points[i],p).p);
  });
  const graph=new CurveGraph(family?[[],paths]:[paths,[]],60);
  return graph.solution(graph.points,1);
}

test('guarded diagonal core bridges survive lattice shifts, reflection and sheet orientation',async()=>{
  await loadNumericalKernel();
  for(const[resolution,dx]of[[80,0],[120,-.1],[120,0],[120,.1]])for(const reflect of[false,true])for(const family of[0,1]){
    const cfg=settings({width:60,cutError:0,printShrinkPercent:0,materialResolution:resolution,minWidth:3});
    const solution=diagonalStrip(4.1,dx,{reflect,family});
    assert.equal(geometricMaterialAudit(solution,cfg).status,'pass');
    for(const native of[false,true])assert.equal(materialAudit(solution,cfg,{native}).status,'pass',JSON.stringify({resolution,dx,reflect,family,native}));
  }
});

test('diagonal adjacency cannot certify a too-narrow or unresolved paper corridor',async()=>{
  await loadNumericalKernel();
  const cfg=settings({width:60,cutError:0,printShrinkPercent:0,materialResolution:80,minWidth:3});
  for(const[gap,expected]of[[2.8,'fail'],[3,'uncertain'],[3.4,'uncertain']])for(const dx of[-.1,0,.1]){
    const solution=diagonalStrip(gap,dx);
    for(const native of[false,true]){
      const audit=materialAudit(solution,cfg,{native});
      assert.equal(audit.status,expected);assert.equal(audit.passed,false);
    }
    if(gap<3)assert.equal(geometricMaterialAudit(solution,cfg).status,'fail');
  }
});

test('the retained tree checkpoint has connected certified paper without moving its cuts',async()=>{
  await loadNumericalKernel();
  const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/diagonal-paper-core.json',import.meta.url)));
  const cfg=settings(fixture.configuration),solution=loadSolutionJSON(fixture.geometry),before=JSON.stringify(fixture.geometry);
  const source=fixture.source,mask=new Uint8Array(source.resolution**2);
  for(const[start,length]of source.maskRuns)mask.fill(1,start,start+length);
  assert.equal(createHash('sha256').update(mask).digest('hex'),source.maskSha256);
  assert.equal(validate(solution,cfg,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(geometricMaterialAudit(solution,cfg).status,'pass');
  for(const native of[false,true])assert.equal(materialAudit(solution,cfg,{native}).status,'pass');
  const woven=await renderExportedWeave(fixture.geometry,source.resolution);
  const error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.equal(error,fixture.expectedIndependentError);
  assert.equal(auditFeatureFidelity({mask,resolution:source.resolution},woven.mask,cfg).passed,true);
  assert.equal(JSON.stringify(fixture.geometry),before);
});
