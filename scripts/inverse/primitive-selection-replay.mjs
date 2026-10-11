/** Isolate final degree reduction on saved browser geometry. These saved paths
 * never seed the optimizers in the separate fresh-solve benchmarks. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {finalizePrimitives} from '../../static/inverse/core/direct/primitive-selection.js';
import {settings} from '../../static/inverse/core/settings.js';
import {DIRECT_PRESET} from '../../static/inverse/core/presets.js';
import {loadSolutionJSON,curvesOf,solutionJSON} from '../../static/inverse/core/graph.js';
import {primitiveComplexity} from '../../static/inverse/core/direct/primitives.js';
import {validate,sampleWeave} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {referenceError} from '../../static/inverse/core/image-reference.js';

const arg=name=>process.argv.find(s=>s.startsWith(`--${name}=`))?.slice(name.length+3);
const directory=arg('input')||'tmp/conversion-fidelity-browser',output=arg('output')||'tmp/final-primitives-replay',reference=arg('reference')||'5c20357';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const commit=execFileSync('git',['rev-parse','--verify','--end-of-options',reference+'^{commit}'],{encoding:'utf8'}).trim();
const previousSource=execFileSync('git',['show',`${commit}:static/inverse/core/direct/finalize.js`],{encoding:'utf8'});
const changed=execFileSync('git',['diff',commit,'--name-only','--','static/inverse/core'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert.deepEqual(changed.filter(f=>!['static/inverse/core/direct/finalize.js','static/inverse/core/direct/primitive-selection.js','static/inverse/core/direct/primitives.js'].includes(f)),[],'Upstream fitting or final-check dependencies changed');
await fs.mkdir(output,{recursive:true});
const source=JSON.parse(await fs.readFile(directory+'/results.json')),results=[];
const report={method:'The baseline is the saved final output, not a rerun of the old optimizer. Apply final degree reduction to the identical saved geometry with its original mask, weights, symmetry and matching constraints. No gradient updates, clamping, matching search or shared-cut search. Both outputs are validated and independently rendered from exported curves. Cleanup time excludes input loading and independent checks. Upstream fitter and validator sources must still match the reference.',referenceCommit:commit,previousFinalizerSha256:hash(previousSource),inputReportSha256:hash(await fs.readFile(directory+'/results.json')),sourceHashes:{},results};
for(const file of ['static/inverse/core/direct/finalize.js','static/inverse/core/direct/refine.js','static/inverse/core/direct/primitive-selection.js','static/inverse/core/direct/primitives.js','scripts/inverse/primitive-selection-replay.mjs'])report.sourceHashes[file]=hash(await fs.readFile(file));
for(const entry of source.results){
 assert.equal(entry.passed,true);
 const id=entry.browser+'-'+entry.name,dir=path.join(directory,id),bytes=await fs.readFile(dir+'/cut_geometry.json'),geometry=JSON.parse(bytes),p=JSON.parse(await fs.readFile(dir+'/prepared.json')),engine=JSON.parse(await fs.readFile(dir+'/engine-report.json'));
 const row={id,geometrySha256:hash(bytes),preparedSha256:hash(await fs.readFile(dir+'/prepared.json'))};results.push(row);
 try{
  const symmetry=Object.fromEntries(engine.symmetry.requested.filter(k=>!k.startsWith('withinCurve')).map(k=>[k,true]));
  for(const name of engine.symmetry.requested)if(name.startsWith('withinCurve'))symmetry.withinCurve=name.endsWith('Anti')?'anti':'sym';
  const cfg=settings({...DIRECT_PRESET,...engine.settings,trials:0,symmetry}),image={mask:Uint8Array.from(p.mask),resolution:p.resolution,...(p.weights?{weights:Float64Array.from(p.weights)}:{})};
  for(const policy of ['previous','current']){
   let solution=loadSolutionJSON(structuredClone(geometry));solution.graph.target.sourceImage=image;solution.report=structuredClone(engine.solver);
   let seconds=null;
   if(policy==='current'){const start=performance.now();solution=finalizePrimitives(solution,cfg);seconds=(performance.now()-start)/1000;}
   const paths=solution.paths.map((f,fi)=>f.map((_,i)=>curvesOf(solution,fi,i).map(c=>c.p))),graph=new CurveGraph(paths,geometry.square_width_mm),out=solutionJSON(solution),independent=await renderExportedWeave(out,p.resolution);
   const check=validate(solution,cfg,{checkImage:false}),paper=check.passed?materialAudit(solution,cfg):null;
   row[policy]={seconds,primitives:primitiveComplexity(graph,graph.points),selection:solution.report.finalPrimitiveSelection??null,curveSelection:solution.report.finalCurvePrimitiveSelection??null,geometryPassed:check.passed,paperPassed:paper?.passed??false,source:referenceError(image,sampleWeave(solution,p.resolution)),independent:referenceError(image,independent.mask)};
   const dest=path.join(output,id,policy);await fs.mkdir(dest,{recursive:true});await fs.writeFile(dest+'/cut_geometry.json',JSON.stringify(out));await fs.writeFile(dest+'/woven.png',independent.png);
  }
  assert.equal(row.current.geometryPassed,true);assert.equal(row.current.paperPassed,true);
  assert.ok(row.current.source.mismatchFraction<=row.previous.source.mismatchFraction+1e-12,'Final degree reduction increased original-mask disagreement');
  row.passed=true;
 }catch(error){row.passed=false;row.failure=error.stack;process.exitCode=1;}
 console.log(JSON.stringify(row));await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2)+'\n');
}
