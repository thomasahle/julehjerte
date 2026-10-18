import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {borderEvidence,countHypotheses,gridCountLimit,extendInteriorCountHypotheses} from '../../static/inverse/core/direct/counts.js';
import {interiorCountEvidence} from '../../static/inverse/core/direct/interior-counts.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';

const cfg=settings({...AUTOMATIC_PRESET,timeLimit:10,trials:0});
function context(fullProb,resolution,weights=null,config=cfg){
  const n=Math.min(256,resolution),small=resizeObjective(fullProb,resolution,n,weights),evidence=borderEvidence(fullProb,resolution);
  return{fullProb,resolution,fullWeights:weights,prob:small.probability,n,weights:small.weights,evidence,
    options:countHypotheses({prob:small.probability,n,weights:small.weights,cfg:config,evidence})};
}
function checker(counts,n=192){return Float32Array.from({length:n*n},(_,i)=>(Math.floor((i%n+.5)*(counts[0]+1)/n)+Math.floor((Math.floor(i/n)+.5)*(counts[1]+1)/n))&1);}
async function fixture(){
  const data=JSON.parse(await fs.readFile(new URL('./fixtures/dense-checker-interior.json',import.meta.url)));
  const mask=new Uint8Array(data.resolution**2);let value=data.first,offset=0;
  for(const run of data.runs){assert.ok(Number.isInteger(run)&&run>0);mask.fill(value,offset,offset+run);value^=1;offset+=run;}
  assert.equal(offset,mask.length);assert.equal(createHash('sha256').update(mask).digest('hex'),data.maskSha256);
  return{mask,resolution:data.resolution};
}

test('dense photographic interiors add starts without losing lower counts or phases',async()=>{
  const {mask,resolution}=await fixture(),before=mask.slice(),args=context(mask,resolution),proposal=extendInteriorCountHypotheses(args,cfg);
  assert.equal(gridCountLimit(args.evidence),8);assert.equal(proposal.report.maximumCount,11);
  assert.ok(proposal.report.added>0);
  for(const option of args.options)assert.ok(proposal.options.includes(option),'Every original start remains eligible.');
  assert.ok(proposal.options.some(o=>o.counts[0]===10&&o.counts[1]===11));
  assert.ok(proposal.options.every(o=>o.counts.every(n=>n<=11)));
  for(const option of proposal.options)assert.ok(proposal.options.some(o=>o.phase===-option.phase&&o.counts.every((c,i)=>c===option.counts[i])));
  assert.deepEqual(mask,before);
});

test('ordinary grids and uncertain color chatter keep their original hypothesis list',()=>{
  for(const prob of [checker([3,5]),checker([8,8]),Float32Array.from({length:192**2},(_,i)=>.5+.05*Math.sin(i*13))]){
    const args=context(prob,192),proposal=extendInteriorCountHypotheses(args,cfg);
    assert.equal(proposal.options,args.options);assert.equal(proposal.report.added,0);
  }
});

test('interior density evidence survives edge noise, flips, transpose and color inversion',()=>{
  const n=192,original=checker([10,11],n),before=original.slice();
  for(const mode of ['edge-noise','flip-x','transpose','invert']){
    const prob=Float32Array.from(original,(_,i)=>{
      const x=i%n,y=Math.floor(i/n);
      if(mode==='edge-noise'&&Math.min(x,y,n-1-x,n-1-y)<.05*n)return Number((19*x+23*y)%5<2);
      return mode==='flip-x'?original[y*n+n-1-x]:mode==='transpose'?original[x*n+y]:mode==='invert'?1-original[i]:original[i];
    });
    const proposal=extendInteriorCountHypotheses(context(prob,n),cfg);
    assert.ok(proposal.report.maximumCount>=11,mode);
    assert.ok(proposal.report.bands.every(b=>b.bands===33&&b.fractionAboveEight>=.75));
  }
  assert.deepEqual(original,before);
});

test('ignored and poorly observed bands cannot vote for denser starts',()=>{
  const n=192,prob=checker([10,11],n),args=context(prob,n);
  // A damaged outer boundary no longer offers the independent edge expansion.
  args.evidence=borderEvidence(checker([3,3],n),n);
  for(const weights of [new Float64Array(n*n),Float64Array.from(prob,(_,i)=>Number(Math.abs(Math.floor(i/n)-n/2)<n*.15))]){
    const proposal=extendInteriorCountHypotheses({...args,fullWeights:weights},cfg);
    assert.equal(proposal.options,args.options);assert.equal(proposal.report.added,0);
  }
  assert.deepEqual(interiorCountEvidence(prob,n,new Float64Array(n*n)).map(b=>b.bands),[0,0]);
});

test('additional count proposals respect requested symmetry and physical strip width',async()=>{
  const {mask,resolution}=await fixture();
  for(const config of [settings({...cfg,symmetry:{mirrorX:true,mirrorY:true}}),settings({...cfg,minWidth:8})]){
    const args=context(mask,resolution,null,config),proposal=extendInteriorCountHypotheses(args,config);
    for(const option of args.options)assert.ok(proposal.options.includes(option));
    for(const option of proposal.options){
      assert.ok(option.counts.every(c=>(c+1)*(config.nominalWidth+.35)<config.width));
      if(config.symmetry)assert.ok(option.counts.every(c=>c%2===0));
    }
  }
});

test('the main fitter reconstructs the dense binary photo target with legal editable-sized counts',async t=>{
  const {mask,resolution}=await fixture(),raw={...AUTOMATIC_PRESET,timeLimit:10,trials:0};
  const target=prepare({type:'mask',mask:mask.slice(),resolution},raw).target,before=target.sourceImage.probability.slice();
  const answer=await design(target,raw),proposal=answer.report.solver.countSearch.interiorProposal;
  if(!answer.report.templateChecksPassed)t.diagnostic(JSON.stringify({
    validation:answer.report.validation,paper:answer.report.manufacturing.status,
    imageError:answer.report.imageError,termination:answer.report.solver.termination,
    counts:answer.report.solver.selectedCounts,stages:answer.report.solver.stages,
  }));
  assert.equal(proposal.previousMaximum,8);assert.equal(proposal.maximumCount,11);assert.ok(proposal.added>0);
  assert.ok(Object.values(answer.report.slits).every(n=>n<=11));
  assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
  assert.equal(answer.report.templateChecksPassed,true);
  const woven=await renderExportedWeave(answer.files['cut_geometry.json'],resolution);
  const error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.03,`Independent disagreement ${error}; the eight-cut result exceeded 5%.`);
  assert.equal(auditFeatureFidelity(target.sourceImage,woven.mask,answer.report.settings).passed,true);
  assert.deepEqual(target.sourceImage.mask,mask);assert.deepEqual(target.sourceImage.probability,before);
});
