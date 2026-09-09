/** Fixed-geometry scalar-loss comparison. Saved curves are evaluation inputs,
 * never initialization for the separate fresh-image fitting benchmarks.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {cpus} from 'node:os';
import * as current from '../../static/inverse/core/direct/boundary.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {gridModel,gridPaths} from '../../static/inverse/core/direct/grid.js';
import {loadSolutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {fixture} from './fixtures.mjs';

const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232';
const output=process.env.INVERSE_TEST_OUTPUT||'tmp/boundary-value-benchmark';
const reference=process.env.INVERSE_VALUE_REFERENCE||'1ea762f';
const names=(process.env.INVERSE_TEST_BROWSERS||'node').split(',');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const source='static/inverse/core/direct/boundary.js';
const previousSource=execFileSync('git',['show',`${reference}:${source}`],{encoding:'utf8'});
for(const name of['math.js','curves.js','image-objective.js','native.js']){
  const file='static/inverse/core/direct/'+name;
  assert.equal(hash(await fs.readFile(file)),hash(execFileSync('git',['show',`${reference}:${file}`])),file);
}
const asGraph=solution=>new CurveGraph(solution.paths.map((family,f)=>family.map((_,i)=>curvesOf(solution,f,i).map(c=>c.p))),solution.graph.target.width);
const hatFile='scripts/inverse/fixtures/free-border-hat.json',hat=JSON.parse(await fs.readFile(hatFile));
const cases=[...[[3,8],[8,8],[8,16]].map(([count,k])=>({id:`grid-${count}-${k}`,graph:new CurveGraph(gridPaths(gridModel([count,count],k,17)))})),
  {id:'shared-corners',graph:asGraph(fixture('hidden-corner'))},
  {id:'hat',graph:asGraph(loadSolutionJSON(hat.geometry))}
].map(({graph,...entry})=>({...entry,width:graph.width,paths:graph.nested()}));

// Serialized unchanged into each browser; no outer-module dependencies.
function runCase(entry,n,weighted,current,previous,CurveGraph){
  const graph=new CurveGraph(entry.paths,entry.width),prob=Float64Array.from({length:n*n},(_,i)=>(i*19%31)/31);
  const weights=weighted?Float64Array.from(prob,(_,i)=>i%n<n/4?0:i%n<n/2?.25:1):null;
  const positions=[graph.points,Float64Array.from(graph.points,(v,i)=>v+.013*Math.sin(i)),Float64Array.from(graph.points,(v,i)=>v-.071*Math.cos(i))];
  const inputs=[];for(const transpose of[false,true])for(const phase of[1,-1])for(const points of positions)inputs.push({points,phase,transpose});
  const options=transpose=>({weights,transpose,rows:transpose?193:192});
  const runPrevious=()=>inputs.map(({points,phase,transpose})=>previous.boundaryValue(graph,points,prob,n,phase,options(transpose)));
  const prepare=()=>[false,true].map(transpose=>current.createBoundaryEvaluator(graph,prob,n,options(transpose)));
  const runPrepared=prepared=>inputs.map(({points,phase,transpose})=>prepared[Number(transpose)](points,phase));
  const expected=runPrevious(),check=values=>{if(values.length!==expected.length||values.some((v,i)=>!Object.is(v,expected[i])))throw new Error(`${entry.id}/${n}/${weighted}: scalar loss changed`);};
  check(runPrepared(prepare()));
  for(const {points,phase,transpose}of inputs){
    const i=inputs.findIndex(x=>x.points===points&&x.phase===phase&&x.transpose===transpose);
    if(!Object.is(current.boundaryValue(graph,points,prob,n,phase,options(transpose)),expected[i]))throw new Error('One-call API changed');
  }
  const runs=[];
  for(let round=0;round<3;round++){
    const row={},values={};
    for(const policy of round%2?['current','previous']:['previous','current']){
      const start=performance.now();
      if(policy==='previous'){values.previous=runPrevious();row.previousMilliseconds=performance.now()-start;}
      else{
        const prepared=prepare();row.preparationMilliseconds=performance.now()-start;
        const evaluationStart=performance.now();values.current=runPrepared(prepared);row.evaluationMilliseconds=performance.now()-evaluationStart;
        row.currentMilliseconds=performance.now()-start;
      }
    }
    check(values.current);check(values.previous);runs.push(row);
  }
  return{identical:true,evaluations:inputs.length,values:expected,runs};
}

await fs.mkdir(output,{recursive:true});
const report={reference,previousBoundarySha256:hash(previousSource),sourceHashes:{[source]:hash(await fs.readFile(source)),['scripts/inverse/boundary-value-benchmark.mjs']:hash(await fs.readFile('scripts/inverse/boundary-value-benchmark.mjs'))},runtime:process.version,cpu:cpus()[0]?.model,
  method:'Five fixed geometries, 256 and 400 pixels per side, unweighted and partial/zero-weight targets. Each case evaluates two orientations, both phases and three point arrays. Three alternating-order rounds after warmup. Current totals include preparing both orientation tables once and all 12 evaluations. Previous totals rebuild image integrals in all 12 calls. Every scalar and the one-call API must exactly match the previous source. Loading, fixtures and comparisons are outside the timers.',
  cases:cases.map(({paths,...entry})=>({...entry,geometrySha256:hash(JSON.stringify(paths))})),results:[]};
const append=async row=>{report.results.push(row);console.log(JSON.stringify({browser:row.browser,id:row.id,n:row.resolution,weighted:row.weighted,identical:row.identical}));await fs.writeFile(`${output}/results.json`,JSON.stringify(report,null,2)+'\n');};
for(const browserName of names){
  if(browserName==='node'){
    const previous=await import('data:text/javascript;base64,'+Buffer.from(previousSource.replace(/from '(\.[^']+)'/g,(_,p)=>`from '${pathToFileURL(path.resolve('static/inverse/core/direct',p)).href}'`)).toString('base64'));
    for(const entry of cases)for(const n of[256,400])for(const weighted of[false,true])await append({browser:'node',version:process.version,id:entry.id,resolution:n,weighted,...runCase(entry,n,weighted,current,previous,CurveGraph)});
    continue;
  }
  const browsers=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
  const browser=await browsers[browserName].launch({headless:true}),context=await browser.newContext();
  const referenceURL=origin+'/inverse/core/direct/qa-value-reference.js',pageURL=origin+'/inverse/qa-value.html';
  const referenceBody=previousSource.replace(/from '(\.[^']+)'/g,(_,p)=>`from '${new URL(p,origin+'/inverse/core/direct/boundary.js').href}'`);
  try{
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(url===referenceURL)return route.fulfill({contentType:'text/javascript',body:referenceBody});
      if(url===pageURL)return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Boundary value comparison</title>'});
      return new URL(url).origin===new URL(origin).origin?route.continue():route.abort();
    });
    const page=await context.newPage();await page.goto(pageURL);
    await page.evaluate(async({origin,referenceURL,runSource})=>{
      const [current,previous,curves]=await Promise.all([import(origin+'/inverse/core/direct/boundary.js'),import(referenceURL),import(origin+'/inverse/core/direct/curves.js')]);
      window.valueBench={current,previous,CurveGraph:curves.CurveGraph,run:eval('('+runSource+')')};
    },{origin,referenceURL,runSource:runCase.toString()});
    for(const entry of cases)for(const n of[256,400])for(const weighted of[false,true]){
      const result=await page.evaluate(({entry,n,weighted})=>{const b=window.valueBench;return b.run(entry,n,weighted,b.current,b.previous,b.CurveGraph);},{entry,n,weighted});
      await append({browser:browserName,version:browser.version(),id:entry.id,resolution:n,weighted,...result});
    }
  }finally{await context.close();await browser.close();}
}
