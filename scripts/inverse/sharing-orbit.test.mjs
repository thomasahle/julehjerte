import test from 'node:test';
import assert from 'node:assert/strict';
import {framePaths,antiSeamPaths} from './fixtures/symmetric-frame.mjs';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {settings} from '../../static/inverse/core/settings.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {finalizeShared} from '../../static/inverse/core/direct/share.js';
import {symmetryReport} from '../../static/inverse/core/direct/symmetry.js';
import {maskDisagreement} from '../../static/inverse/core/direct/prefer-matching.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {renderExportedWeave} from './export-renderer.mjs';
const names=['mirrorX','mirrorY','rotate180','transpose','antiTranspose'];
const solution=paths=>{const graph=new CurveGraph(paths,100);return graph.solution(graph.points,1);};
const hiddenLength=s=>s.graph.edges.filter(e=>!e.visible).reduce((sum,e)=>sum+e.curve.length(),0);
const fixture=unequal=>{
  const truth=solution(framePaths(0,unequal)),before=solution(framePaths(.16,unequal));
  before.graph.target.sourceImage={resolution:400,mask:sampleWeave(truth,400)};
  return{before,truth};
};
for(const unequal of[false,true])for(let bits=1;bits<(unequal?8:32);bits++){
  const requested=names.filter((_,i)=>bits&(1<<i)),symmetry=Object.fromEntries(requested.map(name=>[name,true]));
  test(`shared cuts preserve ${requested.join('+')} with ${unequal?'2×4':'2×2'} slits`,()=>{
    const {before}=fixture(unequal),saved=solutionJSON(before),source=before.graph.target.sourceImage,mask=source.mask.slice();
    const cfg=settings({symmetry,preferMatchingSheets:false});
    assert.equal(hiddenLength(before),0);assert.equal(validate(before,cfg,{checkImage:false}).passed,true);
    const after=finalizeShared(before,cfg);
    assert.equal(after.report.finalSharing.applied,true);
    assert.ok(hiddenLength(after)>84,'All four diagonal seams must be exactly shared.');
    assert.equal(maskDisagreement(source,sampleWeave(after,400)),0);
    assert.equal(validate(after,cfg,{checkImage:false}).passed,true);assert.equal(materialAudit(after,cfg).passed,true);
    assert.deepEqual(symmetryReport(after,symmetry).honoured.slice().sort(),requested.slice().sort());
    assert.deepEqual(solutionJSON(before),saved);assert.deepEqual(source.mask,mask);
    assert.equal(finalizeShared(after,cfg),after,'An already repaired frame must be a no-op.');
  });
}

test('shuffled paths, symmetry closure and independent exported SVG all retain repaired seams',async()=>{
  const {before,truth}=fixture(false),cfg=settings({symmetry:{mirrorX:true,transpose:true}});
  before.paths[0].reverse();before.paths[1].reverse();
  const after=finalizeShared(before,cfg);
  assert.ok(hiddenLength(after)>84);
  assert.deepEqual(symmetryReport(after,Object.fromEntries(names.map(n=>[n,true]))).honoured.slice().sort(),names.slice().sort());
  const [original,actual,target]=await Promise.all([before,after,truth].map(s=>renderExportedWeave(solutionJSON(s),1600)));
  const error=r=>r.coverage.reduce((sum,v,i)=>sum+Math.abs(v-target.coverage[i]),0)/r.coverage.length;
  assert.ok(error(original)>.005);assert.ok(error(actual)<error(original)/5,'Fractional image error must improve, including antialiased edge pixels.');
  // The unchanged outer spans retain some input perturbation. Isolate the
  // interiors of the four repaired seams to check their complete disappearance.
  for(let y=0;y<1600;y++)for(let x=0;x<1600;x++){
    const u=Math.min(x+.5,1599.5-x)/16,v=Math.min(y+.5,1599.5-y)/16;
    if(u>24&&u<31&&v>24&&v<31)assert.equal(actual.coverage[y*1600+x],target.coverage[y*1600+x]);
  }
});

test('orbit sharing retains deliberate thin lines and rejects absent input constraints',()=>{
  const {before}=fixture(true),cfg=settings({symmetry:{mirrorX:true,mirrorY:true}});
  const resolution=800,mask=sampleWeave(before,resolution);before.graph.target.sourceImage={resolution,mask};
  const after=finalizeShared(before,cfg);assert.deepEqual(sampleWeave(after,resolution),mask);
  assert.equal(hiddenLength(after),0);
  assert.equal(finalizeShared(before,cfg,{deadline:0}),before);
  assert.equal(finalizeShared(before,{...cfg,symmetry:{transpose:true,mirrorX:true}}),before);
});

for(const mode of['sym','anti'])for(const unequal of(mode==='sym'?[false,true]:[false])){
  const permitted=mode==='sym'?(unequal?names.slice(0,3):names):['transpose','antiTranspose','rotate180'];
  for(let bits=0;bits<1<<permitted.length;bits++){
    const symmetry={withinCurve:mode,...Object.fromEntries(permitted.filter((_,i)=>bits&(1<<i)).map(n=>[n,true]))};
    test(`shared cuts retain chord ${mode} ${JSON.stringify(symmetry)} ${unequal?'unequal':''}`,()=>{
      const paths=delta=>mode==='sym'?framePaths(delta,unequal):antiSeamPaths(delta),before=solution(paths(.16)),truth=solution(paths(0));
      before.graph.target.sourceImage={resolution:400,mask:sampleWeave(truth,400)};
      const cfg=settings({symmetry}),original=solutionJSON(before),after=finalizeShared(before,cfg),source=before.graph.target.sourceImage;
      assert.deepEqual(symmetryReport(before,symmetry).honoured,symmetryReport(before,symmetry).requested);
      assert.equal(after.report.finalSharing?.applied,true,JSON.stringify(after.report.finalSharing));
      assert.ok(hiddenLength(after)>84);assert.ok(maskDisagreement(source,sampleWeave(after,400))<maskDisagreement(source,sampleWeave(before,400)));
      assert.equal(validate(after,cfg,{checkImage:false}).passed,true);assert.equal(materialAudit(after,cfg).passed,true);
      assert.deepEqual(symmetryReport(after,symmetry).honoured,symmetryReport(after,symmetry).requested);
      assert.deepEqual(solutionJSON(before),original);assert.equal(finalizeShared(after,cfg),after);
    });
  }
}
