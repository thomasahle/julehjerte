/** Compare calibration cost and repeated complete paper audits on fixed curves.
 * Policy modules get fresh selectors; kernel loading and fixture loading are
 * outside the timers. Saved geometry never initializes an image fitter.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {cpus} from 'node:os';
import {materialAudit} from '../../static/inverse/core/material.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {settings} from '../../static/inverse/core/settings.js';
import {fixture} from './fixtures.mjs';

const output=process.env.INVERSE_CALIBRATION_OUT||'tmp/paper-calibration',origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232';
const names=(process.env.INVERSE_TEST_BROWSERS||'node').split(','),rounds=4,followups=16;
const policies={legacy:{repetitions:1,minimumBatchMilliseconds:0},batch4:{repetitions:16,minimumBatchMilliseconds:4},batch8:{repetitions:32,minimumBatchMilliseconds:8},selective8:{repetitions:32,minimumBatchMilliseconds:8,quickDecision:true}};
const hash=b=>createHash('sha256').update(b).digest('hex'),materialSource=await fs.readFile('static/inverse/core/material.js','utf8');
const cases=[{id:'straight-80',data:solutionJSON(fixture('straight')),cfg:{width:60,minWidth:3,cutError:0,printShrinkPercent:0,materialResolution:80}},
 {id:'neck-180',data:solutionJSON(fixture('neck')),cfg:{width:60,minWidth:3,cutError:0,printShrinkPercent:0,materialResolution:180}}];
const hat=await fs.readFile('scripts/inverse/fixtures/free-border-hat.json');
cases.push({id:'matching-hat-360',data:JSON.parse(hat).geometry,source:'scripts/inverse/fixtures/free-border-hat.json',sourceSha256:hash(hat),cfg:{width:100,materialResolution:360}});
for(const [id,file]of [['hjhih-04','tmp/paper-tiles-hunodan/hjhih-04/cut_geometry.json'],['circle','tmp/paper-tiles-weighted/circle-0.84-weighted/cut_geometry.json']]){
 const data=await fs.readFile(file);cases.push({id,data:JSON.parse(data),source:file,sourceSha256:hash(data),cfg:{width:100,materialResolution:360}});
}
const selectorSource=(policy,root)=>`import {measuredKernel} from '${new URL('./kernel-choice.js',root).href}';\nexport {sameArray,sameCore} from '${new URL('./paper-backend.js',root).href}';\nexport const paperBackend=(equal,options={})=>measuredKernel(equal,{...${JSON.stringify(policies[policy])},...options,describe:cells=>({cells})});\n`;
const moduleSource=(selector,root,identity)=>materialSource.replace(/from '(\.[^']+)'/g,(_,p)=>`from '${p==='./paper-backend.js'?selector:new URL(p,root).href}'`)+`\n// isolated ${identity}\n`;
const dataURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');

// Runs unchanged in Node and browsers. It deliberately compares complete
// audit maps outside every timer and rechecks earlier returned arrays too.
async function runCase(entry,round,order,followups,loadPolicy,load,settings,reference){
 const solution=load(entry.data),cfg=settings(entry.cfg),expected=reference(solution,cfg,{includeMaps:true,native:false});
 const summary=r=>JSON.stringify({...r,families:r.families.map(({map:_map,...family})=>family),summary:{...r.summary,seconds:undefined}});
 const expectedSummary=summary(expected),check=r=>{
  if(summary(r)!==expectedSummary)throw new Error(entry.id+': audit fields changed');
  for(let f=0;f<2;f++){const a=expected.families[f].map,b=r.families[f].map;if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw new Error(entry.id+': paper map changed');}
 };
 // Warm the common scratch memory and native code independently of selectors.
 check(reference(solution,cfg,{includeMaps:true,native:true}));
 const results=[];
 for(const policy of order){
  const module=await loadPolicy(policy),start=performance.now(),first=module.materialAudit(solution,cfg,{includeMaps:true});
  const firstMilliseconds=performance.now()-start;check(first);
  const values=[],batchStart=performance.now();for(let i=0;i<followups;i++)values.push(module.materialAudit(solution,cfg,{includeMaps:true}));
  const followupMilliseconds=performance.now()-batchStart;
  for(const value of values)check(value);check(first);
  results.push({policy,firstMilliseconds,followupMilliseconds,followups,totalMilliseconds:firstMilliseconds+followupMilliseconds,identical:true,status:expected.status,choices:module.paperKernelChoices()});
 }
 return{round,results};
}
await fs.mkdir(output,{recursive:true});
const sourceHashes={};for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){const file='static/inverse/core/'+name;sourceHashes[file]=hash(await fs.readFile(file));}
sourceHashes['scripts/inverse/paper-calibration-benchmark.mjs']=hash(await fs.readFile('scripts/inverse/paper-calibration-benchmark.mjs'));
const report={runtime:process.version,cpu:cpus()[0]?.model,policies,rounds,followups,sourceHashes,
 method:'Fresh selector instances for each policy, geometry and round. Four rotating policy orders. First complete audit includes calibration and all equality checks performed by the selector. The following 16 complete audits are timed together. Fixture/module/kernel loading and the independent JavaScript/native oracle and map comparisons are outside timers. Common kernel code and scratch memory are warmed before each group. Both audit maps and all fields except elapsed time must equal the JavaScript oracle; first-call returned arrays are rechecked after subsequent calls. Only timing decisions may be retained. No optimizer runs or saved-template seeds.',
 cases:cases.map(({data,...entry})=>({...entry,geometrySha256:hash(JSON.stringify(data))})),results:[]};
const append=async row=>{report.results.push(row);console.log(JSON.stringify({browser:row.browser,id:row.id,round:row.round,results:row.results.map(({choices,...r})=>r)}));await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2)+'\n');};
for(const name of names){
 if(name==='node'){
  assert.equal((await loadNumericalKernel()).backend,'wasm');const root=pathToFileURL(path.resolve('static/inverse/core/material.js')).href;
  for(const [index,entry]of cases.entries())for(let round=0;round<rounds;round++){
   const names=Object.keys(policies),order=names.map((_,i)=>names[(index+round+i)%names.length]);
   const loadPolicy=policy=>import(dataURL(moduleSource(dataURL(selectorSource(policy,root)),root,`${entry.id}/${round}/${policy}`)));
   await append({browser:name,version:process.version,id:entry.id,...await runCase(entry,round,order,followups,loadPolicy,loadSolutionJSON,settings,materialAudit)});
  }
  continue;
 }
 const browsers=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),browser=await browsers[name].launch({headless:true}),context=await browser.newContext(),root=origin+'/inverse/core/material.js';
 try{
  // Verify that each dependency loaded by the isolated policies is the source
  // recorded in this report. Their material module is explicitly substituted.
  for(const [file,sha]of Object.entries(sourceHashes))if(file.startsWith('static/')){
   const response=await fetch(origin+'/'+file.replace(/^static\//,''));assert.ok(response.ok,file);assert.equal(hash(Buffer.from(await response.arrayBuffer())),sha,file);
  }
  await context.route('**/*',route=>{
   const url=new URL(route.request().url()),policy=url.searchParams.get('policy');
   if(url.pathname==='/inverse/qa-calibration.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Paper calibration comparison</title>'});
   if(url.pathname==='/inverse/core/qa-calibration-selector.js'&&policies[policy])return route.fulfill({contentType:'text/javascript',body:selectorSource(policy,root)});
   if(url.pathname==='/inverse/core/qa-calibration-material.js'&&policies[policy])return route.fulfill({contentType:'text/javascript',body:moduleSource(origin+'/inverse/core/qa-calibration-selector.js?policy='+policy,root,url.search)});
   return url.origin===origin?route.continue():route.abort();
  });
  const page=await context.newPage();await page.goto(origin+'/inverse/qa-calibration.html');
  await page.evaluate(async({origin,run})=>{
   const kernel=await import(origin+'/inverse/core/numerical-kernel.js');if((await kernel.loadNumericalKernel()).backend!=='wasm')throw new Error('No native paper kernel');
   const graph=await import(origin+'/inverse/core/graph.js'),config=await import(origin+'/inverse/core/settings.js'),material=await import(origin+'/inverse/core/material.js');
   window.calibrationBench={load:graph.loadSolutionJSON,settings:config.settings,reference:material.materialAudit,run:eval('('+run+')')};
  },{origin,run:runCase.toString()});
  for(const [index,entry]of cases.entries())for(let round=0;round<rounds;round++){
   const names=Object.keys(policies),order=names.map((_,i)=>names[(index+round+i)%names.length]);
   const result=await page.evaluate(async({entry,round,order,followups,origin})=>{
    const b=window.calibrationBench,loadPolicy=policy=>import(origin+'/inverse/core/qa-calibration-material.js?policy='+policy+'&identity='+entry.id+'-'+round);
    return b.run(entry,round,order,followups,loadPolicy,b.load,b.settings,b.reference);
   },{entry,round,order,followups,origin});
   await append({browser:name,version:browser.version(),id:entry.id,...result});
  }
 }finally{await context.close();await browser.close();}
}
