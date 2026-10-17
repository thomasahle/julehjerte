/** Compare indexed scalar loss with the frozen full-scan reference.
 * Both policies prepare their image integrals once. This does not benchmark
 * complete fitting or supply saved curves as initializers to any solver.
 * Run with nice -n 15; output must be a new directory under this worktree's tmp.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {getPriority} from 'node:os';
import {referenceBoundaryEvaluator} from '../fixtures/boundary-value-reference.mjs';

const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const args=process.argv.slice(2);
assert.ok(args.length===1&&args[0].startsWith('--output='),'Pass --output=tmp/<new-directory>.');
const directory=path.resolve(root,args[0].slice('--output='.length));
assert.ok(directory.startsWith(path.join(root,'tmp')+path.sep),'Keep benchmark artifacts under the worktree tmp directory.');
assert.ok(getPriority()>=15,'Run at low priority: nice -n 15 node ...');
await fs.mkdir(directory);
const output=path.join(directory,'results.json');
const read=async name=>JSON.parse(await fs.readFile(name,'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const core=(await fs.readdir(path.join(root,'static/inverse/core'),{recursive:true}))
  .filter(name=>/\.(js|wasm)$/.test(name)).map(name=>'static/inverse/core/'+name);
const names=[...core,'scripts/inverse/fixtures/boundary-value-reference.mjs',
  'scripts/inverse/fixtures/free-border-hat.json','scripts/inverse/fixtures.mjs',
  path.relative(root,fileURLToPath(import.meta.url))];
const pins={};for(const name of names)pins[name]=sha(await fs.readFile(path.join(root,name)));

const baseline={createBoundaryEvaluator:referenceBoundaryEvaluator,boundaryValue:(graph,points,prob,n,phase,options)=>referenceBoundaryEvaluator(graph,prob,n,options)(points,phase)};
const candidate=await import(root+'/static/inverse/core/direct/boundary.js');
const {CurveGraph}=await import(root+'/static/inverse/core/direct/curves.js');
const {gridModel,gridPaths}=await import(root+'/static/inverse/core/direct/grid.js');
const {loadSolutionJSON,curvesOf}=await import(root+'/static/inverse/core/graph.js');
const {fixture}=await import(root+'/scripts/inverse/fixtures.mjs');
const line=(a,b)=>[a,a.map((v,i)=>v+(b[i]-v)/3),a.map((v,i)=>v+2*(b[i]-v)/3),b];
const asGraph=solution=>new CurveGraph(solution.paths.map((family,f)=>family.map((_,i)=>curvesOf(solution,f,i).map(curve=>curve.p))),solution.graph.target.width);
const hat=await read(root+'/scripts/inverse/fixtures/free-border-hat.json');
const entries=[
  {id:'empty',graph:new CurveGraph([[],[]])},
  {id:'horizontal-and-vertical',graph:new CurveGraph([[[line([25,0],[25,100])]],[[line([0,37],[100,37])]]])},
  {id:'bin-edge',graph:new CurveGraph([[[line([100*17/128,0],[100*17/128,100])]],[[line([0,100*23/128],[100,100*23/128])]]])},
  {id:'nonmonotone-outside',graph:new CurveGraph([[[[[25,0],[120,140],[-20,-40],[75,100]]]],[]])},
  {id:'disconnected-joins',graph:new CurveGraph([[[line([25,0],[25,45]),line([30,55],[30,100])]],[]])},
  ...[[3,8],[8,8],[8,16]].map(([count,k])=>({id:`grid-${count}-${k}`,graph:new CurveGraph(gridPaths(gridModel([count,count],k,17)))})),
  {id:'shared-corners',graph:asGraph(fixture('hidden-corner'))},
  {id:'hat',graph:asGraph(loadSolutionJSON(hat.geometry))}
];
const report={scope:'Fixed scalar-loss evaluation, not whole-solver or browser timing. Both policies prepare image integrals once, outside evaluation timing. Every scalar must match exactly. Saved curves are evaluation inputs only.',
  runtime:process.version,referenceRevision:'4379b66',sourceHashes:pins,
  scriptSha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),results:[]};
const started=performance.now();
for(const {id,graph} of entries)for(const n of [17,256])for(const weighted of [false,true]){
  const prob=Float64Array.from({length:n*n},(_,i)=>(i*19%31)/31);
  const weights=weighted?Float64Array.from(prob,(_,i)=>i%n<n/4?0:i%n<n/2?.25:1):null;
  const positions=[graph.points,Float64Array.from(graph.points,(v,i)=>v+.013*Math.sin(i+1)),Float64Array.from(graph.points,(v,i)=>v-.071*Math.cos(i+1))];
  const evaluators={},preparation={};
  for(const [name,module] of Object.entries({baseline,candidate})){
    const at=performance.now();
    evaluators[name]=[false,true].map(transpose=>module.createBoundaryEvaluator(graph,prob,n,{weights,transpose,rows:transpose?193:192}));
    preparation[name]=performance.now()-at;
  }
  const run=name=>[false,true].flatMap(transpose=>[1,-1].flatMap(phase=>positions.map(points=>evaluators[name][Number(transpose)](points,phase))));
  const expected=run('baseline');
  assert.ok(expected.every(Number.isFinite),id);
  const check=values=>assert.ok(values.length===expected.length&&values.every((v,i)=>Object.is(v,expected[i])),`${id}/${n}/${weighted}: scalar changed`);
  check(run('candidate'));
  for(const transpose of [false,true])for(const phase of [1,-1]){
    const options={weights,transpose,rows:17};
    assert.equal(candidate.boundaryValue(graph,positions[1],prob,n,phase,options),baseline.boundaryValue(graph,positions[1],prob,n,phase,options));
  }
  const runs=[];
  for(let round=0;round<4;round++){
    const timings={};
    for(const name of round%2?['candidate','baseline']:['baseline','candidate']){
      const values=[],at=performance.now();
      do{values.push(run(name));}while(performance.now()-at<16&&values.length<64);
      const elapsed=performance.now()-at;
      for(const value of values)check(value);
      timings[name]={milliseconds:elapsed/values.length,batchMilliseconds:elapsed,repetitions:values.length};
    }
    runs.push(timings);
  }
  report.results.push({id,resolution:n,weighted,edges:graph.edges.length,identical:true,evaluations:expected.length,geometrySha256:sha(JSON.stringify(graph.nested())),preparationMilliseconds:preparation,runs});
  console.log(JSON.stringify({id,resolution:n,weighted,identical:true}));
  assert.ok(performance.now()-started<120000,'Bounded experiment exceeded two minutes.');
}
for(const [name,hash] of Object.entries(pins))assert.equal(sha(await fs.readFile(path.join(root,name))),hash,name);
report.seconds=(performance.now()-started)/1000;
report.sourceHashesMatchedAfterRun=true;
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(output);
