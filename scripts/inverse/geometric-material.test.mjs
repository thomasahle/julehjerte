import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {geometricMaterialAudit,finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {repairFinalPaper} from '../../static/inverse/core/direct/final-paper-repair.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';
import {finish} from '../../static/inverse/core/engine.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/paper-offset-cases.json'));
const entry=id=>fixture.cases.find(c=>c.id===id);

test('final paper validation catches the fold island between raster rows',()=>{
  const e=entry('hjcur-05'),s=loadSolutionJSON(e.geometry);
  assert.equal(materialAudit(s,e.settings).passed,true,'Regression: the old lattice falsely passes this geometry.');
  const geometric=geometricMaterialAudit(s,e.settings),combined=finalMaterialAudit(s,e.settings);
  assert.equal(geometric.status,'fail');assert.equal(combined.status,'fail');
  assert.equal(geometric.families[0].significantFloatingCount,1);
  assert.ok(Math.abs(geometric.families[0].significantFloatingArea-4.15421981)<.002);
  assert.equal(combined.summary.latticeStatus,'pass');
  assert.ok(geometric.families[0].probes.every(p=>!p.passed));
});

test('public export reports the failed paper check and retains both downloads',()=>{
  const e=entry('hjcur-05'),s=loadSolutionJSON(e.geometry),before=structuredClone(solutionJSON(s));
  const result=finish(s,e.settings,()=>{},{refine:false});
  assert.equal(result.report.templateChecksPassed,false);
  assert.equal(result.report.templateExportAllowed,true);
  assert.equal(result.report.manufacturing.offset.status,'fail');
  assert.equal(result.report.finalPaperRepair.rejected,'no_source_image');
  assert.ok(result.files['template_left.svg']);assert.ok(result.files['template_right.svg']);
  assert.match(result.files['manufacturability_right.svg'],/data-paper-model="polygon-offset"/);
  assert.match(result.files['manufacturability_right.svg'],/fill="#bd3428"/);
  assert.deepEqual(solutionJSON(s),before);
});

test('valid templates are returned without running the new repair',()=>{
  for(const id of ['cold-baseline','cold-retry']){
    const e=entry(id),s=loadSolutionJSON(e.geometry),before=structuredClone(solutionJSON(s)),repaired=repairFinalPaper(s,e.settings);
    assert.equal(repaired.solution,s);assert.equal(repaired.report.attempted,false);assert.equal(repaired.report.before.status,'pass');
    assert.deepEqual(solutionJSON(s),before);
  }
});

test('offset uncertainty is not accepted when the numerical radius probes disagree',()=>{
  const cfg=entry('hjcur-05').settings,d=cfg.nominalWidth;
  const paths=[[[Cubic.line([50,0],[50,100]).p],[Cubic.line([50+d,0],[50+d,100]).p]],[]];
  const g=new CurveGraph(paths,100),s=g.solution(g.points,1),audit=geometricMaterialAudit(s,cfg);
  assert.equal(audit.status,'uncertain');assert.equal(audit.passed,false);
  assert.ok(audit.families[0].probes.some(p=>p.passed));assert.ok(audit.families[0].probes.some(p=>!p.passed));
  const snapshot=structuredClone(audit);geometricMaterialAudit(loadSolutionJSON(entry('cold-baseline').geometry),cfg);assert.deepEqual(audit,snapshot);
});

test('expired repair budget retains the failed candidate without claiming it passed',()=>{
  const e=entry('hjcur-05'),s=loadSolutionJSON(e.geometry);s.graph.target.sourceImage={resolution:120,mask:sampleWeave(s,120)};
  const result=repairFinalPaper(s,e.settings,{deadline:0});
  assert.equal(result.solution,s);assert.equal(result.report.attempted,false);assert.equal(result.report.rejected,'deadline');
});

test('the main fitter repairs the photographic fold defect and rechecks exported curves',async()=>{
  const {inflateSync}=await import('node:zlib'),{createHash}=await import('node:crypto');
  const {loadNumericalKernel}=await import('../../static/inverse/core/numerical-kernel.js');
  const {renderExportedWeave}=await import('./export-renderer.mjs');
  await loadNumericalKernel();
  const saved=JSON.parse(await fs.readFile('scripts/inverse/fixtures/paper-repair-source.json'));
  const source={resolution:saved.resolution};
  for(const[name,array]of Object.entries(saved.arrays)){
    const bytes=Uint8Array.from(inflateSync(Buffer.from(array.deflate,'base64')));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),array.sha256);
    const Type={Uint8Array,Float32Array}[array.type];assert.ok(Type);
    source[name]=new Type(bytes.buffer);assert.equal(source[name].length,array.length);
  }
  const e=entry(saved.id),s=loadSolutionJSON(e.geometry);s.graph.target.sourceImage=source;
  const before=structuredClone(solutionJSON(s)),sourceBefore=structuredClone(source);
  const result=repairFinalPaper(s,e.settings,{maxMilliseconds:10000});
  assert.equal(result.report.accepted,true,JSON.stringify(result.report));
  assert.deepEqual(result.report.attempts[0].paperRecovery,{foldFamilies:[0],localFamilies:[]});
  assert.ok(Object.values(result.report.attempts[0].gates).every(Boolean));
  assert.equal(finalMaterialAudit(result.solution,e.settings).passed,true);
  const rendered=await renderExportedWeave(solutionJSON(result.solution),source.resolution);
  const error=rendered.mask.reduce((sum,v,i)=>sum+Number(v!==source.mask[i]),0)/rendered.mask.length;
  assert.ok(error<.01,'The independently exported weave must keep the photographic fit within 1%.');
  assert.deepEqual(solutionJSON(s),before);assert.deepEqual(source,sourceBefore);
});
