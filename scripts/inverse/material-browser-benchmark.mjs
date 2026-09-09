/** Serial paper-audit comparisons in actual browser engines. Production
 * modules are loaded from the preview; the previous implementation is served
 * only to this isolated benchmark page by its own Playwright context.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fixture} from './fixtures.mjs';
import {solutionJSON} from '../../static/inverse/core/graph.js';

const browsers=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232';
const output=process.env.INVERSE_TEST_OUTPUT||'tmp/material-browser-benchmark',reference=process.env.INVERSE_PAPER_REFERENCE||'0a30976';
const hash=b=>createHash('sha256').update(b).digest('hex'),previous=execFileSync('git',['show',`${reference}:static/inverse/core/material.js`],{encoding:'utf8'});
for(const name of['bezier.js','graph.js','geometry.js','validate.js','settings.js'])assert.equal(hash(await fs.readFile(`static/inverse/core/${name}`)),hash(execFileSync('git',['show',`${reference}:static/inverse/core/${name}`])),name);
const referenceURL=origin+'/inverse/core/qa-material-reference.js',pageURL=origin+'/inverse/qa-paper.html';
const referenceBody=previous.replace(/from '(\.[^']+)'/g,(_,p)=>`from '${new URL(p,origin+'/inverse/core/material.js').href}'`);
const cases=['straight','neck'].map(name=>({id:name,data:solutionJSON(fixture(name)),cfg:{width:60,minWidth:3,cutError:0,printShrinkPercent:0,materialResolution:360}}));
for(const [id,file]of[
 ['hjcur-04','tmp/image-reuse-hunodan-replay/hjcur-04/cut_geometry.json'],
 ['hjhih-04','tmp/image-reuse-hunodan-replay/hjhih-04/cut_geometry.json'],
 ['top-hat','tmp/image-reuse-weighted/top-hat-0.84-weighted/cut_geometry.json']
]){const bytes=await fs.readFile(file);cases.push({id,data:JSON.parse(bytes),source:file,sourceSha256:hash(bytes),cfg:{width:100,materialResolution:360}});}
await fs.mkdir(output,{recursive:true});
const report={origin,reference,previousMaterialSha256:hash(previous),sourceHashes:{},method:'Same complete audit, including maps. Four rounds rotate policy order after one warmup for each policy and input. Loading, warmups and exact comparisons are outside audit timers. current selects the measured backend; cachedJavaScript and forcedWasm isolate backend costs with the same outline reuse.',cases:cases.map(({data:_data,...entry})=>entry),results:[]};
for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){const file=`static/inverse/core/${name}`;report.sourceHashes[file]=hash(await fs.readFile(file));}
for(const browserName of(process.env.INVERSE_TEST_BROWSERS||'firefox,chromium,webkit').split(',')){
 const browser=await browsers[browserName].launch({headless:true}),context=await browser.newContext();
 try{
  await context.route('**/*',route=>{
   const url=route.request().url();
   if(url===referenceURL)return route.fulfill({contentType:'text/javascript',body:referenceBody});
   if(url===pageURL)return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Paper audit benchmark</title>'});
   return new URL(url).origin===new URL(origin).origin?route.continue():route.abort();
  });
  const page=await context.newPage();await page.goto(pageURL);
  await page.evaluate(async({origin,referenceURL})=>{
   const [current,previous,graph,config,kernel]=await Promise.all([import(origin+'/inverse/core/material.js'),import(referenceURL),import(origin+'/inverse/core/graph.js'),import(origin+'/inverse/core/settings.js'),import(origin+'/inverse/core/numerical-kernel.js')]);
   const backend=await kernel.loadNumericalKernel();if(backend.backend!=='wasm')throw new Error(JSON.stringify(backend));
   window.paperBench={current:current.materialAudit,previous:previous.materialAudit,load:graph.loadSolutionJSON,settings:config.settings,choices:current.paperKernelChoices};
  },{origin,referenceURL});
  for(const [index,entry]of cases.entries()){
   const value=await page.evaluate(({entry,index})=>{
    const {current,previous,load,settings,choices}=window.paperBench,solution=load(entry.data),cfg=settings(entry.cfg),policies=['previous','cachedJavaScript','forcedWasm','current'],runs=[];
    const audit=policy=>(policy==='previous'?previous:current)(solution,cfg,{includeMaps:true,native:policy==='cachedJavaScript'?false:policy==='forcedWasm'?true:'auto'});
    const summary=result=>JSON.stringify({...result,families:result.families.map(({map:_map,...family})=>family),summary:{...result.summary,seconds:undefined}});
    for(const policy of policies)audit(policy);
    let status;
    for(let round=0;round<policies.length;round++){
     const results={},timings={};
     for(let i=0;i<policies.length;i++){const policy=policies[(index+round+i)%policies.length],start=performance.now();results[policy]=audit(policy);timings[policy]=(performance.now()-start)/1000;}
     for(const policy of policies.slice(1)){
      if(summary(results[policy])!==summary(results.previous))throw new Error(`${entry.id}: ${policy} changed an audit field`);
      for(let f=0;f<2;f++){const a=results.previous.families[f].map,b=results[policy].families[f].map;if(a.length!==b.length)throw new Error('Map dimensions changed');for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw new Error(`${entry.id}: ${policy} changed family ${f}, pixel ${i}`);}
     }
     status=results.current.status;runs.push(timings);
    }
    return{runs,status,identical:true,paperKernels:choices()};
   },{entry,index});
   const row={browser:browserName,version:browser.version(),id:entry.id,...value};report.results.push(row);
   console.log(JSON.stringify(row));await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');
  }
 }finally{await context.close();await browser.close();}
}
