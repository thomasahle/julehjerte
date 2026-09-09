/** Isolate one refinement checkpoint on saved browser geometry. Fresh solve
 * benchmarks are separate; these saved paths never seed their optimizers. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {DIRECT_PRESET} from '../../static/inverse/core/presets.js';
import {loadSolutionJSON,curvesOf,solutionJSON} from '../../static/inverse/core/graph.js';
import {primitiveComplexity} from '../../static/inverse/core/direct/primitives.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {referenceError} from '../../static/inverse/core/image-reference.js';

const arg=name=>process.argv.find(s=>s.startsWith(`--${name}=`))?.slice(name.length+3);
const directory=arg('input')||'tmp/conversion-fidelity-browser',output=arg('output')||'tmp/primitive-selection-replay',reference=arg('reference')||'5c20357';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const commit=execFileSync('git',['rev-parse','--verify','--end-of-options',reference+'^{commit}'],{encoding:'utf8'}).trim();
const file='static/inverse/core/direct/refine.js',old=execFileSync('git',['show',`${commit}:${file}`],{encoding:'utf8'});
const changed=execFileSync('git',['diff',commit,'--name-only','--','static/inverse/core'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert.deepEqual(changed.filter(f=>![file,'static/inverse/core/direct/primitive-selection.js','static/inverse/core/direct/fit.js'].includes(f)),[],'Reference refinement dependencies changed');
await fs.mkdir(output,{recursive:true});
const copy=path.join(output,'reference-refine.mjs');
await fs.writeFile(copy,old.replace(/from '([^']+)'/g,(_,specifier)=>`from '${pathToFileURL(path.resolve(path.dirname(file),specifier)).href}'`));
const previous=(await import(pathToFileURL(path.resolve(copy)))).refineCurves;
const source=JSON.parse(await fs.readFile(directory+'/results.json')),results=[];
const report={method:'One geometry and paper-validated checkpoint per policy on each saved browser fit, with no gradient updates. Original masks, weights, requested symmetries and matching constraints retained. Independent exported-curve rendering. Timers include the checkpoint, not source loading or independent rendering. This isolates degree selection, not complete fitting.',referenceCommit:commit,previousSourceSha256:hash(old),inputReportSha256:hash(await fs.readFile(directory+'/results.json')),sourceHashes:{},results};
for(const file of ['static/inverse/core/direct/refine.js','static/inverse/core/direct/primitive-selection.js','scripts/inverse/primitive-selection-replay.mjs'])report.sourceHashes[file]=hash(await fs.readFile(file));
for(const entry of source.results){
 assert.equal(entry.passed,true);
 const id=entry.browser+'-'+entry.name,dir=path.join(directory,id),bytes=await fs.readFile(dir+'/cut_geometry.json'),geometry=JSON.parse(bytes),p=JSON.parse(await fs.readFile(dir+'/prepared.json')),engine=JSON.parse(await fs.readFile(dir+'/engine-report.json'));
 const row={id,geometrySha256:hash(bytes),preparedSha256:hash(await fs.readFile(dir+'/prepared.json'))};results.push(row);
 try{
  const symmetry=Object.fromEntries(engine.symmetry.requested.filter(k=>!k.startsWith('withinCurve')).map(k=>[k,true]));
  for(const name of engine.symmetry.requested)if(name.startsWith('withinCurve'))symmetry.withinCurve=name.endsWith('Anti')?'anti':'sym';
  const cfg=settings({...DIRECT_PRESET,trials:0,symmetry}),solution=loadSolutionJSON(geometry),paths=solution.paths.map((f,fi)=>f.map((_,i)=>curvesOf(solution,fi,i).map(c=>c.p)));
  const input={...solution.graph.target,sourceImage:{mask:Uint8Array.from(p.mask),resolution:p.resolution,...(p.weights?{weights:Float64Array.from(p.weights)}:{})}};
  for(const policy of results.length%2?['previous','current']:['current','previous']){
   const graph=new CurveGraph(paths,geometry.square_width_mm),start=performance.now();
   const candidate=(policy==='previous'?previous:refineCurves)(graph,Float64Array.from(p.mask),p.resolution,geometry.phase?-1:1,cfg,{steps:0,selection:'mask',input,weights:p.weights,identicalSheets:engine.solver.matchingPreference?.identical??false});
   const seconds=(performance.now()-start)/1000,out=solutionJSON(graph.solution(candidate.points,candidate.phase,input)),independent=await renderExportedWeave(out,p.resolution);
   row[policy]={seconds,error:candidate.error,score:candidate.score,primitives:primitiveComplexity(graph,candidate.points),selective:candidate.selective??false,geometryPassed:candidate.geometryPassed,paperPassed:candidate.paperPassed,independent:referenceError(input.sourceImage,independent.mask)};
   const dest=path.join(output,id,policy);await fs.mkdir(dest,{recursive:true});await fs.writeFile(dest+'/cut_geometry.json',JSON.stringify(out));await fs.writeFile(dest+'/woven.png',independent.png);
  }
  assert.equal(row.current.geometryPassed,true);assert.equal(row.current.paperPassed,true);
  assert.ok(row.current.error<=row.previous.error+1e-12,'Selective degree proposal increased checkpoint mask error');
  row.passed=true;
 }catch(error){row.passed=false;row.failure=error.stack;process.exitCode=1;}
 console.log(JSON.stringify(row));await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2)+'\n');
}
