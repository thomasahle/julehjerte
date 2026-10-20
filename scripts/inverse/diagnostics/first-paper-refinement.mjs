/** Fixed-work diagnosis of the first paper-uncertain routing. These offset
 * checkpoints are experimental proposals, never replacements for final gates. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepare} from '../../../static/inverse/core/engine.js';
import {curvesOf,loadSolutionJSON,solutionJSON} from '../../../static/inverse/core/graph.js';
import {validate,sampleWeave} from '../../../static/inverse/core/validate.js';
import {materialAudit} from '../../../static/inverse/core/material.js';
import {geometricMaterialAudit,finalMaterialAudit} from '../../../static/inverse/core/geometric-material.js';
import {auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {CurveGraph} from '../../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../../static/inverse/core/direct/refine.js';
import {repairFinalPaper} from '../../../static/inverse/core/direct/final-paper-repair.js';
import {loadBoundaryKernel} from '../../../static/inverse/core/direct/native.js';
import {renderExportedWeave} from '../export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
assert.ok(args.output&&Object.keys(args).every(k=>['output','candidate'].includes(k)));
const output=path.resolve(args.output),candidateFolder=args.candidate||'tmp/heart-learning/first-paper-candidate-v1';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixtureBytes=await fs.readFile('scripts/inverse/fixtures/dinosaur-border-repair.json');
const fixture=JSON.parse(fixtureBytes),n=fixture.resolution,cfg=fixture.configuration,mask=new Uint8Array(n*n);
for(const [start,length]of fixture.maskRuns)mask.fill(1,start,start+length);
assert.equal(hash(mask),fixture.maskSha256);
const candidateBytes=await fs.readFile(path.join(candidateFolder,'geometry.json'));
const capture=JSON.parse(await fs.readFile(path.join(candidateFolder,'report.json')));
assert.equal(hash(candidateBytes),capture.geometrySha256);
assert.equal(hash(fixtureBytes),capture.fixtureSha256);
assert.equal(hash(mask),capture.maskSha256);
const input=prepare({type:'mask',mask:mask.slice(),resolution:n},{...cfg,invert:false,removeSpecks:0,fillHoles:0}).target;
const source=input.sourceImage,probabilityHash=hash(Buffer.from(source.probability.buffer));
await fs.mkdir(output);
const stat=await fs.statfs(output);assert.ok(stat.bavail*stat.bsize>=10*1024**3);
const plan={
  modes:['lattice','nominal-offset'],steps:[40,80,160,320],rate:.008,
  paperResolutions:[360,700,1000],finalPaperRepairMilliseconds:5000,
  scope:'Same first routing and unchanged target; each run starts fresh. Offset-only checkpoints are proposals. Every retained result receives both final paper models, full geometry and feature checks, plus independent exported rendering.',
  workers:1,nice:15,maximumArtifactsMiB:10,newSourceImages:0
};
const sourceHashes={};
for(const file of [new URL(import.meta.url).pathname,'scripts/inverse/export-renderer.mjs',
  ...(await fs.readdir('static/inverse',{recursive:true})).filter(f=>/\.(js|mjs|wasm)$/.test(f)).map(f=>'static/inverse/'+f)]){
  sourceHashes[file]=hash(await fs.readFile(file));
}
const report={schema:'first-paper-refinement-2',status:'running',plan,sourceHashes,configuration:cfg,
  fixtureSha256:hash(fixtureBytes),geometrySha256:hash(candidateBytes),maskSha256:hash(mask),runs:[]};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
let bytesWritten=0;
const write=async(name,bytes)=>{
  bytesWritten+=Buffer.byteLength(bytes);assert.ok(bytesWritten<plan.maximumArtifactsMiB*1024**2);
  await fs.writeFile(path.join(output,name),bytes);return{path:name,sha256:hash(bytes)};
};
await save();
await loadBoundaryKernel();
try{
  for(const mode of plan.modes)for(const steps of plan.steps){
    const row={mode,steps};report.runs.push(row);await save();
    const proposal=loadSolutionJSON(JSON.parse(candidateBytes)),phase=proposal.graph.target.phase?-1:1;
    const graph=new CurveGraph(proposal.paths.map((family,f)=>family.map((_,i)=>curvesOf(proposal,f,i).map(c=>c.p))),cfg.width);
    const paperAudit=mode==='lattice'?materialAudit:(s,c)=>geometricMaterialAudit(s,c,{tolerance:.002,probeRadii:false});
    const start=performance.now();
    const fitted=refineCurves(graph,source.probability,n,phase,cfg,{input,steps,rate:plan.rate,selection:'mask',paperAudit});
    row.refinementSeconds=(performance.now()-start)/1000;row.history=fitted.history;
    const solution=graph.solution(fitted.points,phase,input),name=`${mode}-${steps}`;
    row.rawGeometry=await write(name+'-raw.json',JSON.stringify(solutionJSON(solution))+'\n');
    row.raw={geometry:validate(solution,cfg),features:auditFeatureFidelity(source,sampleWeave(solution,n),cfg),paper:[]};
    for(const resolution of plan.paperResolutions){
      const audit=finalMaterialAudit(solution,{...cfg,materialResolution:resolution});
      row.raw.paper.push({resolution,...audit.summary});
    }
    const repaired=repairFinalPaper(solution,cfg,{maxMilliseconds:plan.finalPaperRepairMilliseconds});
    row.repair=repaired.report;
    row.repairedGeometry=await write(name+'-repaired.json',JSON.stringify(solutionJSON(repaired.solution))+'\n');
    const exported=await renderExportedWeave(solutionJSON(repaired.solution),n);
    row.preview=await write(name+'-woven.png',exported.png);
    row.final={geometry:validate(repaired.solution,cfg),
      features:auditFeatureFidelity(source,exported.mask,cfg),
      paper:finalMaterialAudit(repaired.solution,{...cfg,materialResolution:repaired.solution.report?.paperVerification?.resolution||cfg.materialResolution}).summary,
      independentError:exported.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length};
    assert.equal(hash(source.mask),hash(mask));assert.equal(hash(Buffer.from(source.probability.buffer)),probabilityHash);
    await save();
    console.log(JSON.stringify({mode,steps,seconds:row.refinementSeconds,rawPaper:row.raw.paper.map(p=>p.status),
      repaired:row.repair.accepted,finalPaper:row.final.paper.status,error:row.final.independentError}));
  }
  report.status='complete';
}catch(error){report.status='failed';report.error=error.stack;throw error;}
finally{await save();}
