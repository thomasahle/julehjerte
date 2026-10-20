/** Built-site upload, local model, cancellation and graceful fallback QA. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {heartPhoto} from './crop-fixture.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.deepEqual(Object.keys(args).sort(),['origin','output']);
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const report={schema:'neural-upload-browser-1',status:'running',checks:[],errors:[],modelRequests:0,externalRequests:[],screenshots:[]};
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
await fs.mkdir(args.output);
const source=JSON.parse(await fs.readFile('tmp/heart-learning/u2netp-balanced-body-expanded-pipeline-v1/report.json'));
const angel=source.rows.find(r=>r.id==='real-4066fe9f9aafb3e4-body-1'&&r.method==='fallback');
assert.equal(createHash('sha256').update(await fs.readFile(angel.source)).digest('hex'),angel.sourceSha256);
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROME?{executablePath:process.env.PLAYWRIGHT_CHROME}:{})});
const check=async(name,detail)=>{report.checks.push({name,detail});await save();console.log(name);};
async function context(){
 const c=await browser.newContext({viewport:{width:1280,height:950}});
 await c.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!==new URL(args.origin).origin){report.externalRequests.push(u.origin);return route.abort();}
  if(u.pathname.endsWith('.onnx'))report.modelRequests++;
  return route.continue();
 });
 const page=await c.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{
  window.__cropEvents=[];window.__results=[];window.__terminated=[];
  let next=0;const seen=new WeakMap(),post=Worker.prototype.postMessage,terminate=Worker.prototype.terminate;
  Worker.prototype.postMessage=function(...args){
   if(!seen.has(this)){
    const id=++next;seen.set(this,id);
    this.addEventListener('message',({data})=>{
     if(data.type==='crops')window.__cropEvents.push({worker:id,...data});
     if(data.type==='result')window.__results.push({worker:id,...data});
    });
   }
   return post.apply(this,args);
  };
  Worker.prototype.terminate=function(){window.__terminated.push(seen.get(this));return terminate.call(this);};
 });
 await page.goto(args.origin+'/editor/mal/',{waitUntil:'networkidle'});
 return{c,page};
}
async function upload(page,file){
 await page.getByRole('button',{name:'Importér billede',exact:true}).first().click();
 await page.locator('#paint-import-title').waitFor();
 await page.locator('input[type=file]').setInputFiles(file);
 await page.locator('.photo img').waitFor();
}
async function crop(page,count=1){
 await page.waitForFunction(n=>window.__cropEvents.length>=n,count,{timeout:60000});
 return page.evaluate(()=>window.__cropEvents.at(-1));
}
try{
 const normal=await context();
 await upload(normal.page,angel.source);
 const answer=await crop(normal.page);
 report.angel={quad:answer.crops.candidates[0]?.quad,review:answer.crops.bodyReview};
 assert.equal(answer.crops.bodyReview?.selected,'learned');assert.equal(answer.crops.candidates[0].needsReview,true);
 assert.deepEqual(answer.crops.candidates[0].quad,angel.selectedCrop.quad);
 await normal.page.getByRole('button',{name:'Brug som maske',exact:true}).waitFor();
 await normal.page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Brug som maske'&&!b.disabled));
 assert.equal(await normal.page.locator('.photo .corner').count(),4);
 await normal.page.screenshot({path:path.join(args.output,'angel-import.png'),fullPage:true});report.screenshots.push('angel-import.png');
 await check('Real upload loads local ONNX/WASM and reproduces the audited angel corners');
 await normal.page.getByRole('button',{name:'Brug som maske',exact:true}).click();
 await normal.page.getByRole('button',{name:'Find snit',exact:true}).click();
 await normal.page.waitForFunction(()=>window.__results.length>0,null,{timeout:150000});
 const solved=await normal.page.evaluate(()=>window.__results.at(-1).result.report);
 report.angel.uiSolve=solved;assert.equal(solved.templateChecksPassed,true);assert.equal(solved.validation.passed,true);assert.equal(solved.manufacturing.status,'pass');
 await normal.page.screenshot({path:path.join(args.output,'angel-solved.png'),fullPage:true});report.screenshots.push('angel-solved.png');
 await check('Imported angel solves through the actual Find snit flow with template and paper checks');
 await normal.c.close();

 const unavailable=await context();await unavailable.c.route('**/*.onnx',route=>route.abort('failed'));
 await upload(unavailable.page,angel.source);const fallback=await crop(unavailable.page);
 assert.equal(fallback.crops.bodyReview?.status,'unavailable');assert.equal(fallback.crops.candidates.length,1);
 await unavailable.page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Brug som maske'&&!b.disabled));
 await check('Missing model preserves editable production corners and mask preview');await unavailable.c.close();

 const cancelled=await context();let release,requested;
 const held=new Promise(resolve=>{release=resolve;}),seen=new Promise(resolve=>{requested=resolve;});let once=true;
 await cancelled.c.route('**/*.onnx',async route=>{
  if(once){once=false;requested();await held;}
  try{await route.continue();}catch{/* The cancelled worker aborts its request. */}
 });
 await upload(cancelled.page,angel.source);await seen;
 await cancelled.page.keyboard.press('Escape');await cancelled.page.locator('#paint-import-title').waitFor({state:'hidden'});
 assert.ok((await cancelled.page.evaluate(()=>window.__terminated)).length>0);release();
 await upload(cancelled.page,angel.source);const fresh=await crop(cancelled.page);
 assert.equal(fresh.crops.bodyReview.selected,'learned');
 const state=await cancelled.page.evaluate(()=>({events:window.__cropEvents,terminated:window.__terminated}));
 assert.ok(state.events.every(e=>!state.terminated.includes(e.worker)));
 await check('Closing during model loading terminates the worker; reopening produces no stale result');await cancelled.c.close();

 const crowded=await context();const fixture=heartPhoto({width:700,hearts:[[190,80,85,75,-85,75],[520,80,85,75,-85,75]]});
 await upload(crowded.page,{name:'two-hearts.png',mimeType:'image/png',buffer:fixture.canvas.toBuffer('image/png')});
 const multiple=await crop(crowded.page);report.crowdedStatus=multiple.crops.status;
 assert.equal(multiple.crops.status,'needs_selection');assert.equal(multiple.crops.candidates.length,0);
 await check('A genuinely crowded frame still asks the user to select one heart');await crowded.c.close();
 assert.deepEqual(report.errors,[]);assert.ok(report.modelRequests>0);
 report.status='complete';report.passed=true;await save();
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}
finally{await browser.close();}
