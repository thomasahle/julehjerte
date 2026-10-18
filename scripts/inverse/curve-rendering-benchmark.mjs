/** Compare complete mask renders on fixed geometry, never optimizer seeds. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {cpus} from 'node:os';
import * as current from '../../static/inverse/core/direct/curves.js';
import {gridModel,gridPaths} from '../../static/inverse/core/direct/grid.js';
import {curvesOf,loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {fixture} from './fixtures.mjs';

const reference=process.env.INVERSE_RENDER_REFERENCE||'105990e',output=process.env.INVERSE_RENDER_OUT||'tmp/curve-rendering',origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232';
const names=(process.env.INVERSE_TEST_BROWSERS||'node').split(','),hash=b=>createHash('sha256').update(b).digest('hex');
const source='static/inverse/core/direct/curves.js',previousSource=execFileSync('git',['show',`${reference}:${source}`],{encoding:'utf8'});
assert.equal(execFileSync('git',['diff',reference,'--name-only','--','static/inverse/core'],{encoding:'utf8'}).trim(),source,'The comparison requires unchanged renderer dependencies');
const asPaths=s=>s.paths.map((family,f)=>family.map((_,i)=>curvesOf(s,f,i).map(c=>c.p)));
const hat=JSON.parse(await fs.readFile('scripts/inverse/fixtures/free-border-hat.json')),corners=fixture('hidden-corner');
const cases=[...[[3,8],[8,8],[8,16]].map(([count,k])=>({id:`grid-${count}-${k}`,paths:gridPaths(gridModel([count,count],k,17)),width:100})),
 {id:'shared-corners',paths:asPaths(corners),width:corners.graph.target.width},
 {id:'unrepaired-hat',paths:asPaths(loadSolutionJSON(hat.geometry)),width:100}];
for(const name of ['top-hat','top-hat-independent','top-hat-anti']){
 const file=`tmp/anti-sharing-release-browser/chromium-${name}/cut_geometry.json`;
 try{const s=loadSolutionJSON(await fs.readFile(file,'utf8'));cases.push({id:name,paths:asPaths(s),width:s.graph.target.width,sourceFile:file});}
 catch(error){if(error.code!=='ENOENT')throw error;}
}

// This function runs unchanged in Node and each browser. The middle policy
// isolates using row bins from cancelling shared curves in the new renderer.
function runCase(entry,n,ns,current,previous){
 const graph=new current.CurveGraph(entry.paths,entry.width),inputs=[];
 for(const p of [graph.points,Float64Array.from(graph.points,(v,i)=>v+.013*Math.sin(i+1))])for(const phase of[1,-1])inputs.push({points:p,phase});
 const binned=(graph,points,phase,n,ns)=>{
  const index=previous.polygonIndex(graph,points,ns),out=new Uint8Array(n*n),w=graph.width;
  for(let y=0;y<n;y++){
   const yy=(y+.5)*w/n,xs=[];
   for(const id of index.bins[Math.max(0,Math.min(index.bins.length-1,Math.floor(yy/w*index.bins.length)))]){
    const s=index.segments[id];if(yy>=s[1]&&yy<s[3])xs.push(s[0]+(yy-s[1])*(s[2]-s[0])/(s[3]-s[1]));
   }
   xs.sort((a,b)=>a-b);let at=0,p=Number(phase===-1);
   for(let x=0;x<n;x++){while(at<xs.length&&xs[at]<(x+.5)*w/n){p^=1;at++;}out[y*n+x]=p;}
  }return out;
 };
 const policies={previous:previous.renderCurves,binned,current:current.renderCurves},expected=inputs.map(({points,phase})=>previous.renderCurves(graph,points,phase,n,ns));
 const check=values=>values.forEach((v,j)=>{if(v.length!==expected[j].length||v.some((x,i)=>x!==expected[j][i]))throw new Error(`${entry.id}/${n}/${ns}/${j}: mask changed`);});
 const evaluate=fn=>inputs.map(({points,phase})=>fn(graph,points,phase,n,ns));
 for(const fn of Object.values(policies))check(evaluate(fn));
 const runs=[],batchSizes=Object.fromEntries(Object.keys(policies).map(k=>[k,1]));
 for(let round=0;round<3;round++){
  const row={},order=Object.keys(policies);order.push(...order.splice(0,round));
  for(const name of order){
   // Some browser clocks round a complete small render to zero. Time enough
   // repetitions to exceed that resolution, then normalize to four inputs.
   for(;;){
    const iterations=batchSizes[name],values=[],start=performance.now();
    for(let i=0;i<iterations;i++)values.push(evaluate(policies[name]));
    const elapsed=performance.now()-start;for(const value of values)check(value);
    if(elapsed>=16){row[name+'Milliseconds']=elapsed/iterations;row[name+'BatchMilliseconds']=elapsed;row[name+'Iterations']=iterations;break;}
    if(iterations>=1024)throw new Error('Clock resolution prevents a meaningful timing measurement');
    batchSizes[name]*=2;
   }
  }
  runs.push(row);
 }
 // The force field excludes one path at a time; its index must retain even
 // shared curves and exactly the same crossing arithmetic after refactoring.
 for(const {points,phase}of inputs){
  const a=current.polygonIndex(graph,points,ns),b=previous.polygonIndex(graph,points,ns);
  if(JSON.stringify(a.segments)!==JSON.stringify(b.segments)||JSON.stringify(a.bins)!==JSON.stringify(b.bins))throw new Error('Individual path index changed');
  for(const exclude of [-1,...graph.paths.map((_,i)=>i)])for(let i=0;i<13;i++){
   const x=(i*37%101)*entry.width/100,y=(i*23%101)*entry.width/100;
   if(a.contains(x,y,exclude,phase)!==b.contains(x,y,exclude,phase))throw new Error('Excluded-path membership changed');
  }
 }
 return{identicalMasks:true,identicalPathIndex:true,inputsPerBatch:inputs.length,minimumTimedMilliseconds:16,uniqueCurves:graph.edges.length,sharedCurves:graph.visible.filter(v=>!v).length,curveOccurrences:graph.paths.reduce((s,p)=>s+p.length,0),runs};
}

await fs.mkdir(output,{recursive:true});
const report={reference,previousSourceSha256:hash(previousSource),sourceHashes:{[source]:hash(await fs.readFile(source)),['scripts/inverse/curve-rendering-benchmark.mjs']:hash(await fs.readFile('scripts/inverse/curve-rendering-benchmark.mjs'))},runtime:process.version,cpu:cpus()[0]?.model,
 method:'Fixed geometry, 128/256/400 pixels, 24/48 samples per cubic, original and perturbed controls including endpoints, both phases. Every complete mask must equal the previous renderer. Individual path segments, bins and exclusion queries must also match. Three policy-order rotations after warmup. Each policy repeats all four inputs in batches of at least 16 ms to overcome coarse browser clocks; timings are normalized to one batch of four inputs, with actual durations and repetition counts recorded. Index construction and allocation are included; fixture loading and comparison are excluded. Saved fits never initialize an optimizer.',
 cases:cases.map(({paths,...r})=>({...r,geometrySha256:hash(JSON.stringify(paths))})),servedSourceHashes:{},results:[]};
const append=async r=>{report.results.push(r);console.log(JSON.stringify({browser:r.browser,id:r.id,resolution:r.resolution,samples:r.samples,identical:r.identicalMasks}));await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2)+'\n');};
for(const name of names){
 if(name==='node'){
  const previous=await import('data:text/javascript;base64,'+Buffer.from(previousSource.replace(/from '(\.[^']+)'/g,(_,p)=>`from '${pathToFileURL(path.resolve('static/inverse/core/direct',p)).href}'`)).toString('base64'));
  for(const entry of cases)for(const n of[128,256,400])for(const ns of[24,48])await append({browser:name,version:process.version,id:entry.id,resolution:n,samples:ns,...runCase(entry,n,ns,current,previous)});
  continue;
 }
 const response=await fetch(origin+'/inverse/core/direct/curves.js');assert.ok(response.ok,'The production renderer must be served');
 report.servedSourceHashes[name]=hash(Buffer.from(await response.arrayBuffer()));
 assert.equal(report.servedSourceHashes[name],report.sourceHashes[source],'The served renderer must match the benchmarked source');
 const browsers=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),browser=await browsers[name].launch({headless:true}),context=await browser.newContext();
 const referenceURL=origin+'/inverse/core/direct/qa-render-reference.js',pageURL=origin+'/inverse/qa-render.html';
 const body=previousSource.replace(/from '(\.[^']+)'/g,(_,p)=>`from '${new URL(p,origin+'/inverse/core/direct/curves.js').href}'`);
 try{
  await context.route('**/*',route=>{
   const url=route.request().url();
   if(url===referenceURL)return route.fulfill({contentType:'text/javascript',body});
   if(url===pageURL)return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Curve renderer comparison</title>'});
   return new URL(url).origin===new URL(origin).origin?route.continue():route.abort();
  });
  const page=await context.newPage();await page.goto(pageURL);
  await page.evaluate(async({origin,referenceURL,run})=>{window.renderBench={current:await import(origin+'/inverse/core/direct/curves.js'),previous:await import(referenceURL),run:eval('('+run+')')};},{origin,referenceURL,run:runCase.toString()});
  for(const entry of cases)for(const n of[128,256,400])for(const ns of[24,48]){
   const result=await page.evaluate(({entry,n,ns})=>{const b=window.renderBench;return b.run(entry,n,ns,b.current,b.previous);},{entry,n,ns});
   await append({browser:name,version:browser.version(),id:entry.id,resolution:n,samples:ns,...result});
  }
 }finally{await context.close();await browser.close();}
}
