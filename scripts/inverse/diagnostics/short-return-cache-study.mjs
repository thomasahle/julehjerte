/** Exact-output and timing comparison; never fits or changes the live runtime. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {experimentalSelfReturns as candidate} from './self-return-candidate.mjs';
import {returnDiagnosticCases,diagnosticSubdivisions,subdivideDiagnosticPaths} from '../self-return-subdivision-study.mjs';
import {CurveGraph} from '../../../static/inverse/core/direct/curves.js';
import {loadSolutionJSON,curvesOf} from '../../../static/inverse/core/graph.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.before||!args.corpus||!args.output)throw new Error('Use --before=<saved predicate source> --corpus=<native release directory> --output=<new directory>');
await fs.mkdir(path.dirname(args.output),{recursive:true});await fs.mkdir(args.output);
// A git-show copy retains its original relative imports. Resolve just that
// known prefix against the worktree, without creating another source checkout.
const before=await fs.readFile(args.before,'utf8');
const code=before.replaceAll("'../../../static/inverse/core/",`'${pathToFileURL(path.resolve('static/inverse/core')).href}/`);
const {experimentalSelfReturns:baseline}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
assert.equal(typeof baseline,'function');
const cases=await returnDiagnosticCases(),rows=[];
for(const group of ['hunodan','photos']){
 const directory=path.join(args.corpus,group);
 for(const name of (await fs.readdir(directory,{recursive:true})).filter(f=>f.endsWith('/cut_geometry.json')).sort()){
  const file=path.join(directory,name),bytes=await fs.readFile(file);
  const solution=loadSolutionJSON({...JSON.parse(bytes),schema:'heartcurves-2',units:'mm'});
  const report=JSON.parse(await fs.readFile(path.join(path.dirname(file),'report.json')));
  cases.push({name:group+'/'+name.split('/')[0],paths:solution.paths.map((f,k)=>f.map((_,s)=>curvesOf(solution,k,s).map(c=>c.p))),cfg:report.settings,file,sha256:hash(bytes)});
 }
}
for(const entry of cases){
 const original=JSON.stringify(entry.paths);
 for(const [representation,knots]of Object.entries(diagnosticSubdivisions))for(const reflect of [false,true]){
  const divided=subdivideDiagnosticPaths(entry.paths,knots,reflect,entry.cfg.width);
  const graph=new CurveGraph(divided.paths,entry.cfg.width),solution=graph.solution(graph.points,1);
  const timings={baseline:[],candidate:[]};let expected;
  for(let round=0;round<3;round++)for(const name of round%2?['candidate','baseline']:['baseline','candidate']){
   const start=performance.now(),issues=({baseline,candidate})[name](solution,entry.cfg);
   timings[name].push(performance.now()-start);
   if(expected)assert.deepEqual(issues,expected,`${entry.name} ${representation}, reflect=${reflect}`);
   else expected=issues;
  }
  rows.push({name:entry.name,representation,reflect,file:entry.file,sha256:entry.sha256,issues:expected,timings});
 }
 assert.equal(JSON.stringify(entry.paths),original);
 console.log(entry.name);
}
const total=key=>rows.reduce((sum,r)=>sum+r.timings[key].reduce((s,v)=>s+v,0),0);
const summary={representations:rows.length,checks:rows.length*6,baselineMilliseconds:total('baseline'),candidateMilliseconds:total('candidate'),speedup:total('baseline')/total('candidate')};
const sourceHashes={};
for(const file of [args.before,'scripts/inverse/diagnostics/short-return-cache-study.mjs','scripts/inverse/diagnostics/self-return-candidate.mjs','scripts/inverse/self-return-subdivision-study.mjs','static/inverse/core/bezier.js','static/inverse/core/graph.js','static/inverse/core/geometry.js','static/inverse/core/direct/curves.js'])sourceHashes[file]=hash(await fs.readFile(file));
await fs.writeFile(path.join(args.output,'results.json'),JSON.stringify({scope:'Three alternating-order paired evaluations per exact curve representation. Every complete issue object must match exactly. Saved geometries, not fresh reconstruction or browser timing.',arguments:args,summary,sourceHashes,rows},null,2)+'\n');
console.log(JSON.stringify(summary));
