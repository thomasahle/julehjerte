/** Paired, fixed-graph MILP timings. This measures arrival of the first routing,
 * including rejected geometry; it is not an end-to-end acceptance benchmark.
 * Usage: node scripts/inverse/solver-connectivity-benchmark.mjs
 *        [--reference=407a97e5] [--output=tmp/solver-connectivity]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as current from '../../static/inverse/core/solver.js';
import {prepare} from '../../static/inverse/core/engine.js';
import {preprocessMask} from '../../static/inverse/core/input.js';
import {settings} from '../../static/inverse/core/settings.js';
import {buildGraph} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {loadBoundaryKernel} from '../../static/inverse/core/direct/native.js';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(Object.keys(args).some(k=>!['reference','output'].includes(k)))throw new Error('Unknown benchmark argument.');
const reference=args.reference||'407a97e5',output=args.output||'tmp/solver-connectivity';
const filename='static/inverse/core/solver.js',base=pathToFileURL(path.resolve(filename)),hash=s=>createHash('sha256').update(s).digest('hex');
const referenceCommit=execFileSync('git',['rev-parse',reference],{encoding:'utf8'}).trim();
const previousCode=execFileSync('git',['show',`${referenceCommit}:${filename}`],{encoding:'utf8'});
const fixtureFile='scripts/inverse/fixtures/sloth-search-scheduling.json',fixtureBytes=await fs.readFile(fixtureFile),fixture=JSON.parse(fixtureBytes);
await fs.mkdir(output,{recursive:true});
const temporary=await fs.mkdtemp(path.join(output,'.reference-'));
const moduleFile=path.join(temporary,'solver.mjs');
await fs.writeFile(moduleFile,previousCode.replace(/from '(\.[^']+)'/g,(_,specifier)=>`from '${new URL(specifier,base).href}'`).replaceAll('import.meta.url',JSON.stringify(base.href)));
const report={referenceCommit,sourceSha256:hash(await fs.readFile(filename)),referenceSha256:hash(previousCode),fixtureFile,fixtureSha256:hash(fixtureBytes),
  node:process.version,platform:process.platform,arch:process.arch,secondsPerGraph:4,
  scope:'Current path-step recovery formulation versus previous commodity-flow formulation on identical freshly traced source masks and connector graphs; alternating previous/current order. Stop at the first returned integer routing, whether accepted or rejected by geometry. No template or accepted candidate is used as a warm start. Not a full solver benchmark.',rows:[]};
try{
  const previous=await import(pathToFileURL(path.resolve(moduleFile)).href);
  await previous.solverRuntime();await current.solverRuntime();await loadBoundaryKernel();
  let graphIndex=0;
  for(const entry of fixture.cases)for(const radius of [.3,.5]){
    const n=entry.resolution,mask=new Uint8Array(n*n);for(const [start,length]of entry.maskRuns)mask.fill(1,start,start+length);
    assert.equal(hash(mask),entry.maskSha256);
    const cfg=settings({...fixture.configuration,neighbors:8,connectorVariants:1,timeLimit:4,invert:false,removeSpecks:0,fillHoles:0});
    const input=prepare({type:'mask',mask,resolution:n},cfg).target;
    const target=preprocessMask(mask,n,{...cfg,algorithm:'trace',fitTolerance:.75,smoothRadius:radius,snapRadius:1.5,maxSpan:30,borderRadius:3},input.metadata.preprocessing);
    target.sourceImage=input.sourceImage;const graph=buildGraph(target,cfg);
    for(const name of graphIndex%2?['current','previous']:['previous','current']){
      const solver=name==='previous'?previous:current,start=performance.now();let result,firstCandidate=null,accepted=false;
      try{
        const solution=await solver.solveGraph(graph,cfg,{stopAfterValidated:true,coefficientQuantum:1e-7,...(name==='current'?{connectivity:'path-step-order'}:{}),
          onRejectedCandidate:async(candidate,timing)=>{
            firstCandidate={...timing,issues:validate(candidate,cfg).issues.map(i=>i.type)};return true;
          }});
        result=solution.report;accepted=true;assert.ok(validate(solution,cfg).passed);
      }catch(error){if(!error.report)throw error;result=error.report;}
      const row={case:entry.id,radius,formulation:name,connectivity:result.connectivity||'commodity-flow',seconds:(performance.now()-start)/1000,
        binaryVariables:result.binaryVariables,continuousVariables:result.continuousVariables,linearConstraints:result.linearConstraints,
        geometryAccepted:accepted,firstCandidate,history:result.history,termination:result.termination};
      report.rows.push(row);console.log(JSON.stringify(row));
      await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
    }
    graphIndex++;
  }
}finally{await fs.rm(temporary,{recursive:true});}
