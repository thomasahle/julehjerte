/** Compare the previous gradient dispatcher with forced and measured backends
 * on fixed geometry. These inputs exercise derivatives, not image fitting.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {gridModel,gridPaths} from '../../static/inverse/core/direct/grid.js';
import {loadSolutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {fixture} from './fixtures.mjs';

const browsers=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232';
const reference=process.env.INVERSE_GRADIENT_REFERENCE||'4550269',output=process.env.INVERSE_TEST_OUTPUT||'tmp/boundary-kernel-benchmark';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const previous=execFileSync('git',['show',`${reference}:static/inverse/core/direct/boundary.js`],{encoding:'utf8'});
for(const name of['direct/math.js','direct/curves.js','direct/native.js','direct/image-objective.js','numerical-kernel.js','direct/native/boundary.c','direct/native/boundary.wasm']){
 const file='static/inverse/core/'+name;assert.equal(hash(await fs.readFile(file)),hash(execFileSync('git',['show',`${reference}:${file}`])),file);
}
const asGraph=solution=>new CurveGraph(solution.paths.map((family,f)=>family.map((_,i)=>curvesOf(solution,f,i).map(c=>c.p))),solution.graph.target.width);
const hatFile='scripts/inverse/fixtures/free-border-hat.json',hat=JSON.parse(await fs.readFile(hatFile));
const cases=[
 ...[[3,8],[8,8],[8,16]].map(([count,k])=>({id:`grid-${count}-${k}`,graph:new CurveGraph(gridPaths(gridModel([count,count],k,17)))})),
 {id:'shared-corners',graph:asGraph(fixture('hidden-corner'))},
 {id:'hat',source:hatFile,sourceSha256:hash(await fs.readFile(hatFile)),graph:asGraph(loadSolutionJSON(hat.geometry))}
].map(({graph,...entry})=>({...entry,width:graph.width,paths:graph.nested()}));
const sourceHashes={};for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){
 const file='static/inverse/core/'+name;sourceHashes[file]=hash(await fs.readFile(file));
}
const referenceURL=origin+'/inverse/core/direct/qa-boundary-reference.js',pageURL=origin+'/inverse/qa-gradient.html';
const referenceBody=previous.replace(/from '(\.[^']+)'/g,(_,p)=>`from '${new URL(p,origin+'/inverse/core/direct/boundary.js').href}'`);
const report={reference,previousBoundarySha256:hash(previous),sourceHashes,method:'Five fixed geometries at 256 and 400 image cells per side, both phases. Four rotating policy orders; 16 calls per timer. Loading, warmups, backend calibration and coordinate equality checks are outside the timers. Every timed result must match the previous gradient exactly. Times are milliseconds per call.',cases:cases.map(({paths,...entry})=>({...entry,geometrySha256:hash(JSON.stringify(paths))})),results:[]};
await fs.mkdir(output,{recursive:true});
for(const browserName of(process.env.INVERSE_TEST_BROWSERS||'firefox,chromium,webkit').split(',')){
 const browser=await browsers[browserName].launch({headless:true}),context=await browser.newContext();
 try{
  await context.route('**/*',route=>{
   const url=route.request().url();
   if(url===referenceURL)return route.fulfill({contentType:'text/javascript',body:referenceBody});
   if(url===pageURL)return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Boundary kernel comparison</title>'});
   return new URL(url).origin===new URL(origin).origin?route.continue():route.abort();
  });
  const page=await context.newPage();await page.goto(pageURL);
  await page.evaluate(async({origin,referenceURL})=>{
   const [current,previous,curves,kernel]=await Promise.all([import(origin+'/inverse/core/direct/boundary.js'),import(referenceURL),import(origin+'/inverse/core/direct/curves.js'),import(origin+'/inverse/core/direct/native.js')]);
   const loaded=await kernel.loadBoundaryKernel();if(loaded.backend!=='wasm')throw new Error(JSON.stringify(loaded));
   window.gradientBench={current:current.boundaryGradient,previous:previous.boundaryGradient,CurveGraph:curves.CurveGraph,choices:current.boundaryKernelChoices};
  },{origin,referenceURL});
  for(const [caseIndex,entry]of cases.entries())for(const n of[256,400])for(const phase of[1,-1]){
   const value=await page.evaluate(({entry,n,phase,caseIndex})=>{
    const {current,previous,CurveGraph,choices}=window.gradientBench,graph=new CurveGraph(entry.paths,entry.width),prob=Float64Array.from({length:n*n},(_,i)=>(i*19%31)/31);
    const policies=['previous','javascript','forcedWasm','current'],run=policy=>(policy==='previous'||policy==='javascript'?previous:current)(graph,graph.points,prob,n,phase,{native:policy==='javascript'?false:policy==='current'?'auto':true});
    const expected=run('previous'),check=values=>{for(const value of values){if(value.length!==expected.length)throw new Error('Gradient dimensions changed');for(let i=0;i<value.length;i++)if(!Object.is(value[i],expected[i]))throw new Error(`${entry.id}: coordinate ${i} changed`);}};
    for(const policy of policies)for(let i=0;i<4;i++)check([run(policy)]);
    const runs=[];
    for(let round=0;round<4;round++){
     const values={},timings={};
     for(let j=0;j<policies.length;j++){
      const policy=policies[(caseIndex+round+j)%policies.length],batch=[],start=performance.now();
      for(let i=0;i<16;i++)batch.push(run(policy));
      timings[policy]=(performance.now()-start)/16;values[policy]=batch;
     }
     for(const batch of Object.values(values))check(batch);runs.push(timings);
    }
    return{runs,coordinates:expected.length,edges:graph.edges.length,visibleEdges:graph.visible.filter(Boolean).length,identical:true,boundaryKernels:choices()};
   },{entry,n,phase,caseIndex});
   const row={browser:browserName,version:browser.version(),id:entry.id,resolution:n,phase,...value};report.results.push(row);
   console.log(JSON.stringify(row));await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');
  }
 }finally{await context.close();await browser.close();}
}
