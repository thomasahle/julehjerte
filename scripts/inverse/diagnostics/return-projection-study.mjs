/** Offline projection study on saved/analytic curves and exact subdivisions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {returnDiagnosticCases,subdivideDiagnosticPaths} from '../self-return-subdivision-study.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(Object.keys(args).some(k=>!['runtime','output'].includes(k))||!args.output)throw new Error('Use --output=<new directory> and optionally --runtime=<inverse directory>.');
const runtime=path.resolve(args.runtime||'static/inverse'),out=path.resolve(args.output);
const relative=path.relative(process.cwd(),out);
if(!relative||relative==='..'||relative.startsWith('../')||path.isAbsolute(relative))throw new Error('Output must be a new directory inside this worktree.');
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const load=file=>import(pathToFileURL(path.resolve(runtime,'core',file)));
const {CurveGraph}=await load('direct/curves.js'),{projectShortReturns}=await load('direct/short-return-project.js'),{validate}=await load('validate.js');
const {solutionJSON}=await load('graph.js');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),rows=[];
const entries=await returnDiagnosticCases(),fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/final-hidden-return.json'));
entries.push({name:'final-hidden',paths:fixture.paths,cfg:fixture.settings,phase:fixture.phase});
for(const entry of entries)for(const [subdivision,knots]of [['original',[0,1]],['halves',[0,.5,1]]])for(const reflected of[false,true]){
 const transformed=subdivideDiagnosticPaths(entry.paths,knots,reflected,entry.cfg.width),graph=new CurveGraph(transformed.paths,entry.cfg.width),before=graph.points.slice(),phase=entry.phase??1;
 const initial=graph.solution(before,phase),audit=validate(initial,entry.cfg,{checkImage:false,finalGeometry:true});
 for(const hiddenOnly of[false,true]){
  const started=performance.now(),repair=projectShortReturns(graph,before,phase,{},entry.cfg,{initialAudit:audit,hiddenOnly,maxIterations:64,maxMilliseconds:2000});
  const row={name:entry.name,subdivision,reflected,hiddenOnly,initialIssueTypes:[...new Set(audit.issues.map(i=>i.type))],milliseconds:performance.now()-started,report:repair.report,accepted:!!repair.points};
  if(repair.points){
   const solution=graph.solution(repair.points,phase),final=validate(solution,entry.cfg,{checkImage:false,finalGeometry:true});
   assert.equal(final.passed,true,JSON.stringify({...row,final}));row.serializedGeometrySha256=hash(solutionJSON(solution));
   assert.equal(repair.validation.passed,true);
   const visible=new Set(graph.edges.flatMap((ids,e)=>graph.visible[e]?ids:[]));
   for(let i=0;i<before.length;i++)if(graph.fixed[i]||hiddenOnly&&visible.has(Math.floor(i/2)))assert.equal(repair.points[i],before[i]);
  }
  assert.deepEqual(graph.points,before);rows.push(row);
 }
}
// A stale/incomplete initial audit must not suppress the final endpoint check.
const entry=entries.find(r=>r.name==='curved-return-1'),paths=structuredClone(entry.paths);
paths[0][0][0][0][1]=.2;
const graph=new CurveGraph(paths,entry.cfg.width),original=graph.points.slice(),audit=validate(graph.solution(original,1),entry.cfg,{checkImage:false,finalGeometry:true});
assert.ok(audit.issues.some(i=>i.type==='wrong_endpoints'));
const partial={...audit,issues:audit.issues.filter(i=>i.type==='short_self_clearance')};
assert.ok(partial.issues.length);
const rejected=projectShortReturns(graph,original,1,{},entry.cfg,{initialAudit:partial,maxIterations:64,maxMilliseconds:2000});
assert.equal(rejected.points,null,'Removing the local return cannot certify a fixed wrong endpoint.');
assert.deepEqual(graph.points,original);
const sourceHashes={},sha=b=>createHash('sha256').update(b).digest('hex');
for(const name of await fs.readdir(path.join(runtime,'core'),{recursive:true})){
 const file=path.join(runtime,'core',name);
 if((await fs.stat(file)).isFile())sourceHashes[file]=sha(await fs.readFile(file));
}
for(const file of ['scripts/inverse/diagnostics/return-projection-study.mjs','scripts/inverse/self-return-subdivision-study.mjs','scripts/inverse/fixtures/final-hidden-return.json',...new Set(entries.flatMap(e=>e.file?[e.file]:[]))])sourceHashes[file]=sha(await fs.readFile(file));
const record={runtime,sourceHashes,nodeVersion:process.version,
 scope:'Saved and analytic geometry only; no inverse fitting or real-photo reconstruction score. Each accepted projection faces a separate full geometry check, fixed-control checks and caller-immutability checks.',
 timing:'Projection wall time only. Initial audit, separate final checks and file writes are excluded; these timings are not whole-pipeline latency.',
 limits:{maxIterations:64,maxMilliseconds:2000},rows,invalidEndpoint:rejected.report};
await fs.writeFile(path.join(out,'results.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({runtime,cases:rows.length,accepted:rows.filter(r=>r.accepted).length,milliseconds:rows.reduce((s,r)=>s+r.milliseconds,0),invalidEndpoint:rejected.report}));
