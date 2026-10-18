import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createOffsetPaperAudit,exportedPaperPaths} from './diagnostics/paper-offset.mjs';

const audit=await createOffsetPaperAudit();

test('geometric paper cores retain straight strips and reject an undersized fold strip',()=>{
  const good=audit([[[25,0],[25,100]],[[75,0],[75,100]]],100,1.25,.25);
  assert.equal(good.passed,true);assert.equal(good.significantFloatingCount,0);
  assert.ok(good.foldIntervals.every(f=>f.anchoredCoreLength>20));
  const narrow=audit([[[49,0],[49,100]],[[51,0],[51,100]]],100,1.25,.25);
  assert.equal(narrow.passed,false);assert.equal(narrow.foldIntervals[1].anchoredCoreLength,0);
  const empty=audit([],100,1.25,.25);
  const expected=2*48.75*200+Math.PI*48.75**2;
  assert.equal(empty.passed,true);assert.ok(Math.abs(empty.coreArea-expected)<.2);
});

test('offset holes and nested material islands are counted as separate components',()=>{
  // Deliberately closed subloop tests polygon bookkeeping, not legal slit
  // topology. Its 20 mm square leaves an exactly 17.5 mm square core.
  const loop=[[[40,0],[40,40],[60,40],[60,60],[40,60],[40,40],[40,100]]];
  const result=audit(loop,100,1.25,.25,{includePolygons:true});
  const islands=result.parts.filter(p=>!p.anchored);
  assert.equal(result.passed,false);assert.equal(islands.length,2);
  for(const p of islands)assert.ok(Math.abs(p.area-17.5**2)<1e-5);
  assert.ok(result.parts.filter(p=>p.anchored).every(p=>p.area>0));
});

test('photographic and Hunodan offset components agree with independent GEOS geometry',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/paper-offset-cases.json','utf8'));
  for(const entry of fixture.cases){
    const original=structuredClone(entry.geometry),before=structuredClone(entry.settings);
    for(const family of [0,1]){
      const reference=entry.reference.find(r=>r.family===family),lines=exportedPaperPaths(entry.geometry,family);
      const result=audit(lines,entry.geometry.square_width_mm,entry.settings.nominalWidth/2,entry.settings.minFeatureArea);
      assert.equal(result.passed,reference.passed,entry.id+':'+family);
      assert.equal(result.significantFloatingCount,reference.significantFloatingCount);
      assert.ok(Math.abs(result.significantFloatingArea-reference.significantFloatingArea)<.002);
      assert.ok(Math.abs(result.coreArea-reference.coreArea)<.2);
      for(let i=0;i<result.foldIntervals.length;i++)assert.ok(Math.abs(result.foldIntervals[i].anchoredCoreLength-reference.foldIntervals[i].anchoredCoreLength)<.01);
      const saved=structuredClone(result);
      audit([],60,2,.25);assert.deepEqual(result,saved,'Later calls must not mutate earlier outputs');
      lines[0][0][0]+=1;assert.deepEqual(entry.geometry,original,'Independent flattened paths must own their points');
    }
    assert.deepEqual(entry.settings,before);
  }
});

test('the independent decoder rejects broken paths and the vendor bytes stay pinned',async()=>{
  const data={schema:'heartcurves-2',units:'mm',curves:{0:{control_points:[[1,0],[1,30],[1,60],[1,100]]}},A_overlap_paths:[[{curve:'0',reverse:false}]]};
  assert.throws(()=>exportedPaperPaths(data,0,0));
  assert.throws(()=>exportedPaperPaths({...data,A_overlap_paths:[[]]},0));
  const broken=structuredClone(data);broken.A_overlap_paths[0].push({curve:'0',reverse:false});
  assert.throws(()=>exportedPaperPaths(broken,0),/Disconnected/);
  const reversed=structuredClone(data);reversed.A_overlap_paths[0][0].reverse=true;
  assert.deepEqual(exportedPaperPaths(reversed,0),[[[1,100],[1,0]]]);
  assert.throws(()=>audit([],100,60,.25));
  const provenance=JSON.parse(await fs.readFile('static/inverse/vendor/clipper2/PROVENANCE.json','utf8'));
  for(const [name,sha]of Object.entries(provenance.files)){
    assert.equal(createHash('sha256').update(await fs.readFile('static/inverse/vendor/clipper2/'+name)).digest('hex'),sha);
  }
});
